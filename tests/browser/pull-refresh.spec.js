import { test, expect } from '@playwright/test';
async function touch(page, type, y) {
  await page.locator('.my-heading h1, .library-tools h1').filter({ visible: true }).first().evaluate((el, {type, y}) => {
    const point = new Touch({ identifier: 1, target: el, clientX: 100, clientY: y });
    el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' || type === 'touchcancel' ? [] : [point] }));
  }, {type, y});
}
test('global refresh requires threshold and release, supports cancellation', async ({page}) => {
  await page.goto('/');
  const hint = page.locator('.pull-refresh');
  await touch(page, 'touchstart', 100); await touch(page, 'touchmove', 150);
  await expect(hint).toBeHidden(); await touch(page, 'touchend', 150);
  await expect(hint).toBeHidden();
  await touch(page, 'touchstart', 100); await touch(page, 'touchmove', 200);
  await expect(hint).toHaveText('下拉刷新 · 松开刷新');
  await touch(page, 'touchcancel', 200); await expect(hint).toBeHidden();
  await touch(page, 'touchstart', 100); await touch(page, 'touchmove', 200);
  await touch(page, 'touchmove', 140); await touch(page, 'touchend', 140);
  await expect(hint).toBeHidden();
  await page.locator('#classroom-tab').click();
  await touch(page, 'touchstart', 100); await touch(page, 'touchmove', 200);
  await expect(hint).toBeVisible(); await touch(page, 'touchend', 200);
  await expect(hint).toBeHidden(); await expect(page.locator('#my-view')).toBeVisible();
  await expect(page.getByText('刷新完成', {exact:true})).toBeVisible();
});
