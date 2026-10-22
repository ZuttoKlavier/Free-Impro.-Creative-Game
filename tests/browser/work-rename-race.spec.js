import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const workId = 'rename-race-work';
const originalName = '合成改名作品';
const image = new PNG({ width: 8, height: 8 });
image.data.fill(128);
const imageBase64 = PNG.sync.write(image).toString('base64');
const originalRhythm = { bars: 1, steps: Array.from({ length: 16 }, (_, index) => index === 0) };
const latestRhythm = { bars: 1, steps: Array.from({ length: 16 }, (_, index) => [0, 4, 8, 12].includes(index)) };

test.beforeEach(async ({ context }) => {
  // Every API request is intercepted. These tests use synthetic local works,
  // never a real student identity, photo, classroom or image-generation request.
  await context.route('**/api/**', route => route.fulfill({ status: 401, json: { error: '合成测试未登录' } }));
});

async function seedWorks(page, works = [{ id: workId, name: originalName }]) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-student-ready', 'true');
  await page.evaluate(async ({ works, imageBase64, originalRhythm }) => {
    const { saveSounds } = await import('/src/storage.js');
    const { encodeWav } = await import('/src/audio.js');
    const photo = new Blob([Uint8Array.from(atob(imageBase64), character => character.charCodeAt(0))], { type: 'image/png' });
    await saveSounds(works.map((work, index) => ({
      ...work, createdAt: index + 1, duration: 0.1,
      blob: encodeWav(new Float32Array(2400).fill(0.1), 24000),
      photo, rhythm: originalRhythm,
      imageRequest: { id: 'rename-race-job', userId: 'synthetic-student' },
    })));
  }, { works, imageBase64, originalRhythm });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-student-ready', 'true');
  await page.locator('#library-tab').click();
  await expect(page.locator('#library-count')).toHaveText(String(works.length));
}

async function openWork(page, name) {
  await page.getByRole('button', { name: `打开声音 ${name}`, exact: true }).click();
  await expect(page.locator('#sound-page h3')).toHaveText(name);
}

async function readWork(page, id = workId) {
  return page.evaluate(async id => {
    const { listSounds } = await import('/src/storage.js');
    const work = (await listSounds()).find(sound => sound.id === id);
    if (!work) return null;
    const blobData = async blob => blob ? btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer()))) : null;
    return {
      id: work.id, name: work.name, createdAt: work.createdAt, duration: work.duration,
      audio: await blobData(work.blob), photo: await blobData(work.photo), avatar: await blobData(work.avatar),
      rhythm: work.rhythm, imageRequest: work.imageRequest, imageUpdatedAt: work.imageUpdatedAt ?? null,
    };
  }, id);
}

async function escapeDialog(page, selector) {
  await page.locator(selector).evaluate(dialog => {
    window.__workDialogClosed = false;
    dialog.addEventListener('close', () => { window.__workDialogClosed = true; }, { once: true });
  });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__workDialogClosed)).toBe(true);
  await expect(page.locator(selector)).toBeHidden();
}

test('renaming from a stale page preserves a late image and the latest rhythm', async ({ page, context }) => {
  await seedWorks(page);
  await openWork(page, originalName);
  await page.locator('#sound-page .rename').click();
  await page.locator('#rename-input').fill('保留新结果的名称');
  const other = await context.newPage();
  try {
    await other.goto('/');
    const changed = await other.evaluate(async ({ workId, imageBase64, latestRhythm }) => {
      const { attachImageResult, updateSound } = await import('/src/storage.js');
      const avatar = new Blob([Uint8Array.from(atob(imageBase64), character => character.charCodeAt(0))], { type: 'image/png' });
      const attached = await attachImageResult(workId, 'rename-race-job', 'synthetic-student', avatar);
      const updated = await updateSound(workId, latest => ({ ...latest, rhythm: latestRhythm }));
      return { attached, updated };
    }, { workId, imageBase64, latestRhythm });
    expect(changed).toEqual({ attached: true, updated: true });
    const latest = await readWork(other);
    expect(latest.avatar).toBe(imageBase64);
    expect(latest.rhythm).toEqual(latestRhythm);
    expect(latest.imageRequest).toBeNull();

    await page.getByRole('button', { name: '保存名称', exact: true }).click();
    await expect(page.locator('#toast')).toContainText('名称已更新');
    expect(await readWork(other)).toEqual({ ...latest, name: '保留新结果的名称' });
    await openWork(page, '保留新结果的名称');
    await expect(page.locator('#sound-page .work-image')).toHaveAttribute('alt', '动漫形象');
  } finally { await other.close(); }
});

test('renaming in an old page cannot restore a work deleted in another page', async ({ page, context }) => {
  await seedWorks(page);
  await openWork(page, originalName);
  await page.locator('#sound-page .rename').click();
  await page.locator('#rename-input').fill('不能复活的作品');
  const other = await context.newPage();
  try {
    await other.goto('/');
    await expect(other.locator('html')).toHaveAttribute('data-student-ready', 'true');
    await other.locator('#library-tab').click();
    await openWork(other, originalName);
    await other.locator('#sound-page .delete').click();
    await other.locator('#delete-dialog').getByRole('button', { name: '删除声音', exact: true }).click();
    await expect(other.locator('#library-count')).toHaveText('0');
    await expect(page.locator('#library-count')).toHaveText('1');

    await page.getByRole('button', { name: '保存名称', exact: true }).click();
    await expect(page.locator('#toast')).toContainText('这份声音已被删除，无法修改名称');
    await expect(page.locator('#toast')).toHaveClass(/error/);
    await expect(page.locator('#library-count')).toHaveText('0');
    expect(await readWork(other)).toBeNull();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-student-ready', 'true');
    await expect(page.locator('#library-count')).toHaveText('0');
  } finally { await other.close(); }
});

test('Escape cancels a reopened rename dialog after an earlier successful rename', async ({ page }) => {
  await seedWorks(page);
  await openWork(page, originalName);
  await page.locator('#sound-page .rename').click();
  await page.locator('#rename-input').fill('已确认名称');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('名称已更新');
  const before = await readWork(page);

  await openWork(page, '已确认名称');
  await page.locator('#sound-page .rename').click();
  await page.locator('#rename-input').fill('取消的名称');
  await escapeDialog(page, '#name-dialog');
  expect(await readWork(page)).toEqual(before);
  await expect(page.locator('#sound-page h3')).toHaveText('已确认名称');
});

test('Escape cancels a reopened delete dialog after an earlier successful deletion', async ({ page }) => {
  await seedWorks(page, [{ id: 'first-delete-work', name: '先删除的作品' }, { id: workId, name: originalName }]);
  await openWork(page, '先删除的作品');
  await page.locator('#sound-page .delete').click();
  await page.locator('#delete-dialog').getByRole('button', { name: '删除声音', exact: true }).click();
  await expect(page.locator('#library-count')).toHaveText('1');
  const before = await readWork(page);

  await openWork(page, originalName);
  await page.locator('#sound-page .delete').click();
  await escapeDialog(page, '#delete-dialog');
  expect(await readWork(page)).toEqual(before);
  await expect(page.locator('#sound-page h3')).toHaveText(originalName);
  await expect(page.locator('#library-count')).toHaveText('1');
});
