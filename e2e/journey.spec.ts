import { expect, test, type Browser, type Page } from '@playwright/test';
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
      } else if (type === 'select') {
        if (!(await el.inputValue())) {
          await el.selectOption({ index: 1 });
          changed = true;
        }
      } else if (!(await el.inputValue())) {
        const value = type === 'date' ? (key.includes('caducidad') || key === 'fin' || key === 'hasta' ? '2032-01-01' : '2020-01-01')
          : type === 'email' ? 'a@b.co' : type === 'tel' ? '3001234567' : type === 'number' ? '1000' : 'Prueba';
        await el.fill(value);
        changed = true;
      }
    }
    if (!changed) return;
  }
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

    for (let guard = 0; guard < 120; guard++) {
      const kind = await page.locator('main[data-step]').getAttribute('data-step');
      if (kind === 'chapter') {
        await advance(page, () => page.getByRole('button', { name: 'Empezar' }).click());
      } else if (kind === 'screen') {
        const none = page.getByRole('checkbox', { name: 'Ninguno / No aplica' });
        if ((await none.count()) > 0) await none.click();
        else await fillVisibleFields(page);
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
