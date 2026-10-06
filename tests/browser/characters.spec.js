import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
const fixture = new PNG({ width: 256, height: 256 });
for (let i = 0; i < fixture.data.length; i += 4) { fixture.data[i] = 220; fixture.data[i + 1] = (i / 4) % 256; fixture.data[i + 2] = 120; fixture.data[i + 3] = 255; }
const photo = PNG.sync.write(fixture), generated = 'data:image/png;base64,' + photo.toString('base64');
const replacementFixture = new PNG({ width: 256, height: 256 });
for (let i = 0; i < replacementFixture.data.length; i += 4) replacementFixture.data.set([15, 40, 230, 255], i);
const replacementPhoto = PNG.sync.write(replacementFixture), replacementGenerated = 'data:image/png;base64,' + replacementPhoto.toString('base64');

async function openPhotoEditor(page, name) {
  await page.goto('/'); await page.locator('#demo').click(); await page.locator('#sound-name').fill(name); await page.locator('#save').click();
  await expect(page.locator('#library-count')).toHaveText('1');
  await page.locator('#library-tab').click(); await page.locator('.sound-open').click(); await page.locator('.character-edit').click();
  await page.locator('#photo-file').setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: photo });
  await expect(page.locator('#save-character')).toBeEnabled();
}
function centerPixel(bytes) {
  const png = PNG.sync.read(Buffer.from(bytes)), index = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
  return Array.from(png.data.subarray(index, index + 4));
}

