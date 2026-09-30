import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const appOrigin = process.env.TEST_APP_ORIGIN = 'http://127.0.0.1:4174';
const testDB = join(mkdtempSync(join(tmpdir(), 'free-impro-browser-')), 'classroom.sqlite');
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: appOrigin, channel: process.env.PLAYWRIGHT_CHANNEL || undefined, viewport: { width: 1280, height: 900 }, launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } },
  webServer: [
    { command: 'npm run server', url: 'http://127.0.0.1:3002/api/health', env: { API_PORT: '3002', FREE_IMPRO_DB: testDB }, reuseExistingServer: false },
    { command: 'npm run dev -- --port 4174 --strictPort', url: appOrigin, env: { API_PORT: '3002' }, reuseExistingServer: false },
  ],
});
