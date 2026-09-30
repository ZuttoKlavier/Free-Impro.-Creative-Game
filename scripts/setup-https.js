import { existsSync } from 'node:fs';
import { certificateHosts, prepareCertificates } from './https-certificates.js';
if (existsSync('.env')) process.loadEnvFile('.env');
try {
  const hosts = certificateHosts(process.argv.length > 2 ? process.argv.slice(2) : undefined);
  const config = prepareCertificates({ directory: process.env.HTTPS_CERT_DIR || 'data/https', hosts });
  console.log(`课堂证书已准备：${config.hosts.join(', ')}\nCA SHA-256：${config.caFingerprint}\n请运行 npm run classroom，再按连接页指引为设备安装 CA 公钥证书。\n私钥保存在本机 data/https 中，安装到设备的文件仅为 classroom-ca.crt。`);
  if (config.preferredHost === 'localhost') console.log('当前未发现局域网 IPv4 地址。连接共同 Wi-Fi 后重新运行 npm run setup:https。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
