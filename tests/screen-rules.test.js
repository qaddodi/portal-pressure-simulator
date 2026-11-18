// The self-check rules over the figure, label and camera parts (src/ui/selfcheck/rules-*.js). Each rule has a case that must fire, naming the rule, what,
// where, why and the owner file, and a case that must not (a false alarm wastes as much agent time as no rule: screen-report-recs.md section 5).
import './screen-dom.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, runRules } from '../src/ui/selfcheck/rules.js';
import '../src/ui/selfcheck/plugins.js';
import { LABEL_DIM, readLabels } from '../src/ui/screen/read-labels.js';
import { readCamera } from '../src/ui/screen/read-camera.js';
import { readFigure } from '../src/ui/screen/read-figure.js';
import { pressureColor } from '../src/ui/colormap.js';
import { qP } from '../src/ui/colour-bin.js';
import { planSlide } from '../src/ui/slide-cam.js';

const SETTLED = { riding: false, job: false, laid: true, stale: false };
const lab = (key, box, o = {}) => ({ key, text: o.text ?? key, box, ax: o.ax ?? box[0], ay: o.ay ?? box[1], leader: !!o.leader, onVessel: !!o.onVessel, hide: false });
const labels = (laid, o = {}) => readLabels({ stage: { w: 400, h: 300 }, laid, carry: SETTLED, cards: {}, ...o });
// (run(part): every rule of this file's families over a report holding just that part; ids(): the rules that fired)
const KEY = { label: 'labels', camera: 'camera', figure: 'figure' };
const run = (family, part) => runRules({ [KEY[family]]: part }, { only: RULES.filter((r) => r.id.startsWith(`${family}-`)).map((r) => r.id) });
const ids = (fs) => fs.map((f) => f.rule);

