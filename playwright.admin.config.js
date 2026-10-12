import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['browser/admin-console.spec.js', 'admin-browser/*.spec.js'],
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4307', channel: process.env.PLAYWRIGHT_CHANNEL || undefined, viewport: { width: 1280, height: 900 } },
  webServer: { command: 'node tests/helpers/admin-browser-server.js', url: 'http://127.0.0.1:4307/api/health', reuseExistingServer: false, timeout: 30000 },
});
