import { test, expect } from '@playwright/test';

async function delayedPermissions(page) {
  await page.addInitScript(() => {
    window.mediaRequests = [];
    window.createdRecorders = 0;
    const Recorder = window.MediaRecorder;
    window.MediaRecorder = class extends Recorder {
      constructor(...args) { super(...args); window.createdRecorders++; }
    };
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      const request = { grant() {
        const audio = new AudioContext();
        request.stream = audio.createMediaStreamDestination().stream;
        resolve(request.stream);
      } };
      window.mediaRequests.push(request);
    });
  });
}

for (const event of ['freeimpro-background', 'pagehide']) {
  test(`student microphone permission resolved after ${event} cannot start a stale recording`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 FreeImproStudent/1' });
    try {
      const page = await context.newPage(); await delayedPermissions(page); await page.goto('/');
      await page.locator('#studio-tab').focus(); await page.keyboard.up('Space'); await page.keyboard.down('Space');
      await expect.poll(() => page.evaluate(() => window.mediaRequests.length)).toBe(1);
      // A native permission dialog may hide the document, without leaving the application.
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(page.locator('#record')).toBeDisabled();
      await page.evaluate(event => window.dispatchEvent(new Event(event)), event);
      await expect(page.locator('#record')).toBeEnabled();
      await page.locator('#studio-tab').focus(); await page.keyboard.up('Space'); await page.keyboard.down('Space');
      await expect.poll(() => page.evaluate(() => window.mediaRequests.length)).toBe(2);
      await page.evaluate(() => window.mediaRequests[0].grant());
      await expect.poll(() => page.evaluate(() => window.mediaRequests[0].stream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
      expect(await page.evaluate(() => window.createdRecorders)).toBe(0);
      await expect(page.locator('#record')).toBeDisabled();
      await page.evaluate(() => window.mediaRequests[1].grant());
      await expect(page.locator('#record')).toHaveClass(/recording/);
      expect(await page.evaluate(() => window.createdRecorders)).toBe(1);
      await page.evaluate(() => window.dispatchEvent(new Event('freeimpro-background')));
      await expect.poll(() => page.evaluate(() => window.mediaRequests[1].stream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
    } finally { await context.close(); }
  });
}

test('student camera permission survives a permission dialog but closes when the app leaves the foreground', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 FreeImproStudent/1' });
  try {
    const page = await context.newPage(); await delayedPermissions(page); await page.goto('/');
    await page.locator('#demo').click(); await page.locator('#sound-name').fill('权限恢复'); await page.locator('#save').click();
    await page.locator('#library-tab').click(); await page.locator('.sound-open').click(); await page.locator('.character-edit').click(); await page.locator('#take-photo').click();
    await expect.poll(() => page.evaluate(() => window.mediaRequests.length)).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('[data-shoot]')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('freeimpro-background')));
    await expect(page.locator('[data-shoot]')).toHaveCount(0);
    await page.evaluate(() => window.mediaRequests[0].grant());
    await expect.poll(() => page.evaluate(() => window.mediaRequests[0].stream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  } finally { await context.close(); }
});
