import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const allowedRootFiles = new Set(['package.json', 'package-lock.json', '.env.example', 'SERVER-RELEASE.md']);
const allowedRuntimeSources = new Set(['src/rhythm-data.js']);
function regularPath(directory, relative) {
  const parts = relative.split('/');
  if (!allowedRootFiles.has(relative) && !allowedRuntimeSources.has(relative) && !/^(server|scripts|deploy|requirements|dist|public|docs)\/[A-Za-z0-9_.\/-]+$/.test(relative)) throw new Error('发布清单包含不允许的文件范围。');
  if (relative !== '.env.example' && (parts.some(part => part.startsWith('.env')) || /\.(key|p8|pem|sqlite|db|keystore|jks|token)$/i.test(relative))) throw new Error('发布清单包含不允许的文件范围。');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('发布清单路径无效。');
  let path = directory;
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('发布文件不是受控的普通路径。');
  }
  return path;
}

export function verifyCloudRelease({ directory, expectedManifestSha256 }) {
  if (!/^[a-fA-F0-9]{64}$/.test(expectedManifestSha256 || '')) throw new Error('请提供来自已审查交付清单的发布清单 SHA256。');
  const root = resolve(directory);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('发布目录必须是实际目录。');
  const manifestPath = join(root, 'release-manifest.json');
  const manifestStat = lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 1024 * 1024) throw new Error('发布清单文件无效。');
  const bytes = readFileSync(manifestPath);
  if (digest(bytes) !== expectedManifestSha256.toLowerCase()) throw new Error('发布清单 SHA256 不匹配。');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('发布文件清单无效。');
  const files = Object.entries(manifest.files);
  if (!files.length || files.length > 10000) throw new Error('发布文件数量无效。');
  for (const [relative, expected] of files) {
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('发布文件校验值无效。');
    const path = regularPath(root, relative);
    if (lstatSync(path).size > 50 * 1024 * 1024 || digest(readFileSync(path)) !== expected) throw new Error('发布文件完整性校验失败。');
  }
  return { checkedFiles: files.length, sourceState: manifest.sourceState, deployed: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, expectedManifestSha256, ...extra] = process.argv.slice(2);
    if (!directory || !expectedManifestSha256 || extra.length) throw new Error('用法：node scripts/verify-cloud-release.js 发布目录 已审查的清单SHA256');
    const result = verifyCloudRelease({ directory, expectedManifestSha256 });
    console.log(`发布清单及 ${result.checkedFiles} 个文件的 SHA256 校验通过；未执行部署或读取课堂数据。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
