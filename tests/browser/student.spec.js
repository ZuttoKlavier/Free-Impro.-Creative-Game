import { test, expect } from '@playwright/test';
import { encodeWav } from '../../src/audio.js';

test('concurrent native backup events cannot overwrite an importing duplicate ID', async ({ page }) => {
  const audio = 'data:audio/wav;base64,' + Buffer.from(await encodeWav(new Float32Array(4800).fill(.1), 48000).arrayBuffer()).toString('base64');
  const backup = name => ({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'free-impro-sounds', version: 1, sounds: [{ id: 'shared-import-id', name, createdAt: 1, audio }] })) });
  await page.addInitScript(() => {
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = async function (...args) {
      window.__backupDecodeStarted = true;
      await new Promise(resolve => { window.__finishBackupDecode = resolve; });
      return decode.apply(this, args);
    };
  });
  await page.goto('/'); await page.locator('#backup-file').setInputFiles(backup('第一份备份'));
  await expect.poll(() => page.evaluate(() => window.__backupDecodeStarted)).toBe(true);
  await page.locator('#backup-file').setInputFiles(backup('第二份覆盖内容'));
  await expect(page.locator('#toast')).toContainText('正在检查上一份备份');
  await page.evaluate(() => window.__finishBackupDecode());
  await expect(page.locator('#library-count')).toHaveText('1');
  await page.locator('.sound-open').click(); await expect(page.locator('#sound-page h3')).toHaveText('第一份备份');
  await expect(page.locator('#restore')).toBeEnabled();
});

test('backup restores an ID deleted in another tab even when this page still displays the old library', async ({ page, context }) => {
  const audio = 'data:audio/wav;base64,' + Buffer.from(await encodeWav(new Float32Array(4800).fill(.1), 48000).arrayBuffer()).toString('base64');
  const backup = { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'free-impro-sounds', version: 1, sounds: [{ id: 'deleted-in-other-tab', name: '跨页恢复的声音', createdAt: 1, audio }] })) };
  await page.goto('/'); await page.locator('#backup-file').setInputFiles(backup);
  await expect(page.locator('#library-count')).toHaveText('1');
  const other = await context.newPage();
  try {
    await other.goto('/');
    await other.evaluate(async () => { const storage = await import('/src/storage.js'); await storage.deleteSound('deleted-in-other-tab'); });
    expect(await other.evaluate(async () => (await (await import('/src/storage.js')).listSounds()).length)).toBe(0);
    await expect(page.locator('#library-count')).toHaveText('1');
    await page.locator('#backup-file').setInputFiles(backup);
    await expect(page.locator('#toast')).toContainText('已导入 1 份');
    expect(await other.evaluate(async () => (await (await import('/src/storage.js')).listSounds())[0]?.name)).toBe('跨页恢复的声音');
  } finally { await other.close(); }
});

test('demo → independent slices → trim → save → refresh → rename → backup → delete → restore', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '试试示例声音' }).click();
  await expect(page.locator('#slices .slice')).toHaveCount(3);
  await page.locator('#trim-start').evaluate(el => { el.value = '0.300'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#trim-end').evaluate(el => { el.value = '2.000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await page.locator('#trim-duration').textContent()).toBe('1.000 秒');
  await page.getByRole('button', { name: '试听选中声音' }).click();
  await page.getByLabel('给声音起个名字').fill('杯子的声音');
  await page.getByRole('button', { name: '存入声音库' }).click();
  await expect(page.locator('#library-count')).toHaveText('1');
  await page.reload();
  await page.locator('#library-tab').click();
  await page.locator('.sound-open').click(); await expect(page.locator('#sound-page h3')).toHaveText('杯子的声音');
  await page.getByRole('button', { name: '命名', exact: true }).click();
  await page.getByLabel('声音新名称').fill('我的杯子');
  await page.getByRole('button', { name: '保存名称' }).click();
  await page.locator('.sound-open').click(); await expect(page.locator('#sound-page h3')).toHaveText('我的杯子');
  await page.locator('#library-tab').click(); const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '备份到本地' }).click();
  const backup = await (await download).path();
  await page.locator('.sound-open').click(); await page.getByRole('button', { name: '删除声音', exact: true }).click();
  await page.locator('#delete-dialog').getByRole('button', { name: '删除声音', exact: true }).click();
  await expect(page.locator('#library-count')).toHaveText('0');
  await page.locator('#backup-file').setInputFiles(backup);
  await page.locator('.sound-open').click(); await expect(page.locator('#sound-page h3')).toHaveText('我的杯子');
  await page.locator('#library-tab').click(); await page.locator('#backup-file').setInputFiles(backup);
  await expect(page.locator('#toast')).toContainText('已导入 0 份');
  expect(errors).toEqual([]);
});

