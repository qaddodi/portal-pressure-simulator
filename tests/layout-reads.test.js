import { stageSource } from './stage-src.js';
// Plan "Holding 120 Hz, always", 3.4: the page's geometry is asked of the browser in one place, src/ui/layout-snap.js. A direct layout
// read anywhere else counts against its file's allowance (scripts/layout-read-allowance.json), which may only go down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { directReads, readRatchet, readAllowance, SNAPSHOT_FILE } from '../scripts/off-gpu-scan.mjs';

test('the files moved onto the snapshot stay at zero', () => {
  const allowed = readAllowance();
  for (const f of ['src/ui/presenter.js', 'src/ui/dock.js', 'src/ui/credit.js', 'src/ui/main.js']) assert.equal(allowed[f] || 0, 0, f);
});

test('the counter sees each kind of direct read, and not writes, comments or the snapshot module', () => {
  const root = mkdtempSync(join(tmpdir(), 'reads-'));
  mkdirSync(join(root, 'src/ui'), { recursive: true });
  writeFileSync(join(root, 'src/ui/a.js'), [
    'const r = el.getBoundingClientRect();',
    'const s = getComputedStyle(el), w = window.getComputedStyle(el);',
    'const m = svg?.getScreenCTM?.();',
    'const h = el.offsetHeight + box.clientWidth;',
    'el.scrollTop = 0;   // a write, not a read',
    '// el.getBBox() in a comment',
    'const t = document.elementFromPoint(1, 2);',
  ].join('\n'));
  writeFileSync(join(root, SNAPSHOT_FILE), 'export const readBox = (el) => el.getBoundingClientRect();\n');
  assert.deepEqual(directReads({ root }), { 'src/ui/a.js': 7 });
  assert.deepEqual(readRatchet({ 'src/ui/a.js': 7 }, { 'src/ui/a.js': 5 }).over.length, 1);
  assert.deepEqual(readRatchet({ 'src/ui/a.js': 3 }, { 'src/ui/a.js': 5 }).under.length, 1);
});

test('the snapshot hands the stage its box and matrix without a read, and keeps the stage\'s own', () => {
  const src = stageSource();
  assert.match(src, /provideStage\(\{ box: stageBox, ctm: /);
});