test('photo crop and sound binding persist through reload and complete backup restore', async ({ page }) => {
  await page.goto('/'); await page.locator('#demo').click(); await page.locator('#sound-name').fill('带照片的声音'); await page.locator('#save').click(); await expect(page.locator('#library-count')).toHaveText('1');
  await page.locator('#library-tab').click(); await page.locator('.sound-open').click(); await page.getByRole('button', { name: '制作形象' }).click();
  await page.locator('#photo-file').setInputFiles({ name: 'cup.png', mimeType: 'image/png', buffer: photo });
  await expect(page.locator('#crop-editor')).toBeVisible();
  await page.locator('#crop-zoom').evaluate(e => { e.value = '2'; e.dispatchEvent(new Event('input')); });
  await page.locator('#photo-canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('#photo-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2); await page.mouse.up();
  expect(Number(await page.locator('#crop-x').inputValue())).toBeGreaterThan(0);
  await page.locator('#save-character').click(); await page.locator('#library-tab').click(); await expect(page.locator('.work-image')).toBeVisible(); await page.locator('.sound-open').click(); await expect(page.locator('.work-kind')).toContainText('照片草稿'); await page.locator('#library-tab').click();
  await page.reload(); await page.locator('#library-tab').click(); await expect(page.locator('.work-image')).toBeVisible();
  const pending = page.waitForEvent('download'); await page.locator('#export').click(); const file = await (await pending).path();
  await page.locator('.sound-open').click(); await page.locator('#sound-page .delete').click(); await page.locator('#delete-dialog button[value="delete"]').click(); await expect(page.locator('#library-count')).toHaveText('0');
  await page.locator('#backup-file').setInputFiles(file); await expect(page.locator('.work-image')).toBeVisible(); await expect(page.locator('#library-count')).toHaveText('1');
});

test('generation UI uses provider response and retains previous avatar on a retry failure (mocked provider)', async ({ page }) => {
  await page.route('**/api/student/image-status', r => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/student/characters', r => r.fulfill({ json: { image: generated, model: 'test-fixture' } }));
  await page.goto('/'); await page.locator('#demo').click(); await page.locator('#sound-name').fill('角色声音'); await page.locator('#save').click(); await expect(page.locator('#library-count')).toHaveText('1');
  await page.locator('#library-tab').click(); await page.locator('.sound-open').click(); await page.getByRole('button', { name: '制作形象' }).click(); await page.locator('#photo-file').setInputFiles({ name: 'cup.png', mimeType: 'image/png', buffer: photo });
  await page.locator('#generate-character').click(); await expect(page.locator('#avatar-preview')).toBeVisible();
  const old = await page.locator('#avatar-preview').getAttribute('src');
  await page.unroute('**/api/student/characters'); await page.route('**/api/student/characters', r => r.fulfill({ status: 502, json: { error: '生成服务暂不可用' } }));
  await page.locator('#generate-character').click(); await expect(page.locator('#character-status')).toContainText('暂不可用'); await expect(page.locator('#avatar-preview')).toHaveAttribute('src', old);
  await page.locator('#save-character').click(); await page.locator('#library-tab').click(); await page.locator('.sound-open').click(); await expect(page.locator('.work-kind')).toHaveText('声音形象');
  await page.getByRole('button', { name: '编辑形象' }).click(); await expect(page.locator('#avatar-preview')).toBeVisible();
  await page.screenshot({ path: 'test-results/character-editor.png', fullPage: true });
});

test('missing image service configuration allows local photo work and explains unavailable generation', async ({ page }) => {
  await page.route('**/api/student/image-status', r => r.fulfill({ json: { configured: false } }));
  await page.goto('/'); await page.locator('#demo').click(); await page.locator('#sound-name').fill('照片草稿'); await page.locator('#save').click(); await page.locator('#library-tab').click(); await page.locator('.sound-open').click(); await page.locator('.character-edit').click();
  await expect(page.locator('#image-service-note')).toContainText('尚未启用'); await expect(page.locator('#generate-character')).toBeDisabled();
  await expect(page.locator('#take-photo')).toBeEnabled();
});

test('a late photo decode cannot attach to a different sound', async ({ page }) => {
  await page.goto('/');
  for (const name of ['照片目标 A', '照片目标 B']) {
    await page.locator('#library-tab').click();
    await page.locator('#demo').click(); await page.locator('#sound-name').fill(name); await page.locator('#save').click();
  }
  await page.locator('#library-tab').click(); await page.locator('.sound-open').first().click(); await page.locator('.character-edit').click();
  const selected = await page.locator('#character-sound').inputValue();
  const next = await page.locator('#character-sound option').evaluateAll(options => options.find(o => o.value && o.value !== document.querySelector('#character-sound').value).value);
  await page.evaluate(() => {
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      const image = await decode(...args); window.__decodeStarted = true;
      await new Promise(resolve => { window.__finishPhotoDecode = resolve; });
      return image;
    };
  });
  await page.locator('#photo-file').setInputFiles({ name: 'late.png', mimeType: 'image/png', buffer: photo });
  await expect.poll(() => page.evaluate(() => window.__decodeStarted)).toBe(true);
  await page.locator('#character-sound').selectOption(next);
  await expect(page.locator('#photo-empty')).toBeVisible();
  await page.evaluate(() => window.__finishPhotoDecode());
  await page.waitForTimeout(100);
  await expect(page.locator('#character-sound')).toHaveValue(next); expect(next).not.toBe(selected);
  await expect(page.locator('#crop-editor')).toBeHidden(); await expect(page.locator('#save-character')).toBeDisabled();
});

test('pending replacement photo decode blocks generation and saving, then binds the generated avatar to the replacement', async ({ page }) => {
  const uploads = [];
  await page.route('**/api/student/image-status', r => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/student/characters', r => {
    uploads.push(r.request().postDataJSON().photo);
    return r.fulfill({ json: { image: replacementGenerated, model: 'test-fixture' } });
  });
  await openPhotoEditor(page, '延迟照片绑定');
  await expect(page.locator('#generate-character')).toBeEnabled();
  await page.evaluate(() => {
    const decode = window.createImageBitmap.bind(window); let first = true;
    window.createImageBitmap = async (...args) => {
      const image = await decode(...args);
      if (first) { first = false; window.__replacementDecodeStarted = true; await new Promise(resolve => { window.__finishReplacementDecode = resolve; }); }
      return image;
    };
  });
  await page.locator('#photo-file').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: replacementPhoto });
  await expect.poll(() => page.evaluate(() => window.__replacementDecodeStarted)).toBe(true);
  await expect(page.locator('#generate-character')).toBeDisabled(); await expect(page.locator('#save-character')).toBeDisabled();
  // A queued callback must respect the same guard as the disabled buttons.
  await page.evaluate(async () => { await document.getElementById('generate-character').onclick(); await document.getElementById('save-character').onclick(); });
  expect(uploads).toHaveLength(0);
  expect(await page.evaluate(async () => (await (await import('/src/storage.js')).listSounds())[0].photo)).toBeUndefined();
  await page.evaluate(() => window.__finishReplacementDecode());
  await expect(page.locator('#generate-character')).toBeEnabled(); await expect(page.locator('#save-character')).toBeEnabled();
  await page.locator('#generate-character').click(); await expect(page.locator('#avatar-preview')).toBeVisible();
  expect(uploads).toHaveLength(1); expect(centerPixel(Buffer.from(uploads[0].split(',')[1], 'base64'))).toEqual([15, 40, 230, 255]);
  await page.locator('#save-character').click();
  await expect.poll(() => page.evaluate(async () => Boolean((await (await import('/src/storage.js')).listSounds())[0].avatar))).toBe(true);
  const saved = await page.evaluate(async () => {
    const sound = (await (await import('/src/storage.js')).listSounds())[0];
    return { photo: Array.from(new Uint8Array(await sound.photo.arrayBuffer())), avatar: Array.from(new Uint8Array(await sound.avatar.arrayBuffer())) };
  });
  expect(centerPixel(saved.photo)).toEqual([15, 40, 230, 255]); expect(centerPixel(saved.avatar)).toEqual([15, 40, 230, 255]);
});

