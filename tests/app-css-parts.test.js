// The app's stylesheet is styles/app-NN-*.css (scripts/app-css.mjs): index.html links every part in order, and each part is cut between rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCssFiles } from '../scripts/app-css.mjs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');

test('index.html links every app stylesheet part, once, in name order, between icons.css and path.css', () => {
  const links = [...read('index.html').matchAll(/<link rel="stylesheet" href="(styles\/[^"]+)"/g)].map((m) => m[1]);
  const at = links.indexOf('styles/icons.css');
  assert.deepEqual(links.slice(at + 1, at + 1 + appCssFiles().length), appCssFiles());
  assert.equal(links[at + 1 + appCssFiles().length], 'styles/path.css');
});

test('the parts are numbered without a gap and each ends outside any rule or comment', () => {
  const files = appCssFiles();
  assert.ok(files.length >= 2);
  files.forEach((f, i) => assert.ok(f.startsWith(`styles/app-${String(i + 1).padStart(2, '0')}-`), `${f} is part ${i + 1}`));
  for (const f of files) {
    const t = read(f);
    let depth = 0, i = 0;
    while (i < t.length) {
      if (t[i] === '/' && t[i + 1] === '*') { const e = t.indexOf('*/', i + 2); assert.ok(e > 0, `${f}: a comment is left open`); i = e + 2; continue; }
      if (t[i] === '"' || t[i] === "'") { const q = t[i]; i++; while (i < t.length && t[i] !== q) i += t[i] === '\\' ? 2 : 1; i++; continue; }
      if (t[i] === '{') depth++; else if (t[i] === '}') depth--;
      assert.ok(depth >= 0, `${f}: a closing brace has no rule to close`);
      i++;
    }
    assert.equal(depth, 0, `${f} ends inside a rule: a part is cut between rules, so each loads whole`);
  }
});
