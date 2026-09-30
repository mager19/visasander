import { expect, test as setup } from '@playwright/test';

const MP = process.env.NEXT_PUBLIC_MANAGER_PATH ?? 'gestor';
const PASSWORD = process.env.E2E_MANAGER_PASSWORD ?? '';

setup('manager logs in once', async ({ page }) => {
  setup.skip(!PASSWORD, 'Set E2E_MANAGER_PASSWORD');
  await page.goto(`/${MP}/login`);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitudes' })).toBeVisible();
  await page.context().storageState({ path: '.auth/manager.json' });
});
