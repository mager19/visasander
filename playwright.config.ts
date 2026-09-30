import { config } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Real environment variables win over .env.local (dotenv does not override).
config({ path: '.env.local' });

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', ...devices['Pixel 7'] },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    // Logs the manager in ONCE per run (login is rate limited to 5 per 15 minutes per IP).
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // Credentialed journeys; they reuse the manager session saved by "setup" (see test.use in the spec).
    { name: 'journey', testMatch: /journey\.spec\.ts/, dependencies: ['setup'] },
    // Needs no DB and no credentials; must not depend on "setup".
    { name: 'routing', testMatch: /routing\.spec\.ts/ },
  ],
});
