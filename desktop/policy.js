import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';

export function classroomAddress(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/', '/teacher.html'].includes(url.pathname)) throw new Error('请输入课堂 HTTPS 地址，不包含课堂码或其他路径。');
  return url.origin + '/';
}
export function teacherNavigation(input, address) {
  try { const url = new URL(input); return url.origin === new URL(address).origin && url.pathname === '/teacher.html' && !url.search && !url.hash && !url.username && !url.password; } catch { return false; }
}
export function teacherResource(input, address) {
  try {
    const url = new URL(input);
    if (url.origin !== new URL(address).origin || url.username || url.password || /%|\\|\.\./.test(url.pathname)) return false;
    return teacherNavigation(input, address) || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/api/teacher/') || ['/connection.json', '/teacher.webmanifest', '/icon.svg'].includes(url.pathname);
  } catch { return false; }
}
export function classroomCertificate(pem, caPEM, hostname, address, now = Date.now()) {
  try {
    const host = new URL(address).hostname.replace(/^\[|\]$/g, '');
    if (hostname !== host) return false;
    const certificate = new X509Certificate(pem), ca = new X509Certificate(caPEM);
    return ca.ca && certificate.verify(ca.publicKey) && [certificate, ca].every(cert => Date.parse(cert.validFrom) <= now && Date.parse(cert.validTo) > now) && !!(isIP(host) ? certificate.checkIP(host) : certificate.checkHost(host));
  } catch { return false; }
}
