import { test, expect } from '@playwright/test';
test('icon library opens secondary controls and landscape gate preserves draft', async ({page}) => {
 await page.setViewportSize({width:390,height:844}); await page.goto('/');
 await expect(page.locator('.library-tools h1')).toHaveText('我的声音库');
 await expect(page.locator('.storage-note')).toBeHidden();
 await page.locator('#demo').click(); await page.locator('#sound-name').fill('杯子'); await page.locator('#save').click();
 await expect(page.locator('#library-count')).toHaveText('1'); await page.locator('#library-tab').click();
 await expect(page.locator('.sound-card button')).toHaveCount(2);
 await page.locator('.sound-open').click(); await expect(page.locator('#sound-page .character-edit')).toBeVisible();
 await page.getByRole('button',{name:'节奏编创',exact:true}).click();
 await expect(page.locator('.rhythm-rotate')).toBeVisible();
 await page.setViewportSize({width:844,height:390});
 await page.locator('[data-step="0"]').click();
 await page.setViewportSize({width:390,height:844}); await expect(page.locator('.rhythm-rotate')).toBeVisible();
 await page.setViewportSize({width:844,height:390}); await expect(page.locator('[data-step="0"]')).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:'test-results/landscape-editor.png'});
});
