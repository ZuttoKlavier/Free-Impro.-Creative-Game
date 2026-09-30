import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareCertificates } from '../scripts/https-certificates.js';
import { classroomAddress, teacherNavigation, teacherResource, classroomCertificate } from '../desktop/policy.js';

test('desktop opens only teacher pages and teacher resources on the configured HTTPS origin', () => {
  const address = classroomAddress('https://localhost:8443/teacher.html');
  assert.equal(address, 'https://localhost:8443/');
  assert.ok(teacherNavigation(address + 'teacher.html', address));
  assert.ok(teacherResource(address + 'api/teacher/me', address));
  for (const path of ['/', '/index.html', '/api/student/me', '/teacher.html?role=student', '/connection']) assert.equal(teacherNavigation(new URL(path, address), address), false);
  for (const url of ['http://localhost:8443/teacher.html', 'https://evil.test/teacher.html', 'https://localhost:8444/teacher.html', 'file:///tmp/x', address + 'api/student/me']) assert.equal(teacherResource(url, address), false);
  for (const url of ['http://localhost:8443/', 'https://user:secret@localhost/', address + '?next=x']) assert.throws(() => classroomAddress(url));
});
test('desktop trust is limited to the classroom CA, hostname and certificate validity', t => {
  const dir = mkdtempSync(join(tmpdir(), 'teacher-trust-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  prepareCertificates({ directory: dir, hosts: ['localhost'] });
  const ca = readFileSync(join(dir, 'classroom-ca.crt')), cert = readFileSync(join(dir, 'server.crt'));
  assert.ok(classroomCertificate(cert, ca, 'localhost', 'https://localhost:8443/'));
  assert.equal(classroomCertificate(cert, cert, 'localhost', 'https://localhost:8443/'), false);
  assert.equal(classroomCertificate(cert, ca, 'evil.test', 'https://localhost:8443/'), false);
  assert.equal(classroomCertificate(cert, ca, 'localhost', 'https://localhost:8443/', Date.now() + 500 * 86400000), false);
});
