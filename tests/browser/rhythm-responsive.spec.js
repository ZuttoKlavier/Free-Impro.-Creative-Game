import { test, expect } from '@playwright/test';

async function openRhythm(page) {
  await page.goto('/');
  await page.locator('#demo').click();
  await page.locator('#sound-name').fill('适配测试：一份名字较长的节奏作品');
  await page.locator('#save').click();
  await expect(page.locator('#library-count')).toHaveText('1');
  await page.locator('#library-tab').click();
  await page.locator('.sound-open').click();
  await page.getByRole('button', { name: '节奏编创', exact: true }).click();
}

async function expectSingleScreen(page, bars) {
  const { width, height } = page.viewportSize();
  const layout = await page.locator('.student-rhythm').evaluate(dialog => ({
    scrollWidth: dialog.scrollWidth, width: dialog.clientWidth,
    scrollHeight: dialog.scrollHeight, height: dialog.clientHeight,
    controls: [...dialog.querySelectorAll('button, input')].filter(el => el.getClientRects().length).map(el => {
      const r = el.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { label: el.getAttribute('aria-label') || el.textContent.trim(), left: r.left, top: r.top, right: r.right, bottom: r.bottom, reachable: target === el || el.contains(target) };
    }),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height);
  expect(layout.controls).toHaveLength(16 + bars + 8);
  for (const c of layout.controls) {
    expect(c.left, c.label).toBeGreaterThanOrEqual(0);
    expect(c.top, c.label).toBeGreaterThanOrEqual(0);
    expect(c.right, c.label).toBeLessThanOrEqual(width);
    expect(c.bottom, c.label).toBeLessThanOrEqual(height);
    expect(c.reachable, c.label).toBe(true);
  }
  await expect(page.locator('[data-close]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '返回声音库', exact: true })).toBeVisible();
  await expect(page.locator('[data-step]')).toHaveCount(16);
  await expect(page.locator('[data-pages] button')).toHaveCount(bars);
}

for (const [width, height] of [[568, 320], [667, 375], [844, 390], [750, 382], [1024, 768]]) {
  for (const bars of [1, 16]) {
    test(`${bars} bars, all steps and controls stay reachable in one ${width}x${height} screen`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openRhythm(page);
      await page.getByLabel('编创小节数').fill(String(bars));
      await page.getByLabel('编创小节数').press('Tab');
      await expectSingleScreen(page, bars);
      await page.getByRole('button', { name: `第 ${bars} 小节`, exact: true }).click();
      await page.getByRole('button', { name: `第 ${bars} 小节第 16 格`, exact: true }).click();
      await expect(page.getByRole('button', { name: `第 ${bars} 小节第 16 格`, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: '清空本小节', exact: true }).click();
      await expect(page.getByRole('button', { name: `第 ${bars} 小节第 16 格`, exact: true })).toHaveAttribute('aria-pressed', 'false');
      await page.getByRole('button', { name: '保存节奏', exact: true }).click();
      await expect(page.locator('[data-status]')).toContainText('节奏已保存');
      await expectSingleScreen(page, bars);
      await page.screenshot({ path: `test-results/rhythm-${width}-${bars}-bars.png` });
      await page.getByRole('button', { name: '返回声音库', exact: true }).click();
      await expect(page.locator('.student-rhythm')).toBeHidden();
      await expect(page.locator('#library-view')).toBeVisible();
    });
  }
}

for (const height of [120, 140, 180]) for (const bars of [1, 16]) test(`${bars} bars retain all controls in a ${height}px keyboard viewport`, async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await openRhythm(page);
  await page.getByLabel('编创小节数').fill(String(bars));
  await page.getByLabel('编创小节数').press('Tab');
  await page.setViewportSize({ width: 568, height });
  await expect(page.locator('.student-rhythm')).toHaveClass(/rhythm-tight/);
  for (const input of ['编创小节数', '试听速度']) {
    await page.getByLabel(input).focus();
    await expectSingleScreen(page, bars);
  }
  await page.getByRole('button', { name: `第 ${bars} 小节`, exact: true }).click();
  await page.getByRole('button', { name: `第 ${bars} 小节第 16 格`, exact: true }).click();
  await expect(page.getByRole('button', { name: `第 ${bars} 小节第 16 格`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '清空本小节', exact: true }).click();
  await expect(page.getByRole('button', { name: `第 ${bars} 小节第 16 格`, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '第 1 小节', exact: true }).click();
  if (bars > 1) await page.getByRole('button', { name: '复制到下一小节', exact: true }).click();
  await page.getByRole('button', { name: '播放试听', exact: true }).click();
  await expect.poll(() => page.locator('.student-rhythm progress').evaluate(el => el.value)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('button', { name: '保存节奏', exact: true }).click();
  await expect(page.locator('[data-save]')).toBeEnabled();
  await expectSingleScreen(page, bars);
  await page.screenshot({ path: `test-results/rhythm-keyboard-${height}-${bars}-bars.png` });
  await page.getByRole('button', { name: '返回声音库', exact: true }).click();
  await expect(page.locator('.student-rhythm')).toBeHidden();
});
