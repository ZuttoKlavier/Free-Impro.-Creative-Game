const prefix = '/api/admin/preview';
const fail = (status, message) => Object.assign(new Error(message), { status });
const csp = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'none'; frame-src 'none'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

function previewHTML(body) {
  return body.toString('utf8')
    .replace(/<link\b[^>]*>/gi, tag => /\brel\s*=\s*(?:"[^"]*\bmanifest\b[^"]*"|'[^']*\bmanifest\b[^']*'|manifest(?=\s|\/?>))/i.test(tag) ? '' : tag)
    .replace(/(\b(?:src|href)\s*=\s*)(["'])(\/assets\/[^"']*|\/icon\.svg(?:[?#][^"']*)?)\2/gi, (_, attr, quote, path) => `${attr}${quote}${prefix}${path}${quote}`)
    .replace(/(\b(?:src|href)\s*=\s*)(\/assets\/[^\s>"']*|\/icon\.svg(?:[?#][^\s>"']*)?)(?=\s|>)/gi, (_, attr, path) => `${attr}${prefix}${path}`);
}

// Receives only the immutable, allow-listed build files collected by cloud.js.
// No URL is ever resolved against the filesystem or proxied to classroom APIs.
export function createAdminPreview(files) {
  const enabled = files instanceof Map;
  const config = () => enabled ? {
    previewPages: { student: prefix + '/student', teacher: prefix + '/teacher' }, readOnlyPreview: true,
  } : { previewPages: { student: '/', teacher: '/teacher.html' }, readOnlyPreview: false };

  function serve(req, res) {
    if (req.method !== 'GET') throw fail(405, '页面预览只支持读取。');
    const path = req.url.split('?')[0];
    // Exact lookup, without decoding, prevents encoded or normalized spellings
    // from acquiring authority to read another path in the protected namespace.
    if (!path.startsWith(prefix + '/') || /[%\\#\s]|\/{2}|(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) throw fail(400, '预览地址无效。');
    if (!enabled) throw fail(404, '当前服务没有可用的构建预览。');
    const page = path === prefix + '/student' ? '/index.html' : path === prefix + '/teacher' ? '/teacher.html' : null;
    let key = page;
    if (!key && path === prefix + '/icon.svg') key = '/icon.svg';
    if (!key && path.startsWith(prefix + '/assets/')) {
      const asset = path.slice(prefix.length);
      if (!asset.split('/').slice(2).every(segment => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(segment))) throw fail(400, '预览资源地址无效。');
      key = asset;
    }
    const file = key && files.get(key);
    if (!file) throw fail(404, '预览资源不存在。');
    const body = page ? Buffer.from(previewHTML(file.body)) : file.body;
    res.writeHead(200, {
      'Content-Type': file.type, 'Content-Length': body.length,
      'Content-Security-Policy': csp, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(body);
  }

  return { config, serve };
}
