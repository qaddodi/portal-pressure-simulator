import { stageSource } from './stage-src.js';
// A label's colour is restyled on the text it already has; only a change of structure (its runs' sizes, weights, gaps, the
// box) builds it again (stage.js renderBlock). A run's colour comes from its fill or its class (a change badge's ▲ "up" or
// ▼ "down"), so neither may be in the label's structure signature, and both are set on the same tspan in the update loop.
// And a vessel's width change redraws only that vessel's cells: its radii go to the GPU row by row (veins.setRadii) and
// the row joins veinsRows, which drawVeins hands to veins.drawRows rather than drawing the whole layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const block = stage.slice(stage.indexOf('  function renderBlock(it) {'), stage.indexOf('  const rectOf = (it) =>'));

test('a label\'s structure signature leaves out its runs\' text, fill and class', () => {
  // (The signature is blockSig since f9518d63, shared by renderBlock and the between-frames builder.)
  const m = stage.match(/const blockSig = \(it\) => JSON\.stringify\(\[it\.lines\.map\(\(line\) => line\.map\(\(\{([^}]*)\}\) => style\)\)/);
  assert.ok(m, 'blockSig builds the signature from each run\'s style alone');
  assert.match(block, /sig = blockSig\(it\)/, 'renderBlock compares against blockSig');
  const left = m[1].split(',').map((x) => x.trim());
  for (const k of ['t', 'fill', 'cls', '...style']) assert.ok(left.includes(k), `the signature keeps "${k}" out of the style`);
});

test('a run\'s class and fill are set on its existing tspan', () => {
  const loop = block.slice(block.indexOf('const sp = b.spans[i++];'));
  assert.match(loop, /if \(sp\.getAttribute\('class'\) !== \(r\.cls \|\| ''\)\) \{ sp\.setAttribute\('class', r\.cls \|\| ''\); ch = true; \}/);
  assert.match(loop, /late\('fill', sp, sp\._fill\)/);   // (written between frames: lateRun)
  assert.match(stage, /op === 'fill'\) \{ a\.style\.fill = b;/);
});

test('a vessel\'s width change redraws its own cells only', () => {
  assert.match(stage, /(?:live\.)?veins\.setRadii\(it\.row, R, alongOf\(it\)\); (?:live\.)?veinsRows\.add\(it\.row\);/);
  assert.match(stage, /if \((?:live\.)?(?:live\.)?veins\.drawRows\(T, (?:live\.)?(?:live\.)?vLook, (?:live\.)?(?:live\.)?bloodLook\(\), pending, fullComposite\)\) \{ rowsShown\(\); return true; \}/);
});
