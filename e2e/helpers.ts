import { expect, type Locator } from '@playwright/test';

/**
 * Hydration-safe typing: in dev mode a controlled input can lose a value typed before
 * hydration, leaving the submit button disabled. Retry fill until the button enables.
 */
export async function fillUntilEnabled(input: Locator, value: string, submit: Locator) {
  await expect(async () => {
    await input.fill(value);
    await expect(submit).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}
