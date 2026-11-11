import { stageSource } from './stage-src.js';
// Organ names stay off the vessels, and an upright tablet's colour key stands level with the nav pill (iPad portrait, 1 Nov 2026:
// the review found STOMACH under the splenic vein and the K of KIDNEY on the colon's vein on Ascites 5, and the "Flow volume" key
// 5 px from the teaching card's edge, 8 px below the pill, on Varices 4).
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGANS, ORGAN_LABELS } from '../src/ui/anatomy.js';
import { pathCmds, flattenCmds } from '../src/ui/shape-gl.js';
import { nameSpots, NAME_ORGAN, NAME_BREAK, NEAR, APART, MOST } from '../src/ui/organ-names.js';

const stage = stageSource();
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// (The outline read on its own, finer than the module's, with the even-odd rule: a ring's hole is outside.)
const rings = (id) => {
  const o = ORGANS.find((q) => q.id === id);
  return flattenCmds(pathCmds(o.ring || o.d), 0.25).map((p) => Array.from({ length: p.pts.length / 2 }, (_, i) => [p.pts[2 * i], p.pts[2 * i + 1]]));
};
const inside = (R, x, y) => R.reduce((n, P) => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return n + (c ? 1 : 0);
}, 0) % 2 === 1;
const away = (R, x, y) => {
  let d = Infinity;
  for (const P of R) for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t));
  }
  return d;
};

test('every organ name has other spots in its own organ, nearest its anchor first, none repeating another', () => {
  assert.deepEqual(ORGAN_LABELS.map((q) => q[0]).sort(), Object.keys(NAME_ORGAN).sort(), 'every caption names an organ outline');
  for (const [name, ax, ay] of ORGAN_LABELS) {
    const spots = nameSpots(name);
    assert.ok(spots.length >= 8 && spots.length <= MOST, `${name}: ${spots.length} spots`);
    let last = 0;
    spots.forEach(([x, y], i) => {
      const d = Math.hypot(x - ax, y - ay);
      assert.ok(d > 0 && d >= last - 1e-9, `${name}: spot ${i} is farther than the one after it`);
      last = d;
      for (const [u, v] of spots.slice(0, i)) assert.ok(Math.hypot(u - x, v - y) >= APART - 1e-9, `${name}: two spots ${APART} units apart at most`);
    });
    assert.equal(nameSpots(name), spots, `${name}: worked out once`);
  }
  assert.deepEqual(nameSpots('Nothing'), []);
});

test('a name anchored inside its organ stays inside it; one beside its organ stays within NEAR units of it', () => {
  for (const [name, ax, ay] of ORGAN_LABELS) {
    const R = rings(NAME_ORGAN[name]), own = inside(R, ax, ay);
    for (const [x, y] of nameSpots(name)) {
      if (own) assert.ok(inside(R, x, y) || away(R, x, y) < 1.5, `${name} (${x}, ${y}) is out of its organ`);
      else assert.ok(inside(R, x, y) || away(R, x, y) <= NEAR + 1.5, `${name} (${x}, ${y}) is ${away(R, x, y).toFixed(1)} from its organ`);
    }
  }
});

test('the label solver tries the anchor first, then those spots, then the anchor over any vessel', () => {
  assert.match(stage, /import \{ NAME_BREAK, OFF_NEAR, nameSpots, onOtherOrgan \} from '\.\/organ-names\.js';/);
  // (Every one of them off the shown leaders too, unled: phone-label-room.test.js; and each tried first off the other organs, offOrgans.)
  assert.match(stage, /const spot = \{ gap: 0, leader: false, clear: true, unled: true \}, off = \{ \.\.\.spot, offOrgans: txt \};\s*const at = nameSpots\(txt\)\.map\(\(\[sx, sy\]\) => \{ const \[bx, by\] = worldToLocal\(sx, sy\); return \[bx - ax, by - ay, Math\.hypot\(sx - x, sy - y\) <= OFF_NEAR\]; \}\);\s*placeMulti\(it, \['C'\], \[off, \.\.\.at\.filter\(\(a\) => a\[2\]\)\.map\(\(a\) => \(\{ \.\.\.off, at: a \}\)\), spot, \.\.\.at\.map\(\(a\) => \(\{ \.\.\.spot, at: a \}\)\), \{ gap: 0, leader: false, unled: true \}\]\);/);
  assert.doesNotMatch(stage, /it\.h = (?:live\.)?LINE_H\(it\.lines\[0\]\);\s*place\(it, \['C'\], 0, false\);/, 'no organ name is placed by the old single pass');
});

