// Opening the Tests card leaves the camera alone (Mohammad, 17 Nov 2026: "opening the test card should not zoom to fit automatically on mac at
// least", then "even on phone": the figure keeps the same general view and the card lies over it). It reverses the 13 Nov U3 rule for this one card.
// The cause was two things: main.js setPanelTab asked for a refit on every open (which also fitted a view the learner had zoomed), and the framing
// counted the Tests card in the room it frames into, so the card's announced place (pps:occ) and the resize that follows glided the figure to a smaller
// fit by themselves. Fixed at the source: the automatic framing (stage-fit.js fIns) skips #dock; only Fit, pressed on purpose, counts it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => unsnap(readFileSync(join(root, f), 'utf8'));
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

test('opening Tests asks for no refit; only closing it may', () => {
  const main = read('src/ui/main.js');
  const set = between(main, 'function setPanelTab(tab) {', '// ── Floating pieces');
  assert.doesNotMatch(set, /if \(instr \|\| stage\?\.closeView\(\)\) refitStage\(\)/, 'the open used to refit the figure into the room the card leaves');
  assert.doesNotMatch(set, /instr\) refitStage|instr \|\| [^;\n]*refitStage/, 'no refit on the open path');
  assert.match(set, /if \(!instr\) \{ if \(stage\?\.closeView\(\)\) refitStage\(\); else clearTimeout\(refitT\); \}/, 'closing a fitted view still fits it again, and a pending refit is dropped for a view the learner moved');
});

test('the automatic framing skips the Tests card, so no place the card announces moves the view', () => {
  const fit = read('src/ui/stage-fit.js');
  assert.match(fit, /function fIns\(\) \{[\s\S]*?safeInsets\(false, \[dockEl\]\)/, 'the framing reads the cards without #dock');
  assert.match(fit, /dockEl \|\|= document\.getElementById\('dock'\)/);
  // every framing sum (the home fit, the circuit's whole map and close-up, the upright map, the pill's clearance, the slide's centring) uses fIns
  const framing = between(fit, 'function insetVT(v, vbArr) {', 'const circVB');
  assert.match(framing, /const ins = fIns\(\)/, 'insetVT');
  assert.doesNotMatch(framing, /safeInsets\(\)/);
  const rest = between(fit, 'function uprightFit() {', 'function clearPill(');
  assert.match(rest, /uprightFitOf\(fIns\(\)/);
  assert.match(between(fit, 'function clearPill(', 'function centreDrawn('), /fIns\(\)\.t/);
  assert.match(between(fit, 'function centreDrawn(', 'const circWhole'), /const ins = fIns\(\)/);
  const dflt = between(fit, 'function defaultVT(circuit) {', 'const circAt');
  assert.equal((dflt.match(/fIns\(\)/g) || []).length, 2, 'the anatomy fit and the circuit close-up (the upright map goes through circWhole)');
  assert.doesNotMatch(dflt, /safeInsets\(\)/);
});

test('Fit pressed on purpose still frames into the room the card leaves, until the card closes', () => {
  const fit = read('src/ui/stage-fit.js');
  assert.match(fit, /if \(dockCounts\) return safeInsets\(\);/);
  assert.match(between(fit, 'const fit = () => {', 'let refitAsk'), /dockCounts = true;/);
  assert.match(between(fit, 'function closeView() {', 'function holdView('), /dockCounts = false;/);
});

test('what must keep the real cards still does: the catheter room and a vessel reveal (a measurement keeps its tip clear of the Tests card)', () => {
  const fit = read('src/ui/stage-fit.js');
  assert.match(between(fit, 'function reveal(', 'function unreveal'), /const ins = safeInsets\(\);/);
  const cath = read('src/ui/stage-cath.js');
  assert.match(cath, /ins = safeInsets\(\)/);
  assert.match(cath, /cardSpaceRead\(\)/);
});

test('the other right-hand cards are untouched by this change: they still ask for a refit as they open and close', () => {
  const main = read('src/ui/main.js');
  assert.ok((main.match(/refitStage\(\)/g) || []).length >= 5, 'syncPanelToggle (Details), openTreat, closeTreat, openHistory, closeHistory');
});
