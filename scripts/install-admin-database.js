import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'data/admin');
const environment = resolve(directory, 'venv');
const python = process.platform === 'win32' ? resolve(environment, 'Scripts/python.exe') : resolve(environment, 'bin/python');
const bootstrap = process.env.ADMIN_DATABASE_BOOTSTRAP_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
mkdirSync(directory, { recursive: true, mode: 0o700 });
for (const [command, arguments_] of [
  [bootstrap, ['-m', 'venv', environment]],
  [python, ['-m', 'pip', 'install', '--no-cache-dir', '--disable-pip-version-check', '-r', resolve(root, 'requirements/admin-database.txt')]],
]) {
  const result = spawnSync(command, arguments_, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) {
    console.error('数据库浏览工具安装失败，请确认 Python 3 和网络可用。');
    process.exit(1);
  }
}
console.log('管理员数据库浏览工具已安装。运行文件保存在 data/admin/venv，不会上传到 GitHub。');
