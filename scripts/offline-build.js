import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Cache only the immutable application shell. Accounts, photos and audio stay
// out of the service-worker cache and continue using their existing storage.
export function offlineBuild() {
  return {
    name: 'free-impro-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const assets = ['/index.html', '/teacher.html', '/manifest.webmanifest', '/teacher.webmanifest', '/icon.svg', ...Object.keys(bundle).filter(name => /\.(js|css|woff2?)$/.test(name)).map(name => '/' + name)];
      const version = createHash('sha256').update(JSON.stringify(assets)).update(readFileSync(new URL('../index.html', import.meta.url))).update(readFileSync(new URL('../teacher.html', import.meta.url))).update(readFileSync(new URL('../public/teacher.webmanifest', import.meta.url))).update(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url))).update(readFileSync(new URL('../public/icon.svg', import.meta.url))).update(readFileSync(new URL('../scripts/service-worker.js', import.meta.url))).digest('hex').slice(0, 16);
      const template = readFileSync(new URL('../scripts/service-worker.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('__CACHE_NAME__', JSON.stringify('free-impro-shell-' + version)).replace('__PRECACHE__', JSON.stringify(assets)) });
      const studentAssets = assets.filter(path => !['/teacher.html', '/teacher.webmanifest'].includes(path));
      this.emitFile({ type: 'asset', fileName: 'student-sw.js', source: template.replace('__CACHE_NAME__', JSON.stringify('free-impro-shell-student-' + version)).replace('__PRECACHE__', JSON.stringify(studentAssets)) });
    },
  };
}
