import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../../public/admin-page-editor.js', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../server/ui-design-schema.js', import.meta.url), 'utf8');
const local = { previewPages: { student: '/', teacher: '/teacher.html' }, readOnlyPreview: false };
const protectedConfig = { previewPages: { student: '/api/admin/preview/student', teacher: '/api/admin/preview/teacher' }, readOnlyPreview: true };

async function setup(page, { config = protectedConfig, status = 200, delay } = {}) {
  const calls = [];
  await page.route('**/editor-fixture/page-editor.js', route => route.fulfill({ contentType: 'text/javascript', body: script }));
  await page.route('**/editor-fixture/ui-design-schema.js', route => route.fulfill({ contentType: 'text/javascript', body: schema }));
  await page.route(url => ['/', '/teacher.html', '/api/admin/preview/student', '/api/admin/preview/teacher'].includes(url.pathname), route => {
    const kind = route.request().url().includes('teacher') ? 'teacher' : 'student';
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"></head><body><button id="navigate" onclick="this.textContent='已切换页面'">切换页面</button><script>const ready=()=>parent.postMessage({type:'fi-ui-preview',action:'ready',page:'${kind}'},location.origin);addEventListener('message',event=>{if(event.data.action==='request')ready()});ready();</script></body></html>` });
  });
  await page.route('**/api/admin/editor-config', async route => {
    calls.push('config'); if (delay) await delay;
    return route.fulfill({ status, json: status === 200 ? config : { error: '配置服务不可用' } });
  });
  await page.route('**/api/admin/ui-design', route => {
    calls.push('design');
    return route.fulfill({ json: { design: { version: 1, pages: { student: {}, teacher: {} } }, revision: 0, updatedAt: null } });
  });
  await page.route('**/editor-config-host', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><div id="root"></div><script type="module">
    import {createPageEditor} from '/editor-fixture/page-editor.js';
    const api=async path=>{const response=await fetch('/api/admin'+path);const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});return data;};
    window.editor=createPageEditor({root:document.querySelector('#root'),api});await window.editor.activate();window.activated=true;
  </script></body></html>` }));
  await page.goto('/editor-config-host');
  return calls;
}

test('editor waits for its protected preview configuration and keeps static navigation available', async ({ page }) => {
  let release;
  const delay = new Promise(resolve => { release = resolve; });
  const calls = await setup(page, { delay });
  await expect.poll(() => calls).toEqual(['config']);
  await expect(page.locator('#ui-editor-frame')).toHaveCount(0);
  release();
  await expect(page.locator('#ui-editor-frame')).toHaveAttribute('src', /\/api\/admin\/preview\/student\?uiPreview=1$/);
  await expect(page.locator('#ui-editor-mode')).toBeEnabled();
  expect(calls).toEqual(['config', 'design']);
  await expect(page.locator('#ui-editor-preview-note')).toContainText('预览仅用于调整外观，不进行真实课堂操作');
  await page.frameLocator('#ui-editor-frame').locator('#navigate').click();
  await expect(page.frameLocator('#ui-editor-frame').locator('#navigate')).toHaveText('已切换页面');
  await page.locator('#ui-editor-page').selectOption('teacher');
  await expect(page.locator('#ui-editor-frame')).toHaveAttribute('src', /\/api\/admin\/preview\/teacher\?uiPreview=1$/);
});

test('older servers may fall back to local pages only on a configuration 404', async ({ page }) => {
  const calls = await setup(page, { status: 404 });
  await expect(page.locator('#ui-editor-frame')).toHaveAttribute('src', /\/(?=\?uiPreview=1$)/);
  await expect(page.locator('#ui-editor-mode')).toBeEnabled();
  expect(calls).toEqual(['config', 'design']);
  await expect(page.locator('#ui-editor-mode-help')).toHaveText('关闭时可正常切换页面和滚动浏览。');
});

test('configuration errors remain visible and do not mount an unintended local preview', async ({ page }) => {
  const calls = await setup(page, { status: 503 });
  await expect(page.locator('#ui-editor-notice')).toHaveText('配置服务不可用');
  await expect(page.locator('#ui-editor-frame')).toHaveCount(0);
  expect(calls).toEqual(['config']);
});

test('editor rejects a configuration that would send preview messages to another origin', async ({ page }) => {
  const calls = await setup(page, { config: { ...local, previewPages: { ...local.previewPages, student: 'https://class.example.com/' } } });
  await expect(page.locator('#ui-editor-notice')).toContainText('页面预览必须使用本站受支持的地址');
  await expect(page.locator('#ui-editor-frame')).toHaveCount(0);
  expect(calls).toEqual(['config']);
});
