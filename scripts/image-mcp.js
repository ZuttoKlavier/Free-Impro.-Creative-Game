import { constants, existsSync, fstatSync, openSync, readFileSync, closeSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createImageWorkflow } from '../server/image-workflow.js';
import { createImageMcp } from '../server/image-mcp.js';

const root = fileURLToPath(new URL('../', import.meta.url));

function readToken(path) {
  if (!path || !existsSync(path)) throw new Error('请先在教师端创建图片连接令牌，再运行 npm run mcp:images:configure 保存本机凭证。');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 128) throw new Error('图片连接凭证文件无效。');
    if (process.platform !== 'win32' && (info.mode & 0o077)) throw new Error('连接凭证仅限本机用户读取，请将文件权限设为 600。');
    const token = readFileSync(fd, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('图片连接凭证无效，请重新配置。');
    return token;
  } finally { closeSync(fd); }
}

async function configureToken(dbPath, tokenFile) {
  if (!process.stdin.isTTY) throw new Error('请在本机终端运行凭证配置，令牌不接受命令行参数。');
  console.log('粘贴教师端的图片连接令牌并按回车（输入不会显示）：');
  const hiddenOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const prompt = createInterface({ input: process.stdin, output: hiddenOutput, terminal: true });
  prompt.on('SIGINT', () => prompt.close());
  let token;
  try { token = (await prompt.question('')).trim(); } finally { prompt.close(); console.log(); }
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('图片连接凭证无效，原配置保留。');
  mkdirSync(dirname(tokenFile), { recursive: true, mode: 0o700 });
  const temporary = tokenFile + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, token, { mode: 0o600, flag: 'wx' });
    const probe = openImageBridge({ dbPath, tokenFile: temporary });
    await probe.close();
    renameSync(temporary, tokenFile);
    console.log('本机图片连接凭证已保存。可运行 npm run mcp:images:check 检查；凭证过期后重新配置。');
  } finally { rmSync(temporary, { force: true }); }
}

// No public listener, arbitrary filesystem tools, Plus login or image API.
// The tunnel client can run this command as its narrowly scoped stdio server.
export function openImageBridge({ dbPath, tokenFile, now = Date.now }) {
  const token = readToken(tokenFile);
  if (!existsSync(dbPath)) throw new Error('课堂数据库不存在，请先启动教师课堂服务。');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const workflow = createImageWorkflow(db, now);
    const user = workflow.authenticateToken(token);
    const mcp = createImageMcp(workflow, user, { beforeTool: () => workflow.recordToolActivity(token) });
    let closed = false;
    return { workflow, user, mcp, close: async () => { if (closed) return; closed = true; try { await mcp.close(); } finally { db.close(); } } };
  } catch (error) { db.close(); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const envPath = resolve(root, '.env'); if (existsSync(envPath)) process.loadEnvFile(envPath);
    const dbPath = resolve(root, process.env.FREE_IMPRO_DB || 'data/classroom.sqlite');
    const tokenFile = resolve(root, process.env.FREE_IMPRO_IMAGE_TOKEN_FILE || 'data/image-mcp/teacher.token');
    if (process.argv.includes('--configure')) {
      await configureToken(dbPath, tokenFile);
    } else {
      const bridge = openImageBridge({ dbPath, tokenFile });
      if (process.argv.includes('--check')) {
        console.log(JSON.stringify({ ok: true, transport: 'stdio', ...bridge.workflow.connectionStatus(bridge.user) }));
        await bridge.close();
      } else {
        await bridge.mcp.connect(new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 1300000 }));
        for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await bridge.close(); process.exit(0); });
        process.stdin.once('end', () => { void bridge.close(); });
      }
    }
  } catch (error) {
    // stdout is reserved for MCP frames. Do not print filesystem contents,
    // credentials, SQL errors or upstream logs to either output stream.
    console.error(error.code ? '本机图片连接配置无法读取，请检查凭证文件和数据库。' : error.message);
    process.exitCode = 1;
  }
}
