import {test,expect} from '@playwright/test';
test.use({userAgent:'Mozilla/5.0 FreeImproStudent/1 iOS',viewport:{width:390,height:844}});
test('iOS neutral palette and animated microphone while holding recording',async({page})=>{
 await page.goto('/');await expect(page.locator('body')).toHaveClass(/ios-student/);
 await expect(page.locator('.nav-record-disc')).toHaveCSS('background-color','rgb(80, 80, 80)');
 const b=await page.locator('#studio-tab').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
 await expect(page.locator('#studio-tab')).toHaveClass(/recording/);await expect(page.locator('.recording-mic')).toBeVisible();
 await expect(page.locator('.recording-mic svg')).toHaveCSS('animation-name','mic-breathe');
 await page.waitForTimeout(600);await page.mouse.up();await expect(page.locator('#editor')).toBeVisible();await expect(page.locator('#capture-overlay')).toBeHidden();
});
