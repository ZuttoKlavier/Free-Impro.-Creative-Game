import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
const fixture = new PNG({ width: 256, height: 256 });
for (let i = 0; i < fixture.data.length; i += 4) { fixture.data[i] = 220; fixture.data[i + 1] = (i / 4) % 256; fixture.data[i + 2] = 120; fixture.data[i + 3] = 255; }
const photo = PNG.sync.write(fixture), generated = 'data:image/png;base64,' + photo.toString('base64');

test('photo crop and sound binding persist through reload and complete backup restore', async ({ page }) => {
  await page.goto('/'); await page.locator('#demo').click(); await page.locator('#sound-name').fill('带照片的声音'); await page.locator('#save').click(); await expect(page.locator('#library-count')).toHaveText('1');
  await page.locator('#library-tab').click(); await page.getByRole('button', { name: '制作形象' }).click();
  await page.locator('#photo-file').setInputFiles({ name: 'cup.png', mimeType: 'image/png', buffer: photo });
  await expect(page.locator('#crop-editor')).toBeVisible();
  await page.locator('#crop-zoom').evaluate(e => { e.value = '2'; e.dispatchEvent(new Event('input')); });
  await page.locator('#photo-canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('#photo-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2); await page.mouse.up();
  expect(Number(await page.locator('#crop-x').inputValue())).toBeGreaterThan(0);
  await page.locator('#save-character').click(); await page.locator('#library-tab').click(); await expect(page.locator('.work-image')).toBeVisible(); await expect(page.locator('.work-kind')).toContainText('照片草稿');
  await page.reload(); await page.locator('#library-tab').click(); await expect(page.locator('.work-image')).toBeVisible();
  const pending = page.waitForEvent('download'); await page.locator('#export').click(); const file = await (await pending).path();
  await page.locator('.sound-card .delete').click(); await page.locator('#delete-dialog button[value="delete"]').click(); await expect(page.locator('#library-count')).toHaveText('0');
  await page.locator('#backup-file').setInputFiles(file); await expect(page.locator('.work-image')).toBeVisible(); await expect(page.locator('#library-count')).toHaveText('1');
});

test('generation UI uses provider response and retains previous avatar on a retry failure (mocked provider)', async ({ page }) => {
  await page.route('**/api/image-status', r => r.fulfill({ json: { configured: true } }));
  await page.route('**/api/characters', r => r.fulfill({ json: { image: generated, model: 'test-fixture' } }));
  await page.goto('/'); await page.locator('#demo').click(); await page.locator('#sound-name').fill('角色声音'); await page.locator('#save').click(); await expect(page.locator('#library-count')).toHaveText('1');
  await page.locator('#library-tab').click(); await page.getByRole('button', { name: '制作形象' }).click(); await page.locator('#photo-file').setInputFiles({ name: 'cup.png', mimeType: 'image/png', buffer: photo });
  await page.locator('#generate-character').click(); await expect(page.locator('#avatar-preview')).toBeVisible();
  const old = await page.locator('#avatar-preview').getAttribute('src');
  await page.unroute('**/api/characters'); await page.route('**/api/characters', r => r.fulfill({ status: 502, json: { error: '生成服务暂不可用' } }));
  await page.locator('#generate-character').click(); await expect(page.locator('#character-status')).toContainText('暂不可用'); await expect(page.locator('#avatar-preview')).toHaveAttribute('src', old);
  await page.locator('#save-character').click(); await page.locator('#library-tab').click(); await expect(page.locator('.work-kind')).toHaveText('声音形象');
  await page.getByRole('button', { name: '编辑形象' }).click(); await expect(page.locator('#avatar-preview')).toBeVisible();
  await page.screenshot({ path: 'test-results/character-editor.png', fullPage: true });
});

test('missing image service configuration allows local photo work and explains unavailable generation', async ({ page }) => {
  await page.route('**/api/image-status', r => r.fulfill({ json: { configured: false } }));
  await page.goto('/'); await page.locator('#characters-tab').click();
  await expect(page.locator('#image-service-note')).toContainText('尚未启用'); await expect(page.locator('#generate-character')).toBeDisabled();
  await expect(page.locator('#take-photo')).toBeEnabled();
});
