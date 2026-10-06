import {test, expect} from '@playwright/test';
test('short recording stays in library without a trim result or saved work', async ({page}) => {
 await page.goto('/'); const box = await page.locator('#studio-tab').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
 await expect(page.locator('#studio-tab')).toHaveClass(/recording/); await page.mouse.up();
 await expect(page.locator('#toast')).toContainText('录音太短');
 await expect(page.locator('#studio-view')).toBeHidden(); await expect(page.locator('#library-count')).toHaveText('0');
 await page.locator('#classroom-tab').click(); await expect(page.locator('#account-shortcut')).toHaveCount(0);
});
