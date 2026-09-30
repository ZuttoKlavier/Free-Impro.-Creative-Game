import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  testDir: './tests/offline-browser',
  outputDir: './test-results/offline',
  workers: 1,
  webServer: [base.webServer[0], {
    command: 'npm run preview -- --port 4174 --host 127.0.0.1 --strictPort',
    url: base.use.baseURL,
    env: { API_PORT: '3002' },
    reuseExistingServer: false,
  }],
});
