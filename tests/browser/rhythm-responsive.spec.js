import {test,expect} from '@playwright/test';
for(const [width,height] of [[568,320],[667,375],[844,390],[1024,768]]) {
 test(`all 16 steps and actions fit ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.goto('/');await page.locator('#demo').click();await page.locator('#sound-name').fill('适配测试');await page.locator('#save').click();await expect(page.locator('#library-count')).toHaveText('1');await page.locator('#library-tab').click();await page.locator('.sound-open').click();await page.getByRole('button',{name:'节奏编创',exact:true}).click();
 const cells=await page.locator('[data-step]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));expect(cells).toHaveLength(16);expect(new Set(cells.map(c=>c.y)).size).toBe(1);for(const c of cells){expect(c.x).toBeGreaterThanOrEqual(0);expect(c.right).toBeLessThanOrEqual(width);expect(c.bottom).toBeLessThanOrEqual(height);}
 for(const action of ['play','save','close']){const r=await page.locator(`[data-${action}]`).boundingBox();expect(r.y+r.height).toBeLessThanOrEqual(height);}
 await page.getByLabel('编创小节数').fill('16');await page.getByLabel('编创小节数').press('Tab');expect(await page.locator('.student-rhythm').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.screenshot({path:`test-results/rhythm-${width}.png`});
 });
}
