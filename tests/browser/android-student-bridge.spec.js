import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

test.use({ userAgent: 'Mozilla/5.0 Android FreeImproStudent/1' });

async function nativeClient(page) {
  await page.addInitScript(() => {
    window.nativeState = { pending: null, bytes: '', settings: 0, exported: [] };
    window.FreeImproFiles = window.rawNativeFiles = {
      begin: () => 'export', append: (_, chunk) => { window.nativeState.exported.push(chunk); return true; },
      finish: () => true, cancel: () => {},
    };
    window.FreeImproAndroid = {
      settings: () => { window.nativeState.settings++; },
      scanClassroom: id => { queueMicrotask(() => window.dispatchEvent(new CustomEvent('freeimpro-android-result', { detail: { id, value: '123456', error: '' } }))); return true; },
      pendingImport: () => window.nativeState.pending ? JSON.stringify(window.nativeState.pending) : '',
      readImport: (token, offset) => {
        if (token !== window.nativeState.pending?.token) return '';
        if (window.nativeState.changeSound) document.getElementById('character-sound').value = window.nativeState.changeSound;
        return btoa(atob(window.nativeState.bytes).slice(offset, offset + 48 * 1024));
      },
      finishImport: token => { if (token === window.nativeState.pending?.token) { window.nativeState.pending = null; window.nativeState.finished = token; } },
    };
    window.stageSharedFile = (name, type, bytes) => {
      window.nativeState.bytes = bytes; window.nativeState.pending = { token: crypto.randomUUID(), name, type, size: atob(bytes).length };
      window.dispatchEvent(new Event('freeimpro-android-import'));
    };
  });
  await page.goto('/'); await page.locator('#classroom-tab').click();
}

function backupBytes() {
  const rate = 16000, frames = rate / 4, audio = Buffer.alloc(44 + frames * 2);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVE', 8); audio.write('fmt ', 12);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(rate, 24); audio.writeUInt32LE(rate * 2, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) audio.writeInt16LE(Math.sin(i * .1) * 1000, 44 + i * 2);
  return Buffer.from(JSON.stringify({ format: 'free-impro-sounds', version: 2, sounds: [{ id: 'shared-old-work', name: '旧安装保留声音', createdAt: 1, audio: 'data:audio/wav;base64,' + audio.toString('base64') }] })).toString('base64');
}

test('Android My page exposes protected settings bridge and scans without entering automatically', async ({ page }) => {
  await nativeClient(page);
  await page.locator('.my-heading').getByRole('button', { name: '连接设置', exact: true }).click();
  expect(await page.evaluate(() => window.nativeState.settings)).toBe(1);
  let entered = false; page.on('request', request => { if (request.url().includes('/enter-classroom')) entered = true; });
  await page.getByRole('button', { name: '扫描课堂码', exact: true }).click();
  await expect(page.locator('#auth-password')).toHaveValue('123456');
  await expect(page.locator('#auth-panel')).toBeVisible(); expect(entered).toBe(false);
  await expect(page.locator('.my-heading')).toContainText('请确认姓名后连接课堂');
});

test('Android confirms old JSON backup import and rejects malformed data without changing the library', async ({ page }) => {
  await nativeClient(page);
  await page.evaluate(bytes => window.stageSharedFile('old-install.json', 'application/json', bytes), backupBytes());
  await page.evaluate(() => { document.getElementById('backup-file').dataset.importing = 'true'; });
  await page.getByRole('button', { name: '导入收到的备份', exact: true }).click();
  await expect(page.locator('.my-heading')).toContainText('等待上一项操作');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await page.evaluate(() => !!window.nativeState.pending)).toBe(true);
  await page.evaluate(() => { delete document.getElementById('backup-file').dataset.importing; });
  await page.getByRole('button', { name: '导入收到的备份', exact: true }).click();
  await expect(page.locator('#library-count')).toHaveText('0');
  await page.locator('dialog[open]').getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.locator('#library-count')).toHaveText('1'); await expect(page.locator('#toast')).toContainText('已导入 1 份声音');
  await page.evaluate(() => window.stageSharedFile('invalid.json', 'application/json', btoa('{broken json')));
  await page.getByRole('button', { name: '导入收到的备份', exact: true }).click();
  await page.locator('dialog[open]').getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('无法解析'); await expect(page.locator('#library-count')).toHaveText('1');
});

test('Android shared photos require a chosen sound and stop if the selection changes before handoff', async ({ page }) => {
  await nativeClient(page);
  const png = new PNG({ width: 2, height: 2 }); png.data.fill(255); const encoded = PNG.sync.write(png).toString('base64');
  await page.evaluate(bytes => window.stageSharedFile('photo.png', 'image/png', bytes), encoded);
  await expect(page.getByRole('button', { name: '导入收到的照片', exact: true })).not.toBeVisible();
  await page.locator('#library-tab').click(); await page.locator('#demo').click(); await page.locator('#sound-name').fill('照片对应声音'); await page.locator('#save').click();
  await page.locator('#library-tab').click(); await page.locator('.sound-open').click(); await page.locator('.character-edit').click();
  await page.evaluate(() => { window.nativeState.changeSound = ''; });
  await page.getByRole('button', { name: '导入收到的照片', exact: true }).click();
  await page.locator('dialog[open]').getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.locator('#crop-editor')).toBeVisible();
  await page.locator('#save-character').click(); await expect(page.locator('#toast')).toContainText('照片草稿已保存');
  // A later shared photo cannot silently attach to a changed sound selection.
  await page.evaluate(bytes => { window.stageSharedFile('later.png', 'image/png', bytes); window.nativeState.changeSound = 'nonexistent-work'; }, encoded);
  await page.getByRole('button', { name: '导入收到的照片', exact: true }).click();
  await page.locator('dialog[open]').getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.locator('.my-heading')).toContainText('选择的声音已变化');
  expect(await page.evaluate(() => !!window.nativeState.pending)).toBe(true);
});

test('failed Android file publishing remains an error while a cancelled native save returns false and cleans up', async ({ page }) => {
  await nativeClient(page);
  const outcome = await page.evaluate(async () => {
    const { exportLocalFile } = await import('/src/student-client.js');
    window.rawNativeFiles.finish = () => false; window.rawNativeFiles.cancel = id => { window.cancelledFailedFile = id; };
    let failure;
    try { await exportLocalFile(new Blob(['{}'], { type: 'application/json' }), 'failed.json'); } catch (error) { failure = error.message; }
    const cleanedFailure = window.cancelledFailedFile;
    // A native document-picker cancellation is deliberately distinct from a write failure.
    window.webkit = { messageHandlers: { localFiles: {} } };
    window.FreeImproFiles = { begin: () => 'cancelled', append: () => true, finish: () => false, cancel: id => { window.cancelledSave = id; } };
    const cancelled = await exportLocalFile(new Blob(['{}'], { type: 'application/json' }), 'cancelled.json');
    return { failure, cleanedFailure, cancelled, cleanedCancellation: window.cancelledSave };
  });
  expect(outcome.failure).toContain('尚未保存成功'); expect(outcome.cleanedFailure).toBe('export');
  expect(outcome.cancelled).toBe(false); expect(outcome.cleanedCancellation).toBe('cancelled');
});
