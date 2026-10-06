import { test, expect } from '@playwright/test';
test('phone bottom navigation separates library, recording and account without blocking local creation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const nav = page.getByRole('navigation', { name: '主要功能' });
  await expect(nav.getByRole('button')).toHaveCount(3);
  await expect(page.locator('#studio-view')).toBeHidden();
  await page.locator('#library-tab').click(); await expect(page.locator('#library-view')).toBeVisible();
  await expect(page.locator('#characters-tab')).toBeHidden();
  await expect(page.locator('#library-tab')).toHaveAttribute('aria-current', 'page');
  await page.locator('#classroom-tab').click(); await expect(page.locator('#auth-panel')).toBeVisible();
  await expect(page.locator('#account-shortcut')).toHaveCount(0); await expect(page.locator('.auth-tabs')).toBeHidden();
  await expect(page.locator('#studio-tab')).toBeEnabled();
  const bounds = await nav.boundingBox(); expect(bounds.y + bounds.height).toBeLessThanOrEqual(845);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('holding record stays in library until release then opens trim', async ({page}) => {
 await page.goto('/'); const b = await page.locator('#studio-tab').boundingBox();
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down();
 await expect(page.locator('#studio-tab')).toHaveClass(/recording/);
 await expect(page.locator('#library-view')).toBeVisible();
 await page.waitForTimeout(700); await page.mouse.up();
 await expect(page.locator('#editor')).toBeVisible();
 await expect(page.locator('#capture-overlay')).toBeHidden();
 await expect(page.locator('#studio-tab')).not.toHaveClass(/recording/);
});
