import { stageSource } from './stage-src.js';
// A coil or a varix's spread easing at rest (a Varices slide change) is drawn from one binning made ahead, at rest, of every shape the
// collaterals can take (their coil 0 to COIL_MAX, their fan 0.55 to 1), the frame's points sent up in a few rows, instead of a whole
// binning of every vessel each time a strand spreads into a new cell (10 to 19 in one Varices slide change, motion budget, 3 Nov 2026).
// stage.js envCheck, coilFrame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = stageSource();
const body = (name, end) => st.slice(st.indexOf(`  function ${name}(`), st.indexOf(end, st.indexOf(`  function ${name}(`)));

test('it rides on the morph worker', () => {
  assert.match(st, /const EASE_GPU = MORPH_GPU, COIL_MAX = 5, COLL_REACH = 32;/);
});

test('the envelope goes round the whole box a coil and a fan can be in', () => {
  const at = JSON.parse(st.match(/const ENV_AT = (\[.*\]);/)[1].replace(/COIL_MAX \/ 2/g, '2.5').replace(/COIL_MAX/g, '5'));
  for (const c of [[0, 0.55], [5, 0.55], [5, 1], [0, 1]]) assert.ok(at.some((p) => p[0] === c[0] && p[1] === c[1]), `corner ${c}`);
  assert.match(readFileSync(new URL('../src/ui/varix-look.js', import.meta.url), 'utf8'), /export const varixSpreadK = \(size\) => 0\.55 \+ 0\.45 \* size;/);
  // (The coil's target, stage.js: at most 1.5 + 3.5.)
  assert.match(st, /const w = coiled \? 1\.5 \+ 3\.5 \* sf : 0;/);
});

test('it is made at rest, after a binning at rest, and a frame tries it before the change between the views', () => {
  assert.match(st, /mt\.reach\[(?:live\.)?(?:live\.)?morphTarget\] = new Map\((?:live\.)?(?:live\.)?vBinReach\); morphTrackSoon\(\); envSoon\(\);/);
  const ck = body('envCheck', '\n  }\n');
  assert.ok(ck.includes('if (inMotion() || live.coilEasing) { envSoon(); return; }'));
  assert.ok(st.includes('if (live.morph === live.morphTarget && coilFrame(items)) return true;'));
});

test('a frame draws from it only through the same checks as the change between the views', () => {
  const cf = body('coilFrame', '\n  }\n');
  assert.ok(cf.includes('if (!frameFrom(pc, items, sOfNone, easeMiss)) return false;'));   // (sOfNone: the kept () => -1, no closure per frame)
  const ff = body('frameFrom', '  const veinsRows');
  assert.ok(ff.indexOf("return morphMiss('course')") < ff.indexOf('veins.setMorphFrame(buf)'));
  assert.ok(ff.indexOf("return morphMiss('reach')") < ff.indexOf('veins.setMorphFrame(buf)'));
  assert.ok(ff.indexOf("return morphMiss('joins')") < ff.indexOf('veins.useMorphSet(pc.set)'));
});

test('the moments leave the coils and fans as they were, and the envelope before is let go', () => {
  const ea = body('envItemsAt', '\n  }\n  function envSoon');
  assert.match(ea, /finally \{ for \(const \[g, wg, s0\] of saved\) \{ g\.wig = wg; g\.spr = s0; \} \}/);
  const ck = body('envCheck', '\n  }\n  // ');
  assert.ok(ck.includes('sweepPiece(pc, snaps, more)'));
  assert.ok(ck.includes('old.set.owner.dropMorphSet(old.set)'));
});

test('a coil target is held either side of its threshold', () => {
  assert.match(st, /coiled = g\.wigT > 0 \? sf > 0\.2 : sf > 0\.25;/);
});

test('landed, the figure goes back to a binning of its own once the page is quiet', () => {
  const r = body('easeRest', '\n  }\n');
  assert.ok(r.includes('if (live.coilEasing || inMotion() || live.inUpdate)'));
  assert.ok(r.includes("vBinKey = ''"));
});
