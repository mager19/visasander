import { expect, test, type Browser, type Page } from '@playwright/test';

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
  await page.getByLabel('Nombre del cliente').fill(name);
  await page.getByRole('button', { name: 'Crear solicitud' }).click();
  const link = (await page.getByTestId('new-link').textContent())!;
  const code = (await page.getByTestId('new-code').textContent())!;
  // Only the path is used, so an APP_URL pointing at production can never be visited.
  return { link: new URL(link.trim()).pathname, code: code.trim() };
}

async function fillVisibleFields(page: Page) {
  for (let pass = 0; pass < 3; pass++) {
    for (const el of await page.locator('[data-field]').all()) {
      const type = await el.getAttribute('data-type');
      const key = (await el.getAttribute('data-field'))!;
      if (type === 'yesno') {
        if ((await el.getByRole('radio', { checked: true }).count()) === 0) await el.getByRole('radio', { name: 'No' }).click();
      } else if (type === 'select') {
        if (!(await el.inputValue())) await el.selectOption({ index: 1 });
      } else if (!(await el.inputValue())) {
        const value = type === 'date' ? (key.includes('caducidad') || key === 'fin' || key === 'hasta' ? '2032-01-01' : '2020-01-01')
          : type === 'email' ? 'a@b.co' : type === 'tel' ? '3001234567' : type === 'number' ? '1000' : 'Prueba';
        await el.fill(value);
      }
    }
  }
}

test('full applicant journey is visible to the manager at 100%', async ({ page: manager, browser }) => {
  test.skip(!PASSWORD, 'Set E2E_MANAGER_PASSWORD');
  const name = `Cliente E2E ${Date.now()}`;
  await openManagerList(manager);
  const { link, code } = await createApplication(manager, name);

  const { page, close } = await newApplicantPage(browser);
  await page.goto(link);
  await page.getByLabel('Código de acceso').fill(code);
  await page.getByRole('button', { name: 'Entrar' }).click();

  for (let guard = 0; guard < 120; guard++) {
    const kind = await page.locator('main[data-step]').getAttribute('data-step');
    if (kind === 'chapter') await page.getByRole('button', { name: 'Empezar' }).click();
    else if (kind === 'screen') {
      if ((await page.getByRole('checkbox', { name: 'Ninguno / No aplica' }).count()) > 0) await page.getByRole('checkbox', { name: 'Ninguno / No aplica' }).click();
      else await fillVisibleFields(page);
      await page.getByRole('button', { name: 'Siguiente' }).click();
    } else if (kind === 'files') {
      for (const k of ['passport', 'photo', 'national_id']) {
        await page.getByTestId(`file-input-${k}`).setInputFiles({ name: `${k}.png`, mimeType: 'image/png', buffer: PNG });
        await expect(page.locator(`[data-file-kind="${k}"]`).getByText('Archivo 1 subido')).toBeVisible({ timeout: 30_000 });
      }
      await page.getByRole('button', { name: 'Continuar a revisión' }).click();
    } else if (kind === 'review') break;
    await page.waitForTimeout(150);
  }

  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByTestId('submitted')).toBeVisible();

  await close();

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
  await page.goto(link);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Código de acceso').fill(wrong);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForTimeout(300);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Acceso bloqueado' })).toBeVisible();

  await manager.goto(`/${MP}`);
  await manager.getByRole('link', { name }).click();
  await manager.getByRole('button', { name: 'Desbloquear' }).click();
  // Wait for the unlock to commit before the applicant reloads.
  await expect(manager.getByText('Solicitud desbloqueada')).toBeVisible();
  await page.goto(link);
  await expect(page.getByLabel('Código de acceso')).toBeVisible();
  await close();
});
