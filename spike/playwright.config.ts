import { defineConfig } from '@playwright/test';

/**
 * Base URL of the ORDS app root (everything up to and including the app alias).
 * Override with APEX_BASE_URL if the instance moves.
 */
export const APP_BASE =
  process.env.APEX_BASE_URL ??
  'https://g9323cdc071900d-tjta51y2tod5o8ej.adb.us-ashburn-1.oraclecloudapps.com/ords/r/satwik/ux-pattern-catalog';

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/**/*.spec.ts', 'tests-generated/**/*.spec.ts'],
  timeout: 90_000, // Autonomous DB cold start can take 15-20s alone
  retries: 0,
  reporter: [['list']],
  workers: 1, // serial: first test warms the instance for the rest
  use: {
    baseURL: APP_BASE,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
