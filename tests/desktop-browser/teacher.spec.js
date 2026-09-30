import { test, expect, _electron } from '@playwright/test';
import electronPath from 'electron';
import { mkdtempSync, cpSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { prepareCertificates } from '../../scripts/https-certificates.js';
import { startLanServer } from '../../server/lan.js';

test('desktop teacher connects through its classroom CA and opens only the independent teacher workspace', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'teacher-desktop-')), stage = join(dir, 'app');
  let server, application;
  try {
    const packaged = process.env.TEACHER_DESKTOP_EXECUTABLE;
    const certDirectory = packaged ? resolve('data/https') : join(dir, 'certs');
    if (!packaged) prepareCertificates({ directory: certDirectory, hosts: ['127.0.0.1'] });
    server = await startLanServer({ certDirectory, dbPath: ':memory:', port: 0, setupPort: 0, bind: '127.0.0.1' });
    const address = `https://127.0.0.1:${server.server.address().port}/`;
    cpSync(resolve('desktop'), stage, { recursive: true });
    copyFileSync(join(certDirectory, 'classroom-ca.crt'), join(stage, 'classroom-ca.crt'));
    writeFileSync(join(stage, 'classroom.json'), JSON.stringify({ address }));
    application = await _electron.launch({ executablePath: packaged || electronPath, args: packaged ? [] : [stage], env: { ...process.env, FREE_IMPRO_DESKTOP_PROFILE: join(dir, 'profile') } });
    const page = await application.firstWindow();
    await expect(page.locator('#address')).toBeVisible(); await page.locator('#address').fill(address);
    await page.locator('#connection button').click();
    await expect(page).toHaveURL(address + 'teacher.html');
    await expect(page.locator('#record, #library-tab, #join-form')).toHaveCount(0);
    await page.locator('#mode-register').click(); await page.locator('#auth-name').fill('桌面老师'); await page.locator('#auth-username').fill('desktop_teacher'); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
    await expect(page.locator('#create-form')).toBeVisible();
    await page.locator('#class-name').fill('独立桌面课堂'); await page.locator('#create-form button').click();
    await expect(page.locator('.room-code strong')).toBeVisible();
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
    expect(await page.evaluate(async () => { try { await window.teacherConnection.connect('https://evil.test/'); return 'allowed'; } catch { return 'denied'; } })).toBe('denied');
    await page.evaluate(() => window.open('https://example.com'));
    expect(application.windows()).toHaveLength(1);
    await page.screenshot({ path: 'test-results/desktop/teacher-workspace.png', fullPage: true });
  } finally { await application?.close(); await server?.close(); rmSync(dir, { recursive: true, force: true }); }
});
