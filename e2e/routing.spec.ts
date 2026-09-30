import { expect, test } from '@playwright/test';

const MP = process.env.NEXT_PUBLIC_MANAGER_PATH ?? 'gestor';

test('manager routing hides the internal path and requires login', async ({ page, request }) => {
  expect((await request.get('/manager')).status()).toBe(404);
  await page.goto(`/${MP}`);
  await expect(page).toHaveURL(new RegExp(`/${MP}/login`));
});
