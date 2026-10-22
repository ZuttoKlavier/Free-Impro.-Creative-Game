import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_PAGES, UI_PROPERTIES, emptyDesign, validateDesign, designCSS } from '../server/ui-design-schema.js';

test('UI design accepts only known targets, properties, bounded integers and six-digit colors', () => {
  const valid = emptyDesign();
  valid.pages.student.primary = { backgroundColor: '#AABBCC', fontSize: 22, x: -160, y: 160 };
  assert.deepEqual(validateDesign(valid).pages.student.primary, { backgroundColor: '#aabbcc', fontSize: 22, x: -160, y: 160 });
  for (const input of [
    { ...valid, version: 2 },
    { ...valid, arbitrary: 'value' },
    { version: 1, pages: { admin: {} } },
    { version: 1, pages: { student: { script: {} } } },
    { version: 1, pages: { student: { primary: { position: 'fixed' } } } },
    { version: 1, pages: { student: { primary: { backgroundColor: 'red;display:none' } } } },
    { version: 1, pages: { student: { primary: { fontSize: 22.5 } } } },
    { version: 1, pages: { student: { primary: { x: 161 } } } },
    { version: 1, pages: { student: { primary: { height: -1 } } } },
    JSON.parse('{"version":1,"pages":{"student":{"__proto__":{}}}}'),
  ]) assert.throws(() => validateDesign(input), error => error.status === 400);
});

test('generated CSS scopes every selector to its page and clearing a property restores the default', () => {
  const design = emptyDesign();
  design.pages.student.headings = { color: '#123456', x: 10 };
  design.pages.student.library = { columns: 3, gap: 12 };
  const css = designCSS(design, 'student');
  assert.match(css, /html\[data-ui-page="student"\] \.library-tools h1,html\[data-ui-page="student"\] \.my-heading h1/);
  assert.match(css, /translate:10px 0px!important/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.equal(designCSS(design, 'teacher'), '');
  delete design.pages.student.headings;
  assert.doesNotMatch(designCSS(design, 'student'), /translate|color:/);
  for (const page of Object.values(UI_PAGES)) for (const target of Object.values(page.targets)) {
    assert.ok(target.selector);
    assert.ok(target.properties.every(property => Object.hasOwn(UI_PROPERTIES, property)));
  }
});
