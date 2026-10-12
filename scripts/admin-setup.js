import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { provisionAdmin } from '../server/admin.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const dbPath = resolve(process.env.FREE_IMPRO_DB || 'data/classroom.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
let db;
let createdCredentialsFile;
async function secret(prompt) {
  if (!process.stdin.isTTY) throw new Error('请在终端交互输入管理员密码，或使用 --generate 将随机密码保存到本机文件。');
  const input = process.stdin;
  process.stdout.write(prompt);
  input.setRawMode(true); input.resume(); input.setEncoding('utf8');
  return new Promise((resolveSecret, reject) => {
    let value = '';
    function finish(error) { input.off('data', onData); input.setRawMode(false); input.pause(); process.stdout.write('\n'); error ? reject(error) : resolveSecret(value); }
    function onData(chunk) {
      for (const character of chunk) {
        if (character === '\u0003') { finish(new Error('已取消。')); return; }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ' && value.length < 128) value += character;
      }
    }
    input.on('data', onData);
  });
}
try {
  let username, password, name = '管理员', credentialsFile;
  if (process.argv.includes('--generate')) {
    username = 'admin'; password = randomBytes(24).toString('base64url');
    credentialsFile = resolve('data/admin/initial-login.txt');
    if (existsSync(credentialsFile)) throw new Error('本机初始登录文件已经存在。请使用交互模式创建或重置管理员，避免意外覆盖。');
  } else {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try { username = (await readline.question('管理员账号（3–32 位字母、数字或下划线）：')).trim(); name = (await readline.question('显示名称（默认管理员）：')).trim() || name; } finally { readline.close(); }
    password = await secret('密码（至少 12 位，不回显）：');
    if (password !== await secret('再次输入密码：')) throw new Error('两次密码不一致。');
  }
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  // Generated setup creates only a new account, never silently rotates one.
  if (credentialsFile && db.prepare("SELECT 1 FROM sqlite_master WHERE name='admin_accounts'").get() && db.prepare('SELECT 1 FROM admin_accounts WHERE username=?').get(username)) throw new Error('管理员 admin 已存在，请使用交互模式。');
  if (credentialsFile) {
    mkdirSync(dirname(credentialsFile), { recursive: true, mode: 0o700 });
    writeFileSync(credentialsFile, `后台入口：/api/admin/console\n管理员账号：${username}\n管理员密码：${password}\n\n此文件仅保存在服务电脑，不进入 GitHub。请妥善保管。\n`, { mode: 0o600, flag: 'wx' });
    createdCredentialsFile = credentialsFile;
  }
  await provisionAdmin(db, { username, password, name });
  createdCredentialsFile = undefined;
  console.log(credentialsFile ? `管理员已创建。登录信息仅保存在 ${credentialsFile}` : '管理员已创建或密码已更新。原管理员登录会话已撤销。');
} catch (error) { if (createdCredentialsFile) unlinkSync(createdCredentialsFile); console.error(error.message); process.exitCode = 1; } finally { db?.close(); }
