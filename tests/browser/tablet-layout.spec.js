import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { setBarsTouch } from './rhythm-touch-controls.js';
import { useSilentAudioClock } from './audio-clock.js';

const longName = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD';
const photo = new PNG({ width: 256, height: 256 });
for (let i = 0; i < photo.data.length; i += 4) photo.data.set([82, 150, 120, 255], i);
const photoBytes = PNG.sync.write(photo);
const devices = [
  { name: 'iPad 1024x768', width: 1024, height: 768, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' },
  { name: 'iPad 1194x834', width: 1194, height: 834, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' },
  { name: 'Android tablet 960x600', width: 960, height: 600, userAgent: 'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' },
  { name: 'Android tablet 1280x800', width: 1280, height: 800, userAgent: 'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' },
  { name: 'phone 390x844', width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' },
];

async function expectNoHorizontalOverflow(page, label) {
  const size = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(size.document, `${label}: document width`).toBeLessThanOrEqual(size.width + 1);
  expect(size.body, `${label}: body width`).toBeLessThanOrEqual(size.width + 1);
}

async function expectTouchTarget(locator, minimumHeight = 0) {
  await expect(locator).toBeVisible();
  await locator.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const target = await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height, width: box.width, reachable: hit === element || element.contains(hit), viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(target.left).toBeGreaterThanOrEqual(-1);
  expect(target.right).toBeLessThanOrEqual(target.viewportWidth + 1);
  expect(target.top).toBeGreaterThanOrEqual(-1);
  expect(target.bottom).toBeLessThanOrEqual(target.viewportHeight + 1);
  expect(target.height).toBeGreaterThanOrEqual(minimumHeight);
  expect(target.width).toBeGreaterThan(0);
  await expect.poll(() => locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  }), { message: 'touch target should become reachable after transient feedback' }).toBe(true);
}

async function seedLibrary(page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-student-ready', 'true');
  await page.evaluate(async name => {
    const { saveSounds } = await import('/src/storage.js');
    const { encodeWav } = await import('/src/audio.js');
    const blob = encodeWav(Float32Array.from({ length: 9600 }, (_, i) => Math.sin(i * Math.PI / 24) * .15), 24000);
    await saveSounds(Array.from({ length: 8 }, (_, index) => ({ id: `tablet-layout-${index}`, name: index === 0 ? name : `声音作品 ${index}`, createdAt: 100 - index, duration: .4, blob })));
  }, longName);
  await page.reload();
  await expect(page.locator('#library-count')).toHaveText('8');
}

async function holdRecordByTouch(page) {
  const button = page.locator('#studio-tab');
  await expectTouchTarget(button, 44);
  const bounds = await button.boundingBox();
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }] });
    await expect(button).toHaveClass(/recording/);
    await expect(page.locator('#capture-overlay')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'recording');
    await page.waitForTimeout(650);
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
  await expect(page.locator('#capture-overlay')).toBeHidden();
  await expect(page.locator('#editor')).toBeVisible();
}

async function expectRhythmFits(page, tablet) {
  const layout = await page.locator('.student-rhythm').evaluate(dialog => ({
    width: dialog.clientWidth, height: dialog.clientHeight, scrollWidth: dialog.scrollWidth, scrollHeight: dialog.scrollHeight,
    controls: [...dialog.querySelectorAll('button, input')].filter(element => element.getClientRects().length).map(element => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { label: element.getAttribute('aria-label') || element.textContent.trim(), left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height, reachable: hit === element || element.contains(hit) };
    }),
  }));
  const viewport = page.viewportSize();
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height);
  for (const control of layout.controls) {
    expect(control.left, control.label).toBeGreaterThanOrEqual(0);
    expect(control.right, control.label).toBeLessThanOrEqual(viewport.width);
    expect(control.top, control.label).toBeGreaterThanOrEqual(0);
    expect(control.bottom, control.label).toBeLessThanOrEqual(viewport.height);
    expect(control.reachable, control.label).toBe(true);
    if (tablet) expect(control.height, control.label).toBeGreaterThanOrEqual(44);
  }
}

