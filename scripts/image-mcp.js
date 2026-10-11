import { constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, closeSync, mkdirSync, chmodSync, fchmodSync, fsyncSync, writeFileSync, renameSync, rmSync } from 'node:fs';
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

function runtimePathInfo(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function assertRuntimePath(path, directory) {
  const info = runtimePathInfo(path);
  if (!info) return null;
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) {
    throw new Error('隧道运行凭证路径必须为本机普通文件和目录，不接受符号链接；原配置保留。');
  }
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
    throw new Error('隧道运行凭证路径必须属于当前本机用户；原配置保留。');
  }
  return info;
}

// This checks format only. Authorization is verified separately by the official
// tunnel client. The CLI always uses the project path; the override is for tests.
export function saveImageRuntimeKey(value, projectRoot = root) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 512 || value.trim() !== value || !/^sk-[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('隧道运行密钥格式无效，请使用 sk- 开头的完整 ASCII 密钥（20–512 字符）；原配置保留。');
  }
  const base = resolve(projectRoot);
  if (!assertRuntimePath(base, true)) throw new Error('项目目录不存在；原配置保留。');
  for (const path of [resolve(base, 'data'), resolve(base, 'data/image-mcp')]) {
    if (!assertRuntimePath(path, true)) mkdirSync(path, { mode: 0o700 });
    assertRuntimePath(path, true);
  }
  const directory = resolve(base, 'data/image-mcp');
  const keyFile = resolve(directory, 'runtime-key');
  assertRuntimePath(keyFile, false);
  chmodSync(directory, 0o700);
  const temporary = keyFile + '.' + randomUUID() + '.tmp';
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    fchmodSync(fd, 0o600);
    writeFileSync(fd, value, 'utf8');
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    assertRuntimePath(directory, true);
    assertRuntimePath(keyFile, false);
    renameSync(temporary, keyFile);
    return keyFile;
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}

export async function configureImageRuntimeKey({ input = process.stdin, output = process.stdout, projectRoot = root } = {}) {
  if (!input.isTTY) throw new Error('请在本机交互终端运行隧道运行密钥配置；密钥不接受命令行参数。');
  output.write('粘贴 OpenAI Platform 的隧道运行密钥并按回车（输入不会显示；仅校验格式）：\n');
  const hiddenOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const prompt = createInterface({ input, output: hiddenOutput, terminal: true });
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  prompt.once('SIGINT', cancel);
  prompt.once('close', cancel);
  let value;
  try {
    value = (await prompt.question('', { signal: cancellation.signal })).trim();
  } catch (error) {
    if (cancellation.signal.aborted) throw new Error('已取消隧道运行密钥配置，原配置保留。');
    throw error;
  } finally {
    prompt.close();
    output.write('\n');
  }
  saveImageRuntimeKey(value, projectRoot);
  output.write('本机隧道运行凭证已保存，仅通过格式校验；尚未验证网络授权。\n');
}

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
    if (process.argv.includes('--configure-runtime-key')) {
      if (process.argv.length !== 3) throw new Error('隧道运行密钥只接受交互输入，不接受命令行密钥或其他参数。');
      await configureImageRuntimeKey();
    } else {
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
    }
  } catch (error) {
    // stdout is reserved for MCP frames. Do not print filesystem contents,
    // credentials, SQL errors or upstream logs to either output stream.
    console.error(error.code ? '本机图片连接配置无法读取，请检查凭证文件和数据库。' : error.message);
    process.exitCode = 1;
  }
}
