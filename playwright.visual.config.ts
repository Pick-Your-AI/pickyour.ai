import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/visual',
  outputDir: 'test-results-visual',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-visual' }]],
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:4318',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    launchOptions: { args: ['--disable-lcd-text'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4318',
    url: 'http://localhost:4318',
    reuseExistingServer: false,
  },
});
