import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const empty = () => ({ version: 1, pages: { student: {}, teacher: {} } });
const fixture = `<!doctype html><html><head><style>
body {background:#f0f0f0;color:#151515;margin:0;padding:16px;font-size:16px}
main {padding:8px;max-width:900px}.primary {background:#112233;color:#ffffff;font-size:18px;width:160px;height:50px}
.student-bottom-nav {display:flex;gap:8px}.nav-record-disc {display:block;width:60px;height:60px;background:#8899aa}
</style></head><body><main><h1 class="library-tools">Fixture</h1><form><button class="primary" type="submit">测试按钮</button></form>
<nav class="student-bottom-nav"><button class="nav-item"><span class="nav-record-disc">录音</span></button></nav>
<section hidden><div class="sound-card">隐藏卡片</div></section></main>
<script>window.activations=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.activations++};document.querySelector('.nav-item').onpointerdown=()=>window.activations++;</script>
<script type="module">import {initUIDesign} from '/src/ui-design.js';window.runtime=initUIDesign('student');</script></body></html>`;

async function mount(page, { preview = false, admin = true, design = empty(), delay } = {}) {
  await page.route('**/runtime-frame*', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.route('**/runtime-host', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><iframe style="width:700px;height:600px" src="/runtime-frame?uiPreview=1"></iframe></body></html>' }));
  await page.route('**/api/ui-design', async route => {
    if (delay) await delay;
    return route.fulfill({ json: { revision: 1, design, updatedAt: 1 } }).catch(() => {});
  });
  await page.route('**/api/admin/me', route => route.fulfill({ status: admin ? 200 : 401, json: admin ? { admin: { id: 'fixture-admin' } } : { error: '请登录' } }));
  await page.addInitScript(() => {
    window.previewMessages = [];
    window.addEventListener('message', event => { if (event.data?.type === 'fi-ui-preview') window.previewMessages.push(event.data); });
  });
  await page.goto(preview ? '/runtime-host' : '/runtime-frame');
  const frame = preview ? page.frames().find(candidate => candidate.url().includes('/runtime-frame')) : page.mainFrame();
  await expect(frame.locator('html')).toHaveAttribute('data-ui-page', 'student');
  if (preview && admin) await expect.poll(() => page.evaluate(() => window.previewMessages.some(message => message.action === 'ready'))).toBe(true);
  return frame;
}

const update = (page, design, selection = 'primary', editing = true) => page.evaluate(({ design, selection, editing }) => {
  document.querySelector('iframe').contentWindow.postMessage({ type: 'fi-ui-editor', action: 'update', design, selection, editing }, location.origin);
}, { design, selection, editing });

test('student runtime applies the published design and destroy restores defaults', async ({ page }) => {
  const design = empty(); design.pages.student.primary = { backgroundColor: '#aabbcc', fontSize: 24 };
  await mount(page, { design });
  await expect(page.locator('.primary')).toHaveCSS('background-color', 'rgb(170, 187, 204)');
  await expect(page.locator('.primary')).toHaveCSS('font-size', '24px');
  await expect(page.locator('#fi-ui-hint')).toHaveCount(0);
  await page.evaluate(() => window.runtime.destroy());
  await expect(page.locator('.primary')).toHaveCSS('background-color', 'rgb(17, 34, 51)');
  await expect(page.locator('html')).not.toHaveAttribute('data-ui-page');
});

for (const kind of ['student', 'teacher']) test(`protected ${kind} preview reads published settings through the administrator endpoint`, async ({ page }) => {
  const publicRequests = [];
  const design = empty(); design.pages[kind].primary = { fontSize: 32 };
  await page.route(`**/api/admin/preview/${kind}*`, route => route.fulfill({ contentType: 'text/html', body: fixture.replace("initUIDesign('student')", `initUIDesign('${kind}')`) }));
  await page.route('**/api/admin/ui-design', route => route.fulfill({ json: { design, revision: 1, updatedAt: 1 } }));
  await page.route('**/api/ui-design', route => { publicRequests.push(route.request().url()); return route.fulfill({ status: 404, json: {} }); });
  await page.goto(`/api/admin/preview/${kind}?uiPreview=1`);
  await expect(page.locator('.primary')).toHaveCSS('font-size', '32px');
  expect(publicRequests).toEqual([]);
});

test('protected previews skip service workers even in a production build', async ({ page }) => {
  const source = readFileSync(new URL('../../src/offline.js', import.meta.url), 'utf8').replace('import.meta.env.PROD', 'true');
  await page.route('**/offline-production-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: source }));
  await page.addInitScript(() => {
    window.swRegistrations = [];
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      async register(path) { window.swRegistrations.push(path); return { addEventListener() {}, waiting: false }; },
      ready: Promise.resolve({}),
    } });
  });
  const html = '<!doctype html><html><body><footer></footer><script type="module">import {initOffline} from "/offline-production-fixture.js";await initOffline();window.offlineInitialized=true;</script></body></html>';
  await page.route('**/api/admin/preview/student*', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/offline-regular-fixture', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('/api/admin/preview/student?uiPreview=1');
  await expect.poll(() => page.evaluate(() => window.offlineInitialized)).toBe(true);
  expect(await page.evaluate(() => window.swRegistrations)).toEqual([]);
  await expect(page.locator('#offline-ready')).toHaveCount(0);
  await page.goto('/offline-regular-fixture');
  await expect(page.locator('#offline-ready')).toHaveText('已准备离线创作');
  expect(await page.evaluate(() => window.swRegistrations)).toEqual(['/sw.js']);
});

test('offline student makes no initial requests and clears an old server design on disconnect', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
  await page.addInitScript(() => {
    window.nativeDesignCalls = [];
    window.FreeImproClassroom = {
      offline: true, connected: false, generation: 0,
      request(path) {
        window.nativeDesignCalls.push(path);
        if (window.holdNativeDesign) return new Promise(resolve => { window.finishNativeDesign = resolve; });
        return Promise.resolve(new Response(JSON.stringify({ design: { version: 1, pages: { student: { primary: { fontSize: 31 } }, teacher: {} } } }), { headers: { 'Content-Type': 'application/json' } }));
      },
    };
  });
  await mount(page);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => window.nativeDesignCalls)).toEqual([]);
  await page.evaluate(() => {
    window.FreeImproClassroom.connected = true;
    window.dispatchEvent(new Event('freeimpro-classroom-connected'));
  });
  await expect(page.locator('.primary')).toHaveCSS('font-size', '31px');
  expect(await page.evaluate(() => window.nativeDesignCalls)).toEqual(['/api/student/ui-design']);
  await page.evaluate(() => { window.holdNativeDesign = true; window.runtime.refresh(); });
  await page.evaluate(() => {
    window.FreeImproClassroom.connected = false; window.FreeImproClassroom.generation++;
    window.dispatchEvent(new Event('freeimpro-classroom-disconnected'));
    window.finishNativeDesign(new Response(JSON.stringify({ design: { version: 1, pages: { student: { primary: { fontSize: 44 } }, teacher: {} } } })));
  });
  await expect(page.locator('.primary')).toHaveCSS('font-size', '18px');
  expect(requests).toEqual([]);
});

