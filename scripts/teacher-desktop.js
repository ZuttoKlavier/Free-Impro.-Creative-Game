import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { packager } from '@electron/packager';

const stage = resolve('data/desktop-stage');
mkdirSync(stage, { recursive: true });
cpSync('desktop', stage, { recursive: true });
if (!existsSync('data/https/classroom-ca.crt')) throw new Error('请先运行 npm run setup:https。');
const config = JSON.parse(readFileSync('data/https/config.json'));
copyFileSync('data/https/classroom-ca.crt', join(stage, 'classroom-ca.crt'));
writeFileSync(join(stage, 'classroom.json'), JSON.stringify({ address: `https://${config.preferredHost}:${process.env.HTTPS_PORT || 8443}/` }));
if (process.argv[2] === 'prepare') { console.log(stage); }
else if (process.argv[2] === 'package') {
  const platform = process.argv[3] || process.platform, arch = process.argv[4] || process.arch;
  if (!['darwin', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error('支持 darwin/win32 和 arm64/x64。');
  const version = JSON.parse(readFileSync('node_modules/electron/package.json')).version;
  const result = await packager({ dir: stage, name: 'Free Impro Teacher', executableName: 'Free Impro Teacher', appBundleId: 'org.freeimpro.teacher.desktop', platform, arch, electronVersion: version, out: resolve('data/releases/desktop'), overwrite: true, asar: true, prune: false, download: { cacheRoot: resolve('data/electron-cache') } });
  console.log(result.join('\n'));
} else {
  const child = spawn(process.execPath, ['node_modules/electron/cli.js', stage], { stdio: 'inherit' });
  child.on('exit', code => { process.exitCode = code || 0; });
}