const MINE = ['label-', 'camera-', 'figure-'];
test('every rule of the three families is registered with an owner file and a why, and each finding carries them', () => {
  const mine = RULES.filter((r) => MINE.some((p) => r.id.startsWith(p)));
  assert.ok(mine.length >= 16, `rules registered: ${mine.map((r) => r.id)}`);
  for (const r of mine) { assert.match(r.owner, /^(src|styles)\//, r.id); assert.ok(r.why.length > 20, r.id); assert.equal(r.kind, 'state', r.id); }
  const f = run('label', labels([lab('n:RHV', [380, 10, 440, 26], { text: 'RHV' })]));
  assert.deepEqual(Object.keys(f[0]).sort(), ['owner', 'rule', 'what', 'where', 'why']);
  assert.match(f[0].owner, /stage-label-solve/); assert.match(f[0].why, /whole on the stage/);
});

test('a part that is missing makes no finding (a report with no figure, or one read on a stage with no labels)', () => {
  assert.deepEqual(runRules({}, { only: RULES.filter((r) => MINE.some((p) => r.id.startsWith(p))).map((r) => r.id) }), []);
  assert.deepEqual(run('label', labels([])), []);
  assert.deepEqual(run('figure', fig([])), []);
});

test('label-under-card: fires on a label under a card, names the card and share; quiet clear of it, hidden, or while the labels move', () => {
  const card = { '.pz-data': [100, 0, 400, 300] };
  const f = run('label', labels([lab('n:SV', [90, 50, 190, 66], { text: 'Splenic vein' })], { cards: card }));
  assert.deepEqual(ids(f), ['label-under-card']);
  assert.match(f[0].what, /Splenic vein/); assert.match(f[0].where, /90% of it under the data card/); assert.equal(f[0].owner, 'src/ui/stage-label-solve.js');
  assert.deepEqual(run('label', labels([lab('a', [10, 50, 90, 66])], { cards: card })), []);
  assert.deepEqual(run('label', labels([lab('a', [90, 50, 190, 66])], { cards: card, carry: { ...SETTLED, riding: true } })), [], 'a label riding the camera is on its way');
  const hidden = labels([{ ...lab('a', [90, 50, 190, 66]), hide: true }], { cards: card });
  assert.deepEqual(run('label', hidden), []);
});

test('label-off-screen: fires past the stage\'s edge; quiet inside it, and for a hair past (1 px)', () => {
  const f = run('label', labels([lab('n:RHV', [380, 10, 440, 26], { text: 'RHV' })]));
  assert.deepEqual(ids(f), ['label-off-screen']); assert.match(f[0].where, /40 px past the stage's edge \(400×300\)/);
  assert.deepEqual(run('label', labels([lab('a', [340, 10, 400.5, 26])])), []);
  assert.deepEqual(run('label', labels([lab('a', [100, 10, 160, 26])])), []);
});

test('label-overlap: fires for two labels over each other (once, not twice); quiet for neighbours and when one is hidden', () => {
  const f = run('label', labels([lab('a', [10, 10, 80, 26]), lab('b', [60, 14, 130, 30])]));
  assert.deepEqual(ids(f), ['label-overlap']); assert.equal(f[0].sev, 'warn');
  assert.deepEqual(run('label', labels([lab('a', [10, 10, 80, 26]), lab('b', [80, 10, 150, 26])])), [], 'touching is not overlapping');
  assert.deepEqual(run('label', labels([lab('a', [10, 10, 80, 26]), { ...lab('b', [60, 14, 130, 30]), hide: true }])), []);
});

test('label-dim-alpha: fires on a label stuck part way, or dimmed to the wrong alpha; quiet at 100%, at 65% and while a fade runs', () => {
  const one = (a, cls) => labels([lab('a', [10, 10, 80, 26])], { drawn: [{ key: 'a', a, x: 10, y: 10, w: 70, h: 16 }], classes: cls ? { a: cls } : {} });
  const stuck = run('label', one(0.5));
  assert.deepEqual(ids(stuck), ['label-dim-alpha']); assert.match(stuck[0].where, /stuck at 50%/);
  const wrong = run('label', one(1, ['unlit']));   // stepped back by a slide, but drawn at full strength
  assert.deepEqual(ids(wrong), ['label-dim-alpha']); assert.match(wrong[0].where, /stepped back by a slide but drawn at 100%, not 65%/);
  const odd = run('label', one(0.65));   // at the dim alpha with no slide or explainer dimming it
  assert.deepEqual(ids(odd), ['label-dim-alpha']); assert.match(odd[0].where, /though no slide or explainer dimmed it/);
  assert.deepEqual(run('label', one(0.65, ['unlit'])), []);
  assert.deepEqual(run('label', one(1)), []);
  assert.deepEqual(run('label', labels([lab('a', [10, 10, 80, 26])], { drawn: [{ key: 'a', a: 0.5, x: 10, y: 10, w: 70, h: 16 }], carry: { ...SETTLED, riding: true } })), [], 'a fade in a moving scene is not stuck');
  assert.equal(LABEL_DIM, 0.65);
});

test('label-detached: fires for a label far from its point with no leader; quiet with a leader, on its vessel, or near', () => {
  const far = run('label', labels([lab('a', [200, 100, 260, 116], { ax: 20, ay: 20 })]));
  assert.deepEqual(ids(far), ['label-detached']);
  assert.deepEqual(run('label', labels([lab('a', [200, 100, 260, 116], { ax: 20, ay: 20, leader: true })])), []);
  assert.deepEqual(run('label', labels([lab('a', [200, 100, 260, 116], { ax: 20, ay: 20, onVessel: true })])), []);
  assert.deepEqual(run('label', labels([lab('a', [200, 100, 260, 116], { ax: 205, ay: 108 })])), []);
});

test('label-clipped-by-canvas: fires on a picture past its canvas; quiet otherwise', () => {
  const f = run('label', labels([lab('a', [10, 10, 80, 26])], { drawn: [{ key: 'a', a: 1, x: 10, y: 10, w: 70, h: 16, clipped: true }] }));
  assert.deepEqual(ids(f), ['label-clipped-by-canvas']);
  assert.deepEqual(run('label', labels([lab('a', [10, 10, 80, 26])], { drawn: [{ key: 'a', a: 1, x: 10, y: 10, w: 70, h: 16 }] })), []);
});

// ── camera ──
function trace(o = {}) {
  const from = { k: 1, x: 0, y: 0 }, to = o.to || { k: 2.5, x: -300, y: -120 }, vb = { w: 1000, h: 700, cx: 500, cy: 350 }, plan = planSlide(from, to, vb.w), frames = [], out = { k: 0, x: 0, y: 0 };
  for (let t = 0; t <= plan.ms + 16; t += 16) { const u = Math.min(1, t / plan.ms); plan.at(u * u * u * (u * (6 * u - 15) + 10), out); frames.push([t, o.turn && t === 320 ? out.k * 0.7 : out.k, out.x, out.y]); }
  frames[frames.length - 1] = [frames.at(-1)[0], plan.to.k, plan.to.x, plan.to.y];
  return { plan, frames, held: [], blocked: o.blocked || [], t0: o.t0 ?? 1000, press: o.press ?? 990, end: 'landed', vb, after: o.after || null };
}
const cam = (traces, moves = []) => readCamera({ view: 'anatomy', state: null, vb: traces[0]?.vb, traces, moves, moving: {} });

test('camera-move-judged: fires with the judge\'s words for a move that turns back or has a second move after it; quiet for a good move', () => {
  assert.deepEqual(run('camera', cam([trace()])), []);
  const turned = run('camera', cam([trace({ turn: true })]));
  assert.ok(turned.some((f) => f.rule === 'camera-path'), JSON.stringify(turned));
  assert.match(turned.find((f) => f.rule === 'camera-path').where, /zoom turns back/); assert.equal(turned[0].owner, 'src/ui/slide-cam.js');
  const after = run('camera', cam([trace({ after: 'refit' })]));
  assert.deepEqual(ids(after), ['camera-second-move']); assert.match(after[0].where, /second move after the landing \(refit\)/);
});

test('camera-refused-write and camera-two-moves-one-press', () => {
  const f = run('camera', cam([trace({ blocked: [{ t: 5, who: 'stage-zoom.js:88' }] })]));
  assert.deepEqual(ids(f), ['camera-refused-write']); assert.match(f[0].where, /stage-zoom\.js:88/);
  const two = run('camera', cam([trace({ press: 500, t0: 510 }), trace({ press: 500, t0: 1900 })]));
  assert.ok(ids(two).includes('camera-two-moves-one-press'));
  assert.deepEqual(run('camera', cam([trace({ press: 500, t0: 510 }), trace({ press: 3000, t0: 3010 })])), []);
});

test('camera-stop-between: fires for glide, a short wait, glide; quiet for an overlap, a long wait, or tiny moves', () => {
  const g = (at, ms, zoom = 1, slide = true) => ({ t: at, ms, kind: 'glide', zoom, pan: 5, slide });
  const mv = (...m) => cam([], m);
  assert.deepEqual(ids(run('camera', mv(g(1000, 900), g(2000, 900)))), ['camera-stop-between']);
  assert.deepEqual(run('camera', mv(g(1000, 900), g(1500, 900))), [], 'a move that begins before the last ends takes over (things at once)');
  assert.deepEqual(run('camera', mv(g(1000, 900), g(5000, 900))), [], 'a long wait is a new ask');
  assert.deepEqual(run('camera', mv(g(1000, 900, 0.01), g(2000, 900, 0.01))), [], 'a refit nudge is not a zoom');
  assert.deepEqual(run('camera', mv({ ...g(1000, 900), kind: 'dive' }, g(2000, 900))), [], 'a dive is the lobule\'s own move');
});

// ── figure ──
const row = (id, o = {}) => ({ id, kind: 'vein', art: false, from: 'PV', to: 'SPL', w: 6, opa: 1, p: [10, 10], ...o, col: o.col === undefined ? [pressureColor(qP(10)), pressureColor(qP(10))] : o.col });
const fig = (rows, lens = 'pressure') => readFigure({ lens, morph: 0, view: 'anatomy', rows });

test('figure-colour-stale: fires when a vessel\'s colour is far from its pressure\'s; quiet within the hold, in other lenses', () => {
  const f = run('figure', fig([row('PV_L', { col: [pressureColor(25), pressureColor(25)] })]));
  assert.deepEqual(ids(f), ['figure-colour-stale']); assert.match(f[0].where, /ends read 10 and 10 mmHg/); assert.equal(f[0].owner, 'src/ui/stage-tubes.js');
  assert.deepEqual(run('figure', fig([row('PV_L'), row('PV_R', { col: [pressureColor(10.5), pressureColor(9.5)] })])), []);
  assert.deepEqual(run('figure', fig([row('PV_L', { col: ['rgb(1,2,3)', 'rgb(1,2,3)'] })], 'flow')), []);
});

test('figure-vessel-no-colour, figure-vessel-width, figure-pressure-missing: fire on the fault, quiet for an artery, a ghost, a hidden one', () => {
  assert.deepEqual(ids(run('figure', fig([row('A', { col: null })]))), ['figure-vessel-no-colour']);
  assert.deepEqual(run('figure', fig([row('A', { col: null, art: true }), row('B', { col: null, ghost: true }), row('C', { col: null, opa: 0 })])), []);
  assert.deepEqual(ids(run('figure', fig([row('A', { w: 0 })]))), ['figure-vessel-width']);
  assert.deepEqual(ids(run('figure', fig([row('A', { w: NaN })]))), ['figure-vessel-width']);
  assert.deepEqual(run('figure', fig([row('A', { w: 0, opa: 0 })])), []);
  assert.deepEqual(ids(run('figure', fig([row('A', { p: null })]))), ['figure-pressure-missing']);
  assert.deepEqual(run('figure', fig([row('A', { p: null })], 'flow')), []);
});
