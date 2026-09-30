import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { fillUntilEnabled } from './helpers';

const MP = process.env.NEXT_PUBLIC_MANAGER_PATH ?? 'gestor';
const PASSWORD = process.env.E2E_MANAGER_PASSWORD ?? '';

// Session saved by e2e/auth.setup.ts; it does not exist when the password is missing (tests skip).
test.use({ storageState: PASSWORD ? '.auth/manager.json' : undefined });

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// The manager session comes from e2e/auth.setup.ts (storageState), so the test `page` is already logged in.
async function openManagerList(page: Page) {
  await page.goto(`/${MP}`);
  await expect(page.getByRole('heading', { name: 'Solicitudes' })).toBeVisible();
}

// Applicant side runs in a FRESH context: no manager cookie, no stale applicant cookie.
async function newApplicantPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ ...test.info().project.use, storageState: undefined });
  return { page: await context.newPage(), close: () => context.close() };
}

async function createApplication(page: Page, name: string) {
  const create = page.getByRole('button', { name: 'Crear solicitud' });
  await fillUntilEnabled(page.getByLabel('Nombre del cliente'), name, create);
  await create.click();
  const link = (await page.getByTestId('new-link').textContent())!;
  const code = (await page.getByTestId('new-code').textContent())!;
  // Only the path is used, so an APP_URL pointing at production can never be visited.
  return { link: new URL(link.trim()).pathname, code: code.trim() };
}

/** Fills every empty visible field; repeats while a pass changed something (conditional fields). Returns nothing. */
async function fillVisibleFields(page: Page) {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const el of await page.locator('[data-field]').all()) {
      const type = await el.getAttribute('data-type');
      const key = (await el.getAttribute('data-field'))!;
      if (type === 'yesno') {
        if ((await el.getByRole('radio', { checked: true }).count()) === 0) {
          await el.getByRole('radio', { name: 'No' }).click();
          changed = true;
        }
      } else if (type === 'select' && (await el.getAttribute('role')) === 'radiogroup') {
        // Short selects render as segmented radios.
        if ((await el.getByRole('radio', { checked: true }).count()) === 0) {
          await el.getByRole('radio').first().click();
          changed = true;
        }
      } else if (type === 'select' || type === 'co_department') {
        if (!(await el.inputValue())) {
          await el.selectOption({ index: 1 }); // waits until the lazy department list is enabled
          changed = true;
        }
      } else if (type === 'date') {
        changed = (await fillDate(el, key)) || changed;
      } else if (type === 'co_city') {
        const input = el.getByRole('combobox');
        // Disabled until a department is chosen; the next pass picks it up.
        if (!(await input.inputValue()) && (await input.isEnabled())) {
          await input.click();
          await el.getByRole('option').first().click();
          await expect(input).not.toHaveValue('');
          changed = true;
        }
      } else if (type === 'multiselect') {
        if ((await el.getByRole('checkbox', { checked: true }).count()) === 0) {
          await el.getByRole('checkbox').first().click();
          changed = true;
        }
      } else if (!(await el.inputValue())) {
        // Digits-only fields (e.g. cédula) render with inputmode="numeric".
        const numeric = (await el.getAttribute('inputmode')) === 'numeric';
        const value = type === 'email' ? 'a@b.co' : type === 'tel' ? '3001234567' : type === 'number' ? '1000' : numeric ? '1234567890' : 'Prueba';
        await el.fill(value);
        changed = true;
      }
    }
    if (!changed) return;
  }
}

/** Deterministic dates per key; all fall inside the field's dateBounds for any "today" in 2026-2030. */
const DATE_TARGETS: Record<string, string> = {
  fecha_nacimiento: '1990-05-15',
  pasaporte_expedicion: '2022-01-10',
  pasaporte_caducidad: '2031-01-10',
  padre_nacimiento: '1960-03-10',
  madre_nacimiento: '1962-07-20',
  empresa_inicio: '2021-02-01',
};

/** Sets the Día / Mes / Año selects (year first so the month and day lists match it). Returns true if it changed anything. */
async function fillDate(el: Locator, key: string): Promise<boolean> {
  const part = (p: string) => el.locator(`[data-part="${p}"]`);
  const filled = await Promise.all(['day', 'month', 'year'].map((p) => part(p).inputValue()));
  if (filled.every(Boolean)) return false;
  const target = DATE_TARGETS[key];
  if (target) {
    const [y, m, d] = target.split('-');
    await part('year').selectOption(y);
    await part('month').selectOption(m);
    await part('day').selectOption(d);
  } else {
    // Generic fallback: a mid-range year from the offered list, then the first month and day it allows.
    const years = await part('year').locator('option:not([value=""])').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    await part('year').selectOption(years[Math.floor(years.length / 2)]);
    await part('month').selectOption({ index: 1 });
    await part('day').selectOption({ index: 1 });
  }
  await expect(part('day')).not.toHaveValue('');
  return true;
}

/**
 * Stamps the current step element, runs `action`, and waits until the wizard rendered a new step
 * (the step element is keyed per index, so a new element appears without the stamp).
 */
async function advance(page: Page, action: () => Promise<unknown>) {
  await page.locator('main[data-step]').evaluate((el) => el.setAttribute('data-e2e-stamp', '1'));
  await action();
  await expect(page.locator('main[data-step]:not([data-e2e-stamp])')).toBeVisible({ timeout: 30_000 });
}

const isAnswersSave = (r: { url(): string; request(): { method(): string }; ok(): boolean }) =>
  r.url().includes('/answers') && r.request().method() === 'PATCH' && r.ok();

