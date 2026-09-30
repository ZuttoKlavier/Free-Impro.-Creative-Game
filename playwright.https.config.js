import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/https-browser', outputDir: './test-results/https', workers: 1, timeout: 60000 });
