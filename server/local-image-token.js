import { constants, closeSync, chmodSync, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';

const localError = Symbol('local-image-token-error');

function failure(message, code) {
  const error = new Error(message);
  error.code = code;
  error[localError] = true;
  return error;
}

function pathInfo(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function safePath(path, directory) {
  const info = pathInfo(path);
  if (!info) return null;
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) ||
      (typeof process.getuid === 'function' && info.uid !== process.getuid())) {
    throw failure('本机图片连接保存路径不安全，请检查文件类型和所有权；原配置保留。', 'IMAGE_TOKEN_PATH_UNSAFE');
  }
  return info;
}

// tokenFile must come from the server's configuration, never from a request.
// Windows administrators must separately restrict access with filesystem ACLs;
// POSIX mode bits alone do not establish Windows access control.
export function saveLocalImageToken(token, tokenFile) {
  if (typeof token !== 'string' || token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) {
    throw failure('图片连接令牌无效，原配置保留。', 'IMAGE_TOKEN_INVALID');
  }
  if (typeof tokenFile !== 'string' || !isAbsolute(tokenFile)) {
    throw failure('本机图片连接保存位置必须由服务器配置为绝对路径；原配置保留。', 'IMAGE_TOKEN_PATH_INVALID');
  }
  let temporary;
  let fd;
  let committed = false;
  try {
    const target = resolve(tokenFile);
    const parent = dirname(target);
    let directory = safePath(parent, true);
    if (!directory) {
      if (!safePath(dirname(parent), true)) {
        throw failure('本机图片连接保存目录尚未准备好，原配置保留。', 'IMAGE_TOKEN_DIRECTORY_MISSING');
      }
      // Do not recursively create directories or change the data/DB directory.
      try { mkdirSync(parent, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      directory = safePath(parent, true);
      if (!directory) throw failure('本机图片连接保存目录尚未准备好，原配置保留。', 'IMAGE_TOKEN_DIRECTORY_MISSING');
    }
    safePath(target, false);
    chmodSync(parent, 0o700);
    temporary = target + '.' + randomUUID() + '.tmp';
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    fchmodSync(fd, 0o600);
    writeFileSync(fd, token, 'utf8');
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    const currentDirectory = safePath(parent, true);
    if (!currentDirectory || currentDirectory.dev !== directory.dev || currentDirectory.ino !== directory.ino) {
      throw failure('本机图片连接保存目录已变化，原配置保留。', 'IMAGE_TOKEN_PATH_CHANGED');
    }
    safePath(target, false);
    renameSync(temporary, target);
    committed = true;
  } catch (error) {
    if (error[localError]) throw error;
    // Avoid leaking filesystem paths, token values, or underlying error details.
    throw failure('本机图片连接令牌保存失败，请检查文件权限；原配置保留。', 'IMAGE_TOKEN_SAVE_FAILED');
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* The original save error remains private. */ }
    }
    if (temporary && !committed) {
      try { rmSync(temporary, { force: true }); } catch { /* No underlying details or credential contents are emitted. */ }
    }
  }
}
