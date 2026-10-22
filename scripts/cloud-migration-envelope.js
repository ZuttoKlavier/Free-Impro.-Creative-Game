import { constants, createCipheriv, createDecipheriv, createHash, publicEncrypt, privateDecrypt, randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

const magic = Buffer.from('EMPVCMIG1\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function regular(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('迁移文件必须是实际文件。');
}

// The receiving server creates its private key locally. Only its public key
// leaves that server; uploaded chunks contain encrypted data, never login data.
export function encryptSnapshot({ source, publicKey, directory }) {
  regular(source);
  const plain = readFileSync(source);
  if (!plain.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) throw new Error('不是 SQLite 课堂快照。');
  const key = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(magic);
  const encrypted = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  const header = Buffer.from(JSON.stringify({ version: 1, bytes: plain.length, sha256: digest(plain), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), key: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64') }));
  key.fill(0);
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  const envelope = Buffer.concat([magic, length, header, encrypted]);
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  const parts = [];
  for (let offset = 0, index = 0; offset < envelope.length; offset += 24 * 1024, index++) {
    const name = `part-${String(index).padStart(4, '0')}.bin`;
    writeFileSync(join(directory, name), envelope.subarray(offset, offset + 24 * 1024), { flag: 'wx', mode: 0o600 }); parts.push(name);
  }
  return { sha256: digest(plain), envelopeSha256: digest(envelope), bytes: plain.length, parts, directory: resolve(directory) };
}

export function decryptSnapshot({ directory, privateKey, expectedSha256, envelopeSha256, partCount, output }) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || !/^[a-f0-9]{64}$/.test(envelopeSha256) || !Number.isInteger(partCount) || partCount < 1 || partCount > 10000) throw new Error('无效迁移清单。');
  const names = Array.from({ length: partCount }, (_, index) => `part-${String(index).padStart(4, '0')}.bin`);
  if (readdirSync(directory).filter(name => /^part-\d+\.bin$/.test(name)).length !== partCount) throw new Error('迁移分片数量不符。');
  const chunks = names.map(name => { const path = join(directory, name); regular(path); const bytes = readFileSync(path); if (bytes.length < 1 || bytes.length > 24 * 1024) throw new Error('无效迁移分片。'); return bytes; });
  const envelope = Buffer.concat(chunks);
  if (digest(envelope) !== envelopeSha256 || !envelope.subarray(0, magic.length).equals(magic)) throw new Error('加密迁移文件校验失败。');
  const size = envelope.readUInt32BE(magic.length);
  if (size < 1 || size > 4096 || envelope.length <= magic.length + 4 + size) throw new Error('迁移文件头无效。');
  const start = magic.length + 4, header = JSON.parse(envelope.subarray(start, start + size));
  if (header.version !== 1 || header.sha256 !== expectedSha256 || !Number.isInteger(header.bytes) || header.bytes < 16 || header.bytes > 512 * 1024 * 1024) throw new Error('课堂快照清单不符。');
  const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(header.key, 'base64'));
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'));
    decipher.setAAD(magic); decipher.setAuthTag(Buffer.from(header.tag, 'base64'));
    const compressed = Buffer.concat([decipher.update(envelope.subarray(start + size)), decipher.final()]);
    const plain = gunzipSync(compressed, { maxOutputLength: header.bytes });
    if (plain.length !== header.bytes || digest(plain) !== expectedSha256 || !plain.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) throw new Error('课堂快照解密后校验失败。');
    writeFileSync(output, plain, { flag: 'wx', mode: 0o600 });
    return { sha256: digest(plain), bytes: plain.length };
  } finally { key.fill(0); }
}
