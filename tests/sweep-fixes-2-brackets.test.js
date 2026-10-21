// The sweep's bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder's phone strip: a raised label's leaders broke
// round it, and its HVPG row kept clear of the hatching. Both slides now show the Gut to heart chart (21 Oct, one chart everywhere),
// whose brackets carry the same guarantees: the bracket's bar breaks round its own label, and every bracket and the healthy line's
// name keep clear of the red blocks (Mohammad, 21 Oct: "can we add that red block thing that showed where the resistance is?").
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WHERE } from '../src/ui/decks/where.js';
import { runSteps, deckStates } from './deck-states.js';
import { profileOf, blocksOf, blockBox, profileGeo, axisTop, BLOCK_FALL, STATIONS } from '../src/ui/tool-profile.js';

const prof = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const lob = readFileSync(new URL('../src/ui/decks/lobule.js', import.meta.url), 'utf8');
const rec = readFileSync(new URL('../src/ui/decks/recompensation.js', import.meta.url), 'utf8');

test('Lobule 8 and Recompensation 5 show the Gut to heart chart', () => {
  assert.match(lob, /id: 'wedge'[^\n]*tool: \{ kind: 'profile' \}/);
  assert.match(rec, /id: 'carv'[^\n]*tool: \{ kind: 'profile' \}/);
});

test('a bracket\'s bar breaks round its own label, never running through "HVPG"', () => {
  assert.match(prof, /const gap = stack \? bracketLabel\(x0, x1, Infinity, \[tw\(name, 600\), tw\(val, 700\)\]\)\.gap : oneLineGap\(x0, x1, z \* tw\(`\$\{name\} \$\{val\}`, 700\)\);/);
  assert.match(prof, /const bar = gap\[1\] - gap\[0\] >= x1 - x0 - 0\.5 \? '' : `M\$\{x0\} \$\{yy\}H\$\{gap\[0\]\}M\$\{gap\[1\]\} \$\{yy\}H\$\{x1\}`;/);
});

test('the red block marks each fall over 4 mmHg from the portal vein on, or the heart; a healthy chart shows none', async () => {
  assert.equal(BLOCK_FALL, 4);
  const pv = STATIONS.indexOf('CONF'), n = STATIONS.length - 1;
  const six = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => WHERE.slides.find((s) => s.id === id)).filter(Boolean);
  assert.equal(six.length, 6);
  const [h0] = await runSteps([{ preset: 'healthy' }]), states = await deckStates(WHERE);
  const fps = [h0, ...six.map((s) => states[WHERE.slides.indexOf(s)])];
  const hl = profileOf(fps[0]);
  assert.deepEqual(blocksOf(hl, hl), [], 'healthy: no block');
  six.forEach((s, j) => {
    const p = profileOf(fps[j + 1]), b = blocksOf(p, hl);
    assert.ok(b.length >= 1, `${s.id} (${p.v.map(Math.round)}) shows where its resistance is`);
    for (const i of b) {
      if (i === n) { assert.ok(p.v[n] - hl.v[n] > 4 && !p.v.slice(pv, n).some((v, k) => v - p.v[pv + k + 1] > 4), `${s.id}: the heart, only where no stretch falls`); continue; }
      assert.ok(i >= pv && p.v[i] - p.v[i + 1] > 4, `${s.id}: stretch ${i} falls ${p.v[i] - p.v[i + 1]}`);
    }
  });
  // (The gut's own stretch is never a block, whatever it falls.)
  const v = hl.v.slice(); v[0] = v[1] + 10;
  assert.ok(!blocksOf({ ...hl, v }, hl).includes(0));
});

test('a block stands between the two readings, clear of both, over the fall itself', () => {
  const tw = (t) => t.length * 7, p = { v: [23, 20, 8, 7, 6, 5, 5, 4], hvpg: 2, ppg: 15 }, top = axisTop(p), G = profileGeo(400, 260, 12, tw, true);
  const [x0, x1, y0, y1] = blockBox(G, tw, { ...p, top }, 1);
  assert.ok(x0 >= G.x(1) + 7 + 4 && x1 <= G.x(2) - 3.5 - 4, 'clear of both readings by NUM_PAD and more');
  const yg = (v) => G.Z - (G.Z - G.T) * v / top;
  assert.ok(Math.abs(y0 - (yg(20) - 0.36 * 12)) < 0.01 && Math.abs(y1 - (yg(8) + 0.36 * 12)) < 0.01);
});

test('every bracket and the healthy line\'s name keep clear of the blocks; a block eases in and out, hatched as the old ladder\'s', () => {
  assert.equal((prof.match(/for \(const i of blocksOf\(goal, hl\)\) place\.take\(blockBox\(G, tw, goal, i\)\);/g) || []).length, 2);
  assert.match(prof, /if \(!b \|\| b\.a !== a\) blk\.set\(i, \{ a, from: reduceMQ\.matches \? a : b \? blkOp\(b, t\) : 0, t0: t \}\);/);
  assert.match(prof, /\|\| \[\.\.\.blk\.values\(\)\]\.some\(\(b\) => t - b\.t0 < FADE_MS\);/);
  assert.match(prof, /sv\('rect', \{ class: 'pz-hb', width: s, height: s \}\), sv\('rect', \{ class: 'pz-hs', width: s \/ 2, height: s \}\)/);
  assert.match(css, /\.ppf-blk \{ stroke: var\(--danger\); stroke-width: 1\.2; stroke-opacity: \.7; \}/);
  assert.match(css, /\.pz-hs \{ fill: var\(--danger\); fill-opacity: \.55; \}/);
});