test('preview requires an administrator session and rejects forged sources and origins', async ({ page }) => {
  const frame = await mount(page, { preview: true, admin: false });
  const design = empty(); design.pages.student.primary = { fontSize: 30 };
  await update(page, design);
  await expect(frame.locator('.primary')).toHaveCSS('font-size', '18px');
  await expect(frame.locator('#fi-ui-hint')).toHaveCount(0);
  await frame.locator('.primary').click();
  expect(await frame.evaluate(() => window.activations)).toBe(1);
});

test('authorized preview selects without activating controls, unsets overrides and reports hidden targets', async ({ page }) => {
  const frame = await mount(page, { preview: true });
  const design = empty(); design.pages.student.primary = { fontSize: 30, backgroundColor: '#aabbcc' };
  await update(page, design);
  await expect(frame.locator('.primary')).toHaveCSS('font-size', '30px');
  await frame.locator('.primary').click();
  await frame.locator('.nav-record-disc').click();
  expect(await frame.evaluate(() => window.activations)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.previewMessages.filter(message => message.action === 'selected').at(-1)?.target)).toBe('record');
  await update(page, empty(), 'primary');
  await expect(frame.locator('.primary')).toHaveCSS('font-size', '18px');
  await expect.poll(() => page.evaluate(() => window.previewMessages.filter(message => message.action === 'selected').at(-1)?.values.fontSize)).toBe(18);
  await update(page, empty(), 'soundCards');
  await expect.poll(() => page.evaluate(() => window.previewMessages.filter(message => message.action === 'selected').at(-1)?.available)).toBe(false);
  await update(page, empty(), 'primary', false);
  await frame.locator('.primary').click();
  expect(await frame.evaluate(() => window.activations)).toBe(1);
});

