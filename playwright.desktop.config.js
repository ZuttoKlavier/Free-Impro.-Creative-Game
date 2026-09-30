import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/desktop-browser', outputDir: './test-results/desktop', workers: 1, timeout: 60000 });
