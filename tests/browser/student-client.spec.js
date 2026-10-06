import { test, expect } from '@playwright/test';

test('student app profile captures photos internally and exports backups through its scoped file bridge', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 FreeImproStudent/1' });
  await context.addInitScript(() => {
    window.exportedChunks = [];
    window.FreeImproFiles = { begin(name, mime) { window.exportedName = name; window.exportedMime = mime; return 'test-export'; }, append(id, chunk) { window.exportedChunks.push(chunk); return true; }, finish() { window.exportFinished = true; return true; } };
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => { const stream = await getMedia(constraints); window.cameraTracks = stream.getTracks(); return stream; };
  });
  try {
    const page = await context.newPage(); await page.goto('/'); await page.locator('#classroom-tab').click(); await expect(page.locator('.auth-tabs')).toBeHidden();
    await expect(page.locator('#auth-role')).toBeHidden(); await expect(page.locator('#classroom-connection')).toBeHidden();
    await page.locator('#library-tab').click(); await page.locator('#demo').click(); await page.locator('#sound-name').fill('应用内照片声音'); await page.locator('#save').click();
    await page.locator('#library-tab').click(); await page.locator('.sound-open').click(); await page.locator('.character-edit').click();
    await expect(page.locator('#import-photo')).toBeHidden();
    await page.locator('#take-photo').click(); await expect(page.locator('[data-shoot]')).toBeEnabled();
    await page.locator('[data-shoot]').click(); await expect(page.locator('#crop-editor')).toBeVisible();
    expect(await page.evaluate(() => window.cameraTracks.every(track => track.readyState === 'ended'))).toBe(true);
    await page.locator('#save-character').click(); await expect(page.locator('#toast')).toContainText('照片草稿已保存');
    await page.locator('#library-tab').click(); await page.locator('#export').click();
    await expect(page.locator('#toast')).toContainText('备份已保存');
    const exported = await page.evaluate(() => {
      const binary = window.exportedChunks.map(chunk => atob(chunk)).join('');
      return { done: window.exportFinished, mime: window.exportedMime, data: JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)))) };
    });
    expect(exported.done).toBe(true); expect(exported.mime).toBe('application/json'); expect(exported.data.sounds[0].photo).toMatch(/^data:image\/png/);
    expect(exported.data.sounds[0].name).toBe('应用内照片声音');
    await page.evaluate(() => {
      window.FreeImproFiles.append = () => false;
      window.FreeImproFiles.cancel = id => { window.cancelledExport = id; };
    });
    await page.locator('#export').click();
    await expect(page.locator('#toast')).toContainText('文件保存失败');
    expect(await page.evaluate(() => window.cancelledExport)).toBe('test-export');
    await expect(page.locator('.sound-card')).toHaveCount(1);
  } finally { await context.close(); }
});
