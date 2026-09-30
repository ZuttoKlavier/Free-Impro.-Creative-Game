import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate, createHash } from 'node:crypto';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { prepareCertificates } from '../../scripts/https-certificates.js';
import { startLanServer } from '../../server/lan.js';

test('HTTPS teacher and tablet flows use the shared classroom URL, secure login, recording and offline restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'free-impro-https-browser-'));
  let app, browser;
  try {
    prepareCertificates({ directory: dir, hosts: ['127.0.0.1', 'localhost'] });
    const certificate = new X509Certificate(readFileSync(join(dir, 'server.crt')));
    const pin = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    app = await startLanServer({ certDirectory: dir, dbPath: ':memory:', port: 0, setupPort: 0, bind: '127.0.0.1' });
    // Only this disposable test browser accepts this one temporary certificate.
    // Node HTTPS tests separately verify the CA chain; no system trust is changed.
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, args: [`--ignore-certificate-errors-spki-list=${pin}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const teacherContext = await browser.newContext(), studentContext = await browser.newContext({ viewport: { width: 800, height: 1100 }, hasTouch: true });
    const teacher = await teacherContext.newPage(), student = await studentContext.newPage();
    async function register(page, url, role) {
      await page.goto(role === 'teacher' ? new URL('teacher.html', url).href : url); await page.locator('#classroom-tab').click();
      await page.locator('#mode-register').click(); await page.locator('#auth-name').fill(role === 'teacher' ? 'HTTPS 老师' : 'HTTPS 学生');
      await page.locator('#auth-username').fill(role + '_https');
      await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
      await expect(page.locator('#signed-in')).toBeVisible();
      await expect(page.locator('#offline-ready')).toHaveText('已准备离线创作');
      expect(await page.evaluate(() => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia)).toBe(true);
    }
    await register(teacher, app.classroomUrl.replace('127.0.0.1', 'localhost'), 'teacher');
    await teacher.locator('#class-name').fill('平板 HTTPS 课堂'); await teacher.locator('#create-form button').click();
    await expect(teacher.locator('.room-code strong')).toBeVisible();
    const code = await teacher.locator('.room-code strong').textContent();
    const expectedQR = await QRCode.toDataURL(app.classroomUrl + '?class=' + code, { width: 140, margin: 1 });
    const expectedPixels = PNG.sync.read(Buffer.from(expectedQR.split(',')[1], 'base64')).data;
    await expect.poll(async () => {
      const src = await teacher.locator('#room-qr').getAttribute('src');
      return !!src && PNG.sync.read(Buffer.from(src.split(',')[1], 'base64')).data.equals(expectedPixels);
    }).toBe(true);
    await register(student, app.classroomUrl + '?class=' + code, 'student');
    await student.locator('#join-form button').click(); await expect(student.locator('.room-title h2')).toHaveText('平板 HTTPS 课堂');
    const session = (await studentContext.cookies()).find(cookie => cookie.name === 'fi_session_student');
    expect(session.secure).toBe(true); expect(session.httpOnly).toBe(true);
    await student.locator('#studio-tab').click(); await student.locator('#record').click();
    await expect(student.locator('#record')).toContainText('结束录音');
    await expect(student.locator('#record-status')).toContainText('麦克风已关闭', { timeout: 19000 });
    await student.locator('#demo').click(); await student.locator('#sound-name').fill('HTTPS 杯子'); await student.locator('#save').click();
    await expect(student.locator('#library-count')).toHaveText('1');
    await student.locator('#classroom-tab').click(); await student.locator('#send-sound').click(); await student.locator('#submit-dialog button[value="submit"]').click();
    await expect(student.locator('.submission-item strong')).toHaveText('HTTPS 杯子');
    await teacher.locator('#refresh-class').click(); await expect(teacher.locator('.teacher-waiting')).toContainText('HTTPS 杯子');
    await student.waitForFunction(() => !!navigator.serviceWorker.controller);
    await studentContext.setOffline(true); await student.close();
    const reopened = await studentContext.newPage(); await reopened.goto(app.classroomUrl + '?class=' + code);
    await expect(reopened.locator('#connection-note')).toContainText('连接中断');
    await reopened.locator('#library-tab').click(); await expect(reopened.locator('.sound-card h3')).toHaveText('HTTPS 杯子');
    await studentContext.setOffline(false);
    await reopened.goto(app.classroomUrl + 'connection'); await expect(reopened.locator('#checks')).toContainText('课堂服务：已连接');
    await reopened.locator('#test-mic').click(); await expect(reopened.locator('#mic-result')).toContainText('麦克风权限已允许');
    await reopened.screenshot({ path: 'test-results/https/connection.png', fullPage: true });
  } finally { await browser?.close(); await app?.close(); rmSync(dir, { recursive: true, force: true }); }
});
