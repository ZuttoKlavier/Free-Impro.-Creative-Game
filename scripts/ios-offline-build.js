import { build } from 'vite';

export async function buildStudentDocument() {
  // A self-contained student document needs no teacher page, remote assets,
  // CDN or service-worker warm-up, including on the first installation.
  const result = await build({ configFile: false, logLevel: 'warn', define: { __STUDENT_IOS__: 'true' }, build: { write: false, cssCodeSplit: false, assetsInlineLimit: Number.MAX_SAFE_INTEGER, rollupOptions: { input: 'src/main.js', output: { format: 'iife', inlineDynamicImports: true, name: 'StudentApp' } } } });
  const output = result.output;
  const script = output.find(file => file.type === 'chunk' && file.isEntry)?.code;
  const css = output.filter(file => file.type === 'asset' && file.fileName.endsWith('.css')).map(file => file.source).join('\n');
  if (!script || output.some(file => file.type === 'chunk' && !file.isEntry)) throw new Error('学生离线页面未完整打包。');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>我的声音库</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="app"></div><script>${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
}