/**
 * Called on "Ocupación" with its fields filled but NOT submitted: the jump must save them first.
 * Jumps back to "Información personal" and then to the section it came from, via the "Secciones" sheet.
 */
async function checkSectionNavigation(page: Page) {
  const breadcrumb = page.getByTestId('breadcrumb');
  const sheet = page.getByRole('dialog', { name: 'Secciones' });
  await expect(breadcrumb).toContainText('Trabajo y estudios');
  await expect(breadcrumb).toContainText('Ocupación');

  await page.getByTestId('sections-button').click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('section-row-personal')).toContainText('Completa');
  await expect(sheet.getByTestId('section-row-work')).toContainText('En curso');
  // Leaving a question screen saves what was typed on it.
  await advance(page, () => Promise.all([
    page.waitForResponse(isAnswersSave),
    sheet.getByTestId('section-row-personal').click(),
  ]));
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('sections-button')).toBeFocused();
  await expect(breadcrumb).toContainText('Información personal');
  await expect(page.locator('main[data-step] h1')).toHaveText('Información personal');

  await page.getByTestId('sections-button').click();
  await expect(sheet.getByTestId('section-row-personal')).toContainText('En curso');
  await advance(page, () => sheet.getByTestId('section-row-work').click());
  await expect(breadcrumb).toContainText('Trabajo y estudios');
  // "Ocupación" was saved by the jump, so the section resumes on its next incomplete screen.
  await expect(page.locator('main[data-step]')).toHaveAttribute('data-step', 'screen');
  await expect(page.locator('main[data-step] h1')).not.toHaveText('Ocupación');
}

test('full applicant journey is visible to the manager at 100%', async ({ page: manager, browser }) => {
  test.skip(!PASSWORD, 'Set E2E_MANAGER_PASSWORD');
  test.setTimeout(600_000);
  const name = `Cliente E2E ${Date.now()}`;
  await openManagerList(manager);
  const { link, code } = await createApplication(manager, name);

  const { page, close } = await newApplicantPage(browser);
  try {
    await page.goto(link);
    const enter = page.getByRole('button', { name: 'Entrar' });
    await fillUntilEnabled(page.getByLabel('Código de acceso'), code, enter);
    await enter.click();
    await expect(page.locator('main[data-step]')).toBeVisible();

    let navChecked = false;
    for (let guard = 0; guard < 120; guard++) {
      const kind = await page.locator('main[data-step]').getAttribute('data-step');
      if (kind === 'chapter') {
        await advance(page, () => page.getByRole('button', { name: 'Empezar' }).click());
      } else if (kind === 'screen') {
        const none = page.getByRole('checkbox', { name: 'Ninguno / No aplica' });
        if ((await none.count()) > 0) await none.click();
        else await fillVisibleFields(page);
        if (!navChecked && (await page.locator('main[data-step] h1').first().textContent()) === 'Ocupación') {
          navChecked = true;
          await checkSectionNavigation(page);
          continue; // back in "Trabajo y estudios" on its first incomplete screen
        }
        await advance(page, () => Promise.all([
          page.waitForResponse(isAnswersSave),
          page.getByRole('button', { name: 'Siguiente' }).click(),
        ]));
      } else if (kind === 'files') {
        for (const k of ['passport', 'photo', 'national_id']) {
          await Promise.all([
            page.waitForResponse((r) => r.url().includes('/files/complete') && r.ok()),
            page.getByTestId(`file-input-${k}`).setInputFiles({ name: `${k}.png`, mimeType: 'image/png', buffer: PNG }),
          ]);
          await expect(page.locator(`[data-file-kind="${k}"]`).getByText('Archivo 1 subido')).toBeVisible({ timeout: 30_000 });
        }
        await advance(page, () => page.getByRole('button', { name: 'Continuar a revisión' }).click());
      } else if (kind === 'review') break;
      else throw new Error(`Unexpected data-step "${kind}"`);
    }
    expect(navChecked, 'section navigation check ran').toBe(true);

    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByTestId('submitted')).toBeVisible();
  } finally {
    await close();
  }

  await manager.goto(`/${MP}`);
  await manager.getByRole('link', { name }).click();
  await expect(manager.getByTestId('progress-percent')).toHaveText('100%');
});

test('five wrong codes lock the application and the manager can unlock it', async ({ page: manager, browser }) => {
  test.skip(!PASSWORD, 'Set E2E_MANAGER_PASSWORD');
  const name = `Cliente Bloqueo ${Date.now()}`;
  await openManagerList(manager);
  const { link, code } = await createApplication(manager, name);
  const wrong = code === '000000' ? '111111' : '000000';

  const { page, close } = await newApplicantPage(browser);
  try {
    await page.goto(link);
    const enter = page.getByRole('button', { name: 'Entrar' });
    for (let i = 1; i <= 5; i++) {
      await fillUntilEnabled(page.getByLabel('Código de acceso'), wrong, enter);
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/access') && r.request().method() === 'POST'),
        enter.click(),
      ]);
      expect(res.status(), `attempt ${i}`).toBe(i < 5 ? 401 : 423);
    }
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Acceso bloqueado' })).toBeVisible({ timeout: 15_000 });

    await manager.goto(`/${MP}`);
    await manager.getByRole('link', { name }).click();
    await manager.getByRole('button', { name: 'Desbloquear' }).click();
    // Wait for the unlock to commit before the applicant reloads.
    await expect(manager.getByText('Solicitud desbloqueada')).toBeVisible();
    await page.goto(link);
    await expect(page.getByLabel('Código de acceso')).toBeVisible();
  } finally {
    await close();
  }
});
