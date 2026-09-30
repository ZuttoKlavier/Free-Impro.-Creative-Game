import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, renameSync, rmSync, chmodSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { randomBytes, X509Certificate, createPrivateKey } from 'node:crypto';

export function lanAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flat().filter(item => item && !item.internal && item.family === 'IPv4' && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address)).map(item => item.address))];
}

export function certificateHosts(requested = lanAddresses()) {
  const hosts = [...new Set([...requested, 'localhost', '127.0.0.1'])];
  for (const host of hosts) {
    if (typeof host !== 'string' || !(isIP(host) || (host.length <= 253 && host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))))) throw new Error('证书地址需为 IP 或主机名，不包含协议、端口或路径。');
  }
  return hosts;
}

function findOpenSSL() {
  if (process.env.OPENSSL_BIN) return process.env.OPENSSL_BIN;
  const candidates = ['openssl'];
  if (process.platform === 'win32') for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) candidates.push(join(root, 'Git', 'usr', 'bin', 'openssl.exe'));
  for (const candidate of candidates) {
    try { execFileSync(candidate, ['version'], { stdio: 'ignore' }); return candidate; } catch {}
  }
  throw new Error('未找到 OpenSSL。macOS 可使用系统 OpenSSL；Windows 可安装 Git for Windows，或通过 OPENSSL_BIN 指定 openssl.exe。');
}

export function prepareCertificates({ directory = 'data/https', hosts = certificateHosts(), preferredHost = hosts[0] } = {}) {
  hosts = certificateHosts(hosts);
  if (!hosts.includes(preferredHost)) throw new Error('首选地址必须包含在证书地址中。');
  const openssl = findOpenSSL(), dir = resolve(directory);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const work = mkdtempSync(join(dir, '.generate-'));
  const run = args => execFileSync(openssl, args, { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
  const caKey = join(dir, 'classroom-ca.key'), caFile = join(dir, 'classroom-ca.crt');
  try {
    if (existsSync(caKey) !== existsSync(caFile)) throw new Error('本地 CA 文件不完整，请先恢复 data/https 中的 CA 证书与私钥，避免更换已受信任的身份。');
    if (!existsSync(caKey)) {
      writeFileSync(join(work, 'ca.cnf'), '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=Free Impro Classroom Local CA\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
      run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-config', 'ca.cnf', '-keyout', 'ca.key', '-out', 'ca.crt']);
      chmodSync(join(work, 'ca.key'), 0o600);
      renameSync(join(work, 'ca.key'), caKey); renameSync(join(work, 'ca.crt'), caFile);
    }
    const ca = new X509Certificate(readFileSync(caFile));
    if (!ca.ca || !ca.checkPrivateKey(createPrivateKey(readFileSync(caKey))) || Date.parse(ca.validTo) < Date.now() + 398 * 86400000) throw new Error('本地 CA 无效、私钥不匹配或即将过期，请重新配置课堂证书。');
    const names = hosts.map(host => `${isIP(host) ? 'IP' : 'DNS'}:${host}`).join(',');
    writeFileSync(join(work, 'server.cnf'), `[req]\nprompt=no\ndistinguished_name=dn\n[dn]\nCN=Free Impro Classroom\n[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${names}\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n`);
    run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-config', 'server.cnf', '-keyout', 'server.key', '-out', 'server.csr']);
    run(['x509', '-req', '-sha256', '-days', '397', '-in', 'server.csr', '-CA', caFile, '-CAkey', caKey, '-set_serial', '0x' + randomBytes(16).toString('hex'), '-extfile', 'server.cnf', '-extensions', 'server', '-out', 'server.crt']);
    chmodSync(join(work, 'server.key'), 0o600);
    for (const name of ['server.key', 'server.crt']) renameSync(join(work, name), join(dir, name));
    const config = { hosts, preferredHost, caFingerprint: ca.fingerprint256, generatedAt: new Date().toISOString() };
    writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
    return config;
  } finally { rmSync(work, { recursive: true, force: true }); }
}