test('real MediaRecorder lifecycle with synthetic browser microphone stops at 15 seconds', async ({ page }) => {
  await page.goto('/'); await page.locator('#studio-tab').focus(); await page.keyboard.down('Space');
  await expect(page.locator('#studio-tab')).toHaveClass(/recording/);
  await expect(page.locator('#record-status')).toContainText('麦克风已关闭', { timeout: 19000 });
  await expect(page.locator('#editor')).toBeVisible();
  const duration = parseFloat(await page.locator('#source-duration').textContent());
  expect(duration).toBeLessThanOrEqual(15);
});

test('permission rejection has clear recovery; small tablet layout does not overflow', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.setViewportSize({ width: 800, height: 1100 });
  await page.goto('/'); await page.locator('#studio-tab').focus(); await page.keyboard.down('Space');
  await expect(page.locator('#toast')).toContainText('没有麦克风权限');
  await expect(page.locator('#record')).toBeEnabled();
  await page.getByRole('button', { name: '试试示例声音' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/student-tablet.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('invalid backup leaves existing library untouched', async ({ page }) => {
  await page.goto('/');
  await page.locator('#backup-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"wrong"}') });
  await expect(page.locator('#toast')).toContainText('不是有效的声音库备份');
  await expect(page.locator('#library-count')).toHaveText('0');
});

test('waveform drag selects, moves and resizes; capture clamps outside bounds; saved duration matches', async ({ page }) => {
  await page.goto('/'); await page.locator('#demo').click();
  const box = await page.locator('#waveform').boundingBox();
  const x = t => box.x + box.width * t / 3, y = box.y + box.height / 2;
  async function drag(a, b) { await page.mouse.move(x(a), y); await page.mouse.down(); await page.mouse.move(x(b), y, { steps: 12 }); await page.mouse.up(); }
  const values = () => page.evaluate(() => ({ start: Number(document.querySelector('#trim-start').value), end: Number(document.querySelector('#trim-end').value) }));
  await drag(0.8, 2.4); // New selection is limited to 1s.
  let r = await values(); expect(r.start).toBeCloseTo(0.8, 2); expect(r.end - r.start).toBeCloseTo(1, 2);
  await drag(1.3, 1.8); // Move without changing duration.
  r = await values(); expect(r.start).toBeCloseTo(1.3, 2); expect(r.end).toBeCloseTo(2.3, 2);
  await drag(2.3, 2.0); // Resize right edge.
  r = await values(); expect(r.end).toBeCloseTo(2, 2);
  await drag(1.3, 1.5); // Resize left edge.
  r = await values(); expect(r.start).toBeCloseTo(1.5, 2);
  await drag(1.75, 4); // Capture continues beyond the canvas.
  r = await values(); expect(r.end).toBeCloseTo(3, 2); expect(r.end - r.start).toBeCloseTo(0.5, 2);
  await drag(1.0, 0.2); // New selection works right to left.
  r = await values(); expect(r.start).toBeCloseTo(0.2, 2); expect(r.end).toBeCloseTo(1, 2);
  await expect(page.locator('#slices .selected')).toHaveCount(0);
  await page.locator('#sound-name').fill('波形拖选'); await page.locator('#save').click();
  await expect(page.locator('#library-count')).toHaveText('1'); await page.locator('#library-tab').click();
  await page.locator('.sound-open').click(); await expect(page.locator('.sound-details p')).toContainText('0.800 秒');
});

test('touch waveform drag selects without scrolling the page', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 800, height: 1100 } });
  const page = await context.newPage(); await page.goto(process.env.TEST_APP_ORIGIN); await page.locator('#demo').click();
  await page.locator('#waveform').scrollIntoViewIfNeeded();
  const box = await page.locator('#waveform').boundingBox(), scroll = await page.evaluate(() => scrollY);
  const client = await context.newCDPSession(page);
  const point = t => ({ x: box.x + box.width * t / 3, y: box.y + 60 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(1)] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(1.7)] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#trim-duration')).toHaveText('0.700 秒');
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await page.screenshot({ path: 'test-results/waveform-drag.png', fullPage: true });
  await context.close();
});