// The rule bodies of the upright tablet's key (the pill is 29 px up there, inside the card).
// (Every rule that starts a line with exactly this selector, the one that sets `bottom` first.)
const body = (sel) => {
  const out = [];
  for (let at = css.indexOf(`\n${sel} {`); at >= 0; at = css.indexOf(`\n${sel} {`, at + 1)) out.push(css.slice(at, css.indexOf('}', at)));
  assert.ok(out.length, `${sel} has a rule`);
  return out.find((b) => /(?<![-\w])bottom:/.test(b)) || out[0];
};

test('an upright tablet\'s key stands level with its nav pill, and rises with it above the pill', () => {
  const pill = body('.pz.stack.tab .pz-bar').match(/bottom: calc\((\d+)px \+ var\(--pz-sb\)\)/);
  assert.ok(pill, 'the pill\'s bottom');
  assert.match(body('.pz.stack.tab:not(.fk-up) .pz-fk'), new RegExp(`bottom: calc\\(${pill[1]}px \\+ var\\(--pz-sb\\)\\);`), 'beside the pill: level with it');
  // (On its own row: the pill's 38 px and 6 px of air above its bottom, as the phone's 65 px is 21 + 38 + 6.)
  assert.match(body('.pz.stack.tab.fk-up .pz-fk'), new RegExp(`bottom: calc\\(${+pill[1] + 38 + 6}px \\+ var\\(--pz-sb\\)\\);`), 'on its own row: clear of the pill');
  assert.match(body('.pz.stack:not(.fk-up) .pz-fk'), /bottom: calc\(21px \+ var\(--pz-sb\)\); min-height: 38px;/, 'the phone\'s key is as it was');
});

test('RIGHT ATRIUM can stand clear of the IVC that runs up the heart\'s left side', () => {
  // The name's own outline (heart-ra) is the small chamber on the heart's right border, 46 units wide: every spot it offered lay left, on the
  // cava (Mac, decompensated cirrhosis, 1 Nov). The caption names the atrium drawn as the heart's body, so spots reach the heart's right of the cava.
  assert.equal(NAME_ORGAN['Right atrium'], 'heart');
  const spots = nameSpots('Right atrium');
  assert.ok(spots.filter(([x]) => x >= 700).length >= 3, 'spots right of the cava (world x 655, its caption 95 units wide)');
  const R = rings('heart');
  for (const [x, y] of spots) assert.ok(inside(R, x, y), `(${x}, ${y}) is inside the heart`);
});

test('RIGHT ATRIUM stands on two lines, one word each, the other captions on one', () => {
  assert.deepEqual([...NAME_BREAK], ['Right atrium']);
  assert.match(stage, /lines: up\.split\(NAME_BREAK\.has\(txt\) \? ' ' : '\\u0000'\)\.map\(\(t\) => \[\{ t, size: 9\.5, weight: 600, cls: 'lb-organ', track: 0\.06 \}\]\)/);
  assert.match(stage, /it\.w = Math\.max\(\.\.\.it\.lines\.map\(lineW\)\); it\.h = it\.lines\.reduce\(\(a, l\) => a \+ LINE_H\(l\), 0\);\s*(?:\/\/.*\n\s*)*const spot/);
});