for (const change of ['photo', 'crop']) {
  test(`a late generated avatar cannot replace the current ${change} edit`, async ({ page }) => {
    let releaseResponse;
    await page.route('**/api/student/image-status', r => r.fulfill({ json: { configured: true } }));
    await page.route('**/api/student/characters', async r => {
      await new Promise(resolve => { releaseResponse = resolve; });
      await r.fulfill({ json: { image: generated, model: 'delayed-test-fixture' } });
    });
    await openPhotoEditor(page, '生成结果版本保护');
    await expect(page.locator('#generate-character')).toBeEnabled(); await page.locator('#generate-character').click();
    await expect.poll(() => Boolean(releaseResponse)).toBe(true);
    if (change === 'photo') {
      // Native file read completion can arrive after generation has started.
      await page.locator('#photo-file').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: replacementPhoto });
      await expect.poll(() => page.locator('#photo-canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(256, 256, 1, 1).data))).toEqual([15, 40, 230, 255]);
    } else {
      // Exercise an edit event queued before controls became inert.
      await page.locator('#crop-zoom').evaluate(input => { input.value = '2'; input.dispatchEvent(new Event('input')); });
    }
    releaseResponse(); await expect(page.locator('#generate-character')).toBeEnabled();
    await expect(page.locator('#avatar-preview')).toBeHidden(); await expect(page.locator('#save-character')).toHaveText('保存照片草稿');
    await page.locator('#save-character').click();
    await expect.poll(() => page.evaluate(async () => Boolean((await (await import('/src/storage.js')).listSounds())[0].photo))).toBe(true);
    expect(await page.evaluate(async () => (await (await import('/src/storage.js')).listSounds())[0].avatar)).toBeNull();
  });
}

test('native photo completion during a pending save preserves the existing image pair and allows a fresh save', async ({ page }) => {
  await page.route('**/api/student/image-status', r => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/student/characters', r => r.fulfill({ json: { image: generated, model: 'test-fixture' } }));
  await openPhotoEditor(page, '保存照片版本保护');
  await expect(page.locator('#generate-character')).toBeEnabled(); await page.locator('#generate-character').click();
  await expect(page.locator('#avatar-preview')).toBeVisible(); await page.locator('#save-character').click();
  await expect.poll(() => page.evaluate(async () => Boolean((await (await import('/src/storage.js')).listSounds())[0].avatar))).toBe(true);
  await expect(page.locator('#save-character')).toBeEnabled();
  const readImagePair = () => page.evaluate(async () => {
    const sound = (await (await import('/src/storage.js')).listSounds())[0];
    return {
      photo: Array.from(new Uint8Array(await sound.photo.arrayBuffer())),
      avatar: sound.avatar ? Array.from(new Uint8Array(await sound.avatar.arrayBuffer())) : null,
      updated: sound.imageUpdatedAt,
    };
  });
  const original = await readImagePair();
  await page.evaluate(() => {
    const encode = HTMLCanvasElement.prototype.toBlob; let pending = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...options) {
      if (pending && this.width === 256 && this.height === 256) {
        pending = false; window.__saveCropStarted = true;
        window.__finishSaveCrop = () => encode.call(this, callback, ...options);
      } else encode.call(this, callback, ...options);
    };
  });
  await page.locator('#save-character').click();
  await expect.poll(() => page.evaluate(() => window.__saveCropStarted)).toBe(true);
  // A native bridge dispatches this file change when an earlier read completes,
  // even while visible controls are inert and canvas encoding is still pending.
  await page.locator('#photo-file').setInputFiles({ name: 'late-native-photo.png', mimeType: 'image/png', buffer: replacementPhoto });
  await expect.poll(() => page.locator('#photo-canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(256, 256, 1, 1).data))).toEqual([15, 40, 230, 255]);
  await page.evaluate(() => window.__finishSaveCrop());
  await expect(page.locator('#save-character')).toBeEnabled(); await expect(page.locator('#character-status')).toContainText('本次未保存');
  await expect(page.locator('#character-status')).toContainText('重新保存'); expect(await readImagePair()).toEqual(original);
  await page.locator('#save-character').click();
  await expect.poll(async () => (await readImagePair()).avatar).toBeNull();
  const saved = await readImagePair(); expect(centerPixel(saved.photo)).toEqual([15, 40, 230, 255]);
});
