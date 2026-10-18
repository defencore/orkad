import { defineConfig } from '@playwright/test';
const localURL = process.env.CI ? 'http://localhost:8081' : 'http://localhost:8080';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 120000,
  workers: 1,
  webServer: process.env.ORKAD_TEST_URL
    ? undefined
    : {
        command: process.env.CI ? 'npm run preview' : 'npm run dev',
        url: localURL,
        reuseExistingServer: !process.env.CI,
      },
  use: {
    baseURL: process.env.ORKAD_TEST_URL || localURL,
    channel: process.env.CI ? undefined : 'chrome',
    headless: true,
    launchOptions: { args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
});
