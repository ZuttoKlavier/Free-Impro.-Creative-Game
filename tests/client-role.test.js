import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/client-role.js', import.meta.url), 'utf8').replaceAll('export ', '')
  + '\nJSON.stringify({ clientRole, apiBase });';
function role(pathname, nativeStudent) {
  const context = { location: { pathname } };
  if (nativeStudent !== undefined) context.__STUDENT_IOS__ = nativeStudent;
  return JSON.parse(runInNewContext(source, context));
}

test('ordinary and protected administrator teacher previews use teacher UI and API paths', () => {
  for (const path of ['/teacher.html', '/api/admin/preview/teacher']) {
    for (const native of [undefined, false]) assert.deepEqual(role(path, native), { clientRole: 'teacher', apiBase: '/api/teacher' }, path);
  }
});

test('student pages and lookalike preview paths retain the student role', () => {
  for (const path of ['/', '/index.html', '/api/admin/preview/student', '/api/admin/preview/teacher-extra', '/api/admin/preview/teacher/', '/other/teacher.html']) {
    assert.deepEqual(role(path), { clientRole: 'student', apiBase: '/api/student' }, path);
  }
});

test('native student builds always retain the student role', () => {
  for (const path of ['/', '/teacher.html', '/api/admin/preview/teacher']) {
    assert.deepEqual(role(path, true), { clientRole: 'student', apiBase: '/api/student' }, path);
  }
});
