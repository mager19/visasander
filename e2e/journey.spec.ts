import { expect, test, type Page } from '@playwright/test';

const MP = process.env.NEXT_PUBLIC_MANAGER_PATH ?? 'gestor';
const PASSWORD = process.env.E2E_MANAGER_PASSWORD ?? '';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function managerLogin(page: Page) {
  await page.goto(`/${MP}/login`);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitudes' })).toBeVisible();
}

async function createApplication(page: Page, name: string) {
  await page.getByLabel('Nombre del cliente').fill(name);
  await page.getByRole('button', { name: 'Crear solicitud' }).click();
  const link = (await page.getByTestId('new-link').textContent())!;
  const code = (await page.getByTestId('new-code').textContent())!;
  return { link, code };
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

test('full applicant journey is visible to the manager at 100%', async ({ page }) => {
  test.skip(!PASSWORD, 'Set E2E_MANAGER_PASSWORD');
  const name = `Cliente E2E ${Date.now()}`;
  await managerLogin(page);
  const { link, code } = await createApplication(page, name);

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

  await page.goto(`/${MP}`);
  await page.getByRole('link', { name }).click();
  await expect(page.getByTestId('progress-percent')).toHaveText('100%');
});

test('five wrong codes lock the application and the manager can unlock it', async ({ page }) => {
  test.skip(!PASSWORD, 'Set E2E_MANAGER_PASSWORD');
  const name = `Cliente Bloqueo ${Date.now()}`;
  await managerLogin(page);
  const { link, code } = await createApplication(page, name);
  const wrong = code === '000000' ? '111111' : '000000';

  await page.goto(link);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Código de acceso').fill(wrong);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForTimeout(300);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Acceso bloqueado' })).toBeVisible();

  await page.goto(`/${MP}`);
  await page.getByRole('link', { name }).click();
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto(link);
  await expect(page.getByLabel('Código de acceso')).toBeVisible();
});

test('manager routing hides the internal path and requires login', async ({ page, request }) => {
  expect((await request.get('/manager')).status()).toBe(404);
  await page.goto(`/${MP}`);
  await expect(page).toHaveURL(new RegExp(`/${MP}/login`));
});