for (const device of devices) test.describe(device.name, () => {
  test.use({ viewport: { width: device.width, height: device.height }, userAgent: device.userAgent, hasTouch: true });

  test('library, recording, account, image editing and rhythm remain usable by touch', async ({ page }) => {
    const tablet = device.width >= 900;
    await useSilentAudioClock(page);
    await seedLibrary(page);
    const nav = page.getByRole('navigation', { name: '主要功能' });
    await expect(nav.getByRole('button')).toHaveCount(3);
    for (const button of await nav.getByRole('button').all()) await expectTouchTarget(button, 44);
    await expect(page.locator('.sound-card')).toHaveCount(8);
    await expectNoHorizontalOverflow(page, 'library');
    if (tablet) {
      const layout = await page.locator('#library').evaluate(grid => ({ columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, mainWidth: document.querySelector('main').getBoundingClientRect().width }));
      expect(layout.columns).toBeGreaterThanOrEqual(4);
      expect(layout.mainWidth).toBeGreaterThan(device.width * .8);
      await page.screenshot({ path: `test-results/tablet-library-${device.width}.png` });
    }
    const work = page.getByRole('button', { name: `打开声音 ${longName}`, exact: true });
    await expectTouchTarget(work, 44);
    await work.tap();
    await expect(page.locator('#sound-page h3')).toHaveText(longName);
    await expectNoHorizontalOverflow(page, 'long-name sound detail');
    const editImage = page.locator('#sound-page .character-edit');
    await expectTouchTarget(editImage, 44);
    await editImage.tap();
    await expect(page.locator('#characters-view')).toBeVisible();
    await expect(page.locator('#character-sound')).toHaveValue('tablet-layout-0');
    await expectNoHorizontalOverflow(page, 'long-name image selection');
    await expectTouchTarget(page.locator('#import-photo'), 44);
    await page.locator('#photo-file').setInputFiles({ name: 'tablet-photo.png', mimeType: 'image/png', buffer: photoBytes });
    await expect(page.locator('#crop-editor')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'photo crop editor');
    if (tablet) await page.screenshot({ path: `test-results/tablet-image-${device.width}x${device.height}.png`, fullPage: true });
    await expectTouchTarget(page.locator('#crop-zoom'));
    await page.locator('#crop-zoom').tap();
    expect(Number(await page.locator('#crop-zoom').inputValue())).toBeGreaterThan(1);
    await expectTouchTarget(page.locator('#save-character'), 44);
    await page.locator('#save-character').tap();
    await expect.poll(() => page.evaluate(async () => Boolean((await (await import('/src/storage.js')).listSounds()).find(sound => sound.id === 'tablet-layout-0')?.photo))).toBe(true);

    await page.locator('#classroom-tab').tap();
    await expect(page.locator('#my-view')).toBeVisible();
    await expectTouchTarget(page.locator('#open-student-account'), 44);
    await page.locator('#open-student-account').tap();
    await expect(page.locator('#student-account-username')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'student account');
    await page.locator('#open-student-account').tap();
    await expectTouchTarget(page.locator('#open-my-classroom'), 44);
    await page.locator('#open-my-classroom').tap();
    await expect(page.locator('#auth-panel')).toBeVisible();
    await expectTouchTarget(page.locator('#auth-username'));
    await page.locator('#auth-username').fill('平板适配检查');
    await expectNoHorizontalOverflow(page, 'classroom connection');
    await page.locator('#library-tab').tap();

    await holdRecordByTouch(page);
    await expectNoHorizontalOverflow(page, 'recorded sound editor');
    if (tablet) {
      const columns = await page.locator('#editor').evaluate(editor => getComputedStyle(editor).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(2);
      await expect(page.locator('#editor .source-editor')).toBeVisible();
      await expect(page.locator('#editor .selection-editor')).toBeVisible();
      await page.screenshot({ path: `test-results/tablet-editor-${device.width}.png` });
    }
    await expectTouchTarget(page.locator('#sound-name'));
    await page.locator('#sound-name').fill('触屏录音保存');
    await expectTouchTarget(page.locator('#save'), 44);
    await page.locator('#save').tap();
    await expect(page.locator('#library-count')).toHaveText('9');
    await page.locator('#library-tab').tap();
    await page.getByRole('button', { name: `打开声音 ${longName}`, exact: true }).tap();
    await page.getByRole('button', { name: '节奏编创', exact: true }).tap();
    if (!tablet) {
      await expect(page.locator('.rhythm-rotate')).toBeVisible();
      await page.setViewportSize({ width: 844, height: 390 });
    }
    await expect(page.locator('.rhythm-landscape-content')).toBeVisible();
    await setBarsTouch(page, 16);
    await expectRhythmFits(page, tablet);
    await page.getByRole('button', { name: '第 16 小节', exact: true }).tap();
    const step = page.getByRole('button', { name: '第 16 小节第 16 格', exact: true });
    await step.tap();
    await expect(step).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '保存节奏', exact: true }).tap();
    await expect(page.locator('[data-status]')).toContainText('节奏已保存');
    await expectRhythmFits(page, tablet);
    await page.screenshot({ path: `test-results/tablet-layout-${device.width}x${device.height}.png` });
    await page.getByRole('button', { name: '返回声音库', exact: true }).tap();
    await expect(page.locator('.student-rhythm')).toBeHidden();
    await expect(page.locator('#library-view')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'return to library');
  });
});

test.describe('Android tablet portrait and split window', () => {
  test.use({ viewport: { width: 800, height: 1280 }, hasTouch: true, userAgent: devices[2].userAgent });

  test('resizing keeps the recording draft and long-name image editor within the window', async ({ page }) => {
    await useSilentAudioClock(page);
    await seedLibrary(page);
    await page.getByRole('button', { name: `打开声音 ${longName}`, exact: true }).tap();
    await page.locator('#sound-page .character-edit').tap();
    await expectNoHorizontalOverflow(page, 'Android portrait image editor');
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(page.locator('#character-sound')).toHaveValue('tablet-layout-0');
    await expectNoHorizontalOverflow(page, 'Android split-window image editor');
    await expectTouchTarget(page.locator('#take-photo'), 44);
    await page.locator('#library-tab').tap();
    await page.locator('#demo').tap();
    await page.locator('#sound-name').fill('安卓平板窗口切换时保留的声音');
    for (const viewport of [{ width: 800, height: 1280 }, { width: 1280, height: 800 }, { width: 600, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect(page.locator('#editor')).toBeVisible();
      await expect(page.locator('#sound-name')).toHaveValue('安卓平板窗口切换时保留的声音');
      await expectNoHorizontalOverflow(page, `${viewport.width}x${viewport.height} recording draft`);
    }
    await expectTouchTarget(page.locator('#save'), 44);
    await page.locator('#save').tap();
    await expect(page.locator('#library-count')).toHaveText('9');
  });
});
