// Out of the lobule to a wider view, the camera only zooms out: the lobule's framing is held in the space the leaving slide's cards
// left, so the next slide's cards (which come in before the rise) never send it in and down first (Mohammad, 21 Oct, Ascites 4 to 5
// on a phone). Every deck, every lobule exit (anatomy, circuit, catheter), every device size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const pr = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('the lobule frames itself in the held space while a way out is under way', () => {
  const fr = lz.match(/function freeRect\(\) \{[\s\S]*?\n {2}\}/)?.[0];
  assert.ok(fr, 'freeRect');
  assert.match(fr, /if \(heldFree && heldFree\.W === geo\.W && heldFree\.H === geo\.H\) return heldFree\.f;/, 'held for this stage size');
  // Every framing (fit, clamp, refit, a station, the zoom buttons) reads freeRect; the live space only through it and the hold.
  assert.equal((lz.match(/(?<!function )liveFree\(\)/g) || []).length, 2, 'liveFree is read only by freeRect and holdFrame');
  assert.match(lz, /function fitV\(\) \{[\s\S]*?const f = freeRect\(\)/, 'the fit reads the held space');
  const hold = lz.match(/holdFrame\(on\) \{[\s\S]*?\n {4}\},/)?.[0];
  assert.ok(hold, 'holdFrame');
  assert.match(hold, /if \(on\) \{ if \(geo && !heldFree && fade > 0\) heldFree = \{ W: geo\.W, H: geo\.H, f: liveFree\(\) \}; return; \}/, 'taken once, as the way out begins, never retaken from the new cards');
  assert.match(hold, /heldFree = null;\n\s+if \(geo && fade > 0\) refit\(\);/, 'called off with the lobule up: it glides to the space now');
  assert.match(lz, /if \(fade === 0 && was > 0\) \{ aimed = null; camHeld = false; heldFree = null;/, 'given back once the lobule has gone');
  assert.match(st, /lobuleHold: \(on\) => lz\?\.holdFrame\(on\),/);
});

test('the presenter holds it before the new cards change the space, on every way out, and lets go on a lobule slide', () => {
  const run = pr.match(/async function transitionRun\(to\) \{[\s\S]*?\n {2}\}\n/)?.[0];
  assert.ok(run, 'transitionRun');
  const holdAt = run.indexOf('stage.lobuleHold?.(true)'), outAt = run.indexOf('wordsOut(s)'), inAt = run.indexOf('wordsIn(s, said');
  assert.ok(holdAt > 0 && holdAt < outAt && outAt < inAt, 'held while the leaving slide\'s cards still set the space');
  // (The same slides that leave the lobule further down: a catheter slide, or any framing that is not the lobule's.)
  assert.match(run, /if \(\(!s\.visual && s\.cath\) \|\| \(cam && !LOBULE_CAM\.test\(cam\)\)\) stage\.lobuleHold\?\.\(true\);/);
  const toA = pr.match(/async function toAnatomy\(next\) \{[\s\S]*?\n {2}\}/)[0];
  assert.ok(toA.indexOf('stage.lobuleHold?.(true)') > 0 && toA.indexOf('stage.lobuleHold?.(true)') < toA.indexOf("stage.lobuleFocus('fit'"), 'every way out (a deck closing, a catheter) holds before the zoom back to the fit');
  const cam = pr.match(/async function camera\(cam, s, cut\) \{[\s\S]*?\n {2}\}/)[0];
  const lob = cam.slice(cam.indexOf('if (LOBULE_CAM.test(cam)) {'));
  assert.ok(lob.indexOf('stage.lobuleHold?.(false)') > 0 && lob.indexOf('stage.lobuleHold?.(false)') < lob.indexOf('stage.lobuleFocus(part'), 'back to a lobule slide: it follows that slide\'s cards again');
  assert.match(pr, /app\.style\.removeProperty\(k\);\n\s+stage\.lobuleHold\?\.\(false\);/, 'and when the presentation ends');
});

test('held, the way out never zooms in: the fit only changes when the space does', () => {
  // The lobule's fit (fitV) as a function of the free space: a smaller space below (the next slide's shorter words on a phone) gives
  // a larger, lower framing. Held, the space is the leaving slide's, so the framing before the rise is the one already on screen.
  const fit = (f, box) => { const k = Math.min((f.r - f.l) / (box[2] - box[0]), (f.b - f.t) / (box[3] - box[1])); return { k, y: (f.t + f.b) / 2 - k * (box[1] + box[3]) / 2 }; };
  const box = [-105, -102, 105, 102], leaving = { l: 12, r: 378, t: 300, b: 520 }, next = { l: 12, r: 378, t: 300, b: 640 };
  const live = fit(next, box), held = fit(leaving, box), now = fit(leaving, box);
  assert.ok(live.k > now.k && live.y > now.y, 'followed, the new cards would send it in and down');
  assert.deepEqual(held, now, 'held, it stays put until the rise zooms out');
});