test('editing preserves Tab and Shift+Tab focus navigation into and out of the preview', async ({ page }) => {
  const frame = await mount(page, { preview: true });
  await update(page, empty());
  await expect(frame.locator('html')).toHaveAttribute('data-ui-editing', 'true');
  await page.evaluate(() => {
    const button = document.createElement('button'); button.id = 'after-preview'; button.textContent = '返回编辑控件';
    document.querySelector('iframe').after(button);
  });
  expect(await frame.evaluate(() => ['keydown', 'keyup'].flatMap(type => [false, true].map(shiftKey => {
    const event = new KeyboardEvent(type, { key: 'Tab', code: 'Tab', shiftKey, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })))).toEqual([false, false, false, false]);
  await frame.locator('.primary').focus();
  await page.keyboard.press('Tab');
  await expect(frame.locator('.nav-item')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(frame.locator('.primary')).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await frame.evaluate(() => window.activations)).toBe(0);
  await frame.locator('.nav-item').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#after-preview')).toBeFocused();
});

test('preview ignores untrusted messages and does not lose the draft to a late published response', async ({ page }) => {
  let release;
  const delay = new Promise(resolve => { release = resolve; });
  const published = empty(); published.pages.student.primary = { fontSize: 40 };
  const frame = await mount(page, { preview: true, design: published, delay });
  const draft = empty(); draft.pages.student.primary = { fontSize: 25 };
  await frame.evaluate(design => {
    const data = { type: 'fi-ui-editor', action: 'update', design, editing: true, selection: 'primary' };
    window.dispatchEvent(new MessageEvent('message', { data, origin: 'https://untrusted.example', source: parent }));
    window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: window }));
  }, draft);
  await expect(frame.locator('.primary')).toHaveCSS('font-size', '18px');
  await update(page, draft);
  await expect(frame.locator('.primary')).toHaveCSS('font-size', '25px');
  const publishedResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/ui-design');
  release();
  await publishedResponse;
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => frame.locator('#fi-ui-design').textContent()).toContain('25px');
  await expect(frame.locator('.primary')).toHaveCSS('font-size', '25px');
});

test('preview dragging sends bounded offsets to the parent without activating the control', async ({ page }) => {
  const frame = await mount(page, { preview: true });
  await update(page, empty());
  await expect(frame.locator('html')).toHaveAttribute('data-ui-editing', 'true');
  const bounds = await frame.locator('.primary').boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 230, bounds.y + bounds.height / 2 + 180, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.previewMessages.find(message => message.action === 'changed'))).toMatchObject({ target: 'primary', styles: { x: 160, y: 160 } });
  expect(await frame.evaluate(() => window.activations)).toBe(0);
});

test('an expired administrator session closes editing and discards the preview draft', async ({ page }) => {
  const frame = await mount(page, { preview: true });
  const design = empty(); design.pages.student.primary = { fontSize: 30 };
  await update(page, design);
  await expect(frame.locator('.primary')).toHaveCSS('font-size', '30px');
  await page.route('**/api/admin/me', route => route.fulfill({ status: 401, json: { error: '登录已失效' } }));
  await frame.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => window.previewMessages.some(message => message.action === 'unauthorized'))).toBe(true);
  await expect(frame.locator('html')).toHaveAttribute('data-ui-editing', 'false');
  await expect(frame.locator('.primary')).toHaveCSS('font-size', '18px');
  await update(page, design);
  await expect(frame.locator('.primary')).toHaveCSS('font-size', '18px');
});
