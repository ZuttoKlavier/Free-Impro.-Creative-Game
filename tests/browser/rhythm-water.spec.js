import { test, expect } from '@playwright/test';
import { setBarsTouch } from './rhythm-touch-controls.js';
test.use({ hasTouch: true });

async function openRhythm(page, height = 390) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/'); await page.locator('#demo').click();
  await page.locator('#sound-name').fill('水滴回归'); await page.locator('#save').click();
  await expect(page.locator('#library-count')).toHaveText('1'); await page.locator('#library-tab').click();
  await page.locator('.sound-open').click(); await page.getByRole('button', { name: '节奏编创', exact: true }).click();
  if (height < 190) {
    await page.setViewportSize({ width: 844, height });
    await expect(page.locator('.student-rhythm')).toHaveClass(/rhythm-tight/);
  }
}

const afterPaint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const layer = page => page.locator('[data-water-shapes]');
async function waterGeometry(page) {
  return layer(page).evaluate(element => [...element.children].map(group => ({
    radius: [...group.querySelectorAll('circle')].map(circle => Number(circle.getAttribute('r'))),
    width: parseFloat(group.querySelector('rect').style.width),
    filter: group.getAttribute('filter'),
  })));
}
async function drag(page, from, to) {
  const a = await page.locator(`[data-step="${from}"]`).boundingBox(), b = await page.locator(`[data-step="${to}"]`).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: Math.abs(to - from) * 4 }); await page.mouse.up();
  await afterPaint(page);
}

for (const height of [390, 120]) test(`feedback and external transforms never change water geometry at ${height}px`, async ({ page }) => {
  await openRhythm(page, height);
  const baseline = await page.locator('[data-step="0"] .rhythm-dot').evaluate(dot => dot.offsetWidth);
  await page.evaluate(() => {
    for (const [index, time] of [[0, 0], [4, 115]]) {
      const cell = document.querySelector(`[data-step="${index}"]`); cell.click();
      for (const animation of cell.querySelector('.rhythm-dot').getAnimations()) { animation.pause(); animation.currentTime = time; }
    }
  });
  await afterPaint(page);
  const during = await waterGeometry(page);
  expect(during).toHaveLength(2);
  for (const group of during) { expect(group.radius).toEqual([baseline / 2, baseline / 2]); expect(group.filter).toBeNull(); }
  const sizes = await page.locator('[data-step="0"] .rhythm-dot, [data-step="4"] .rhythm-dot').evaluateAll(dots => dots.map(dot => dot.getBoundingClientRect().width));
  for (const size of sizes) expect(size).toBeCloseTo(baseline, 1);
  const rendered = await layer(page).locator('circle').evaluateAll(circles => circles.map(circle => circle.getBoundingClientRect().width));
  for (const size of rendered) expect(size).toBeCloseTo(baseline, 1);
  await page.locator('.rhythm-dot, [data-water-key]').evaluateAll(elements => elements.forEach(element => element.getAnimations().forEach(animation => animation.finish())));
  await afterPaint(page);
  expect(await waterGeometry(page)).toEqual(during);
  await page.locator('[data-step="0"] .rhythm-dot').evaluate(dot => { dot.style.transform = 'scale(1.5)'; window.dispatchEvent(new Event('resize')); });
  await afterPaint(page);
  expect(await waterGeometry(page)).toEqual(during);
});

test('three old water groups are cleared synchronously on empty bars and remain empty after rapid switching', async ({ page }) => {
  await openRhythm(page); await setBarsTouch(page, 2);
  await page.evaluate(() => [0, 4, 8].forEach(i => document.querySelector(`[data-step="${i}"]`).click()));
  await expect(layer(page).locator('[data-water-key]')).toHaveCount(3);
  const counts = await page.evaluate(async () => {
    const shapes = document.querySelector('[data-water-shapes]');
    document.querySelector('[data-pages]').children[1].click(); const immediate = shapes.children.length;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return [immediate, shapes.children.length];
  });
  expect(counts).toEqual([0, 0]);
  const immediateCounts = await page.evaluate(() => {
    const pages = document.querySelector('[data-pages]'), shapes = document.querySelector('[data-water-shapes]'), counts = [];
    for (let i = 0; i < 12; i++) { pages.children[i % 2].click(); counts.push(shapes.children.length); }
    return counts;
  });
  expect(immediateCounts).toEqual(Array(12).fill(0)); await afterPaint(page);
  await expect(layer(page).locator('[data-water-key]')).toHaveCount(0);
  await page.getByRole('button', { name: '第 1 小节', exact: true }).click();
  await expect(layer(page).locator('[data-water-key]')).toHaveCount(3);
  await page.evaluate(() => [0, 4, 8].forEach(i => document.querySelector(`[data-step="${i}"]`).click()));
  await afterPaint(page); await expect(layer(page).locator('[data-water-key]')).toHaveCount(0);
  await page.evaluate(() => [0, 4, 8].forEach(i => document.querySelector(`[data-step="${i}"]`).click()));
  await expect(layer(page).locator('[data-water-key]')).toHaveCount(3);
  const cleared = await page.evaluate(async () => {
    const shapes = document.querySelector('[data-water-shapes]'); document.querySelector('[data-clear]').click();
    const immediate = shapes.children.length; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return [immediate, shapes.children.length];
  });
  expect(cleared).toEqual([0, 0]);
});

test('the same trigger keeps independent sustained lengths across bars and still extends and retracts', async ({ page }) => {
  await openRhythm(page); await setBarsTouch(page, 2);
  await drag(page, 0, 3); await expect(page.locator('.student-rhythm .held')).toHaveCount(4);
  const long = (await waterGeometry(page))[0]; const first = long.width; expect(first).toBeGreaterThan(0); expect(long.filter).toBe('url(#rhythm-water-merge)');
  const cleared = await page.evaluate(() => { document.querySelector('[data-pages]').children[1].click(); return document.querySelector('[data-water-shapes]').children.length; });
  expect(cleared).toBe(0); await afterPaint(page);
  await drag(page, 0, 1); await expect(page.locator('.student-rhythm .held')).toHaveCount(2);
  const second = (await waterGeometry(page))[0].width; expect(second).toBeCloseTo(first / 3, 1);
  await page.getByRole('button', { name: '第 1 小节', exact: true }).click(); await afterPaint(page);
  expect((await waterGeometry(page))[0].width).toBeCloseTo(first, 1);
  await drag(page, 0, 2); await expect(page.locator('.student-rhythm .held')).toHaveCount(3);
  expect((await waterGeometry(page))[0].width).toBeCloseTo(first * 2 / 3, 1);
  const start = await page.locator('[data-step="0"]').boundingBox(), next = await page.locator('[data-step="1"]').boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2, { steps: 4 });
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2, { steps: 4 }); await page.mouse.up(); await afterPaint(page);
  await expect(page.locator('.student-rhythm .held')).toHaveCount(0);
  const point = (await waterGeometry(page))[0]; expect(point.width).toBe(0); expect(point.filter).toBeNull(); expect(point.radius).toEqual([16, 16]);
  await drag(page, 0, 2); await expect(page.locator('.student-rhythm .held')).toHaveCount(3);
  expect((await waterGeometry(page))[0].filter).toBe('url(#rhythm-water-merge)');
  await page.getByRole('button', { name: '保存节奏', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('节奏已保存');
  const saved = await page.evaluate(async () => (await (await import('/src/storage.js')).listSounds())[0].rhythm);
  expect(saved.steps[0]).toBe(3); expect(saved.steps[16]).toBe(2);
});
