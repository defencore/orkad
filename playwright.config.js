import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 120000,
  workers: 1,
  use: { baseURL: process.env.ORKAD_TEST_URL || 'http://localhost:8080', channel: 'chrome', headless: true, launchOptions: { args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
});
