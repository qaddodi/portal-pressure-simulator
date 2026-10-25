// The fluid balance's day strip (tool { kind: 'fluid', window: true }, tool-fluid.js; Mohammad's pick "One strip", 21 Oct 2026):
// per-day numbers whose printed sums are exact, the strip's parts on one scale (never overlapping, never past the track, a mark
// for any part with anything in it, no step as a value eases), the forces strip, the words, and the Testing deck's four fluid
// slides opting in.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fluidDay, stripWords, stripParts, tugParts, STRIP_GAP, STRIP_MARK } from '../src/ui/tool-fluid.js';

const perMin = (d) => ({ hep: d.liver / 1440, spl: d.gut / 1440, cap: d.limit / 1440, back: d.back / 1440 });
const STATES = {
  healthy: { liver: 790, gut: 0, limit: 3600, back: 0 },
  schisto: { liver: 2090, gut: 1500, limit: 3600, back: 0 },
  day60: { liver: 2330, gut: 3030, limit: 4340, back: 860 },
  diuretics: { liver: 2330, gut: 3030, limit: 4340, back: 2160 },
};

test('per day, every printed sum is exact', () => {
  const d = fluidDay(perMin(STATES.day60));
  assert.deepEqual(d, { liver: 2330, gut: 3030, made: 5360, limit: 4340, carried: 4340, over: 1020, back: 860, net: 160, room: -1020 });
  assert.equal(fluidDay(perMin(STATES.diuretics)).net, -1140);
  assert.equal(fluidDay(perMin(STATES.healthy)).room, 2810);
  assert.equal(fluidDay(perMin(STATES.schisto)).room, 10);
  // (any model values: rounded parts, sums taken from the parts)
  for (let i = 0; i < 500; i++) {
    const f = { hep: Math.random() * 3, spl: Math.random() * 3, cap: 1 + Math.random() * 3, back: Math.random() * 2 };
    const x = fluidDay(f);
    for (const k of ['liver', 'gut', 'limit', 'back']) assert.equal(x[k] % 10, 0, `${k} rounded to 10 mL`);
    assert.equal(x.made, x.liver + x.gut);
    assert.equal(x.carried + x.over, x.made);
    assert.equal(x.net, x.over - x.back);
    assert.ok(x.over === 0 || x.carried === x.limit, 'overflow only once the lymphatics are full');
  }
});

const dayOf = (st) => { const d = fluidDay(perMin(st)); return { carried: d.carried, over: d.over, back: d.back, room: Math.max(0, d.room) }; };
const W = 300, ORDER = ['car', 'blue', 'shrink', 'build', 'room'];

test('the strip\'s words name the room left or that the lymphatics are full', () => {
  const w = (st) => stripWords(fluidDay(perMin(st)));
  assert.deepEqual(w(STATES.healthy), { carried: ['Carried 790', 'Carried 790'], spare: '2,810 to spare', day: 'no ascites', net: 'Builds' });
  assert.equal(w(STATES.schisto).spare, '10 to spare');
  assert.deepEqual(w(STATES.day60).carried, ['Carried 4,340 · full', 'Carried 4,340']);
  assert.equal(w(STATES.day60).day, 'ascites builds'); assert.equal(w(STATES.day60).spare, '');
  assert.deepEqual([w(STATES.diuretics).day, w(STATES.diuretics).net], ['ascites shrinks', 'Shrinks']);
});

test('the strip is the day on one scale: parts end to end in order, inside the track', () => {
  for (const st of Object.values(STATES)) {
    const P = stripParts(dayOf(st), W);
    let end = 0;
    for (const id of ORDER) {
      assert.ok(P[id].x >= end - 1e-9, `${id} starts after the part before it`);
      assert.ok(P[id].w >= 0 && P[id].x + P[id].w <= W + 1e-9, `${id} stays inside the track`);
      end = P[id].x + P[id].w;
    }
  }
  // (health: carried and the room fill the strip, nothing leaked or reabsorbed; cirrhosis: no room, the overflow is what follows)
  const h = stripParts(dayOf(STATES.healthy), W), c = stripParts(dayOf(STATES.day60), W);
  assert.equal(h.blue.w + h.shrink.w + h.build.w, 0); assert.ok(Math.abs(h.car.w / 300 - 790 / 3600) < 0.02 && h.room.op === 1);
  assert.equal(c.room.w, 0); assert.equal(c.room.op, 0);
  const k = W / 5360;   // (carried 4,340 + the larger of leaked 1,020 and reabsorbed 860)
  assert.ok(Math.abs(c.blue.w - (860 * k + STRIP_MARK - STRIP_GAP)) < 1e-6 && Math.abs(c.build.w - (160 * k + STRIP_MARK)) < 1e-6, 'the blue and the amber are as long as reabsorbed and what builds, on one scale');
  assert.ok(Math.abs(c.brk.x - (c.car.w + STRIP_GAP)) < 1e-9, 'the bracket starts where the carried part ends');
  assert.ok(Math.abs(c.brk.w - (c.blue.w + STRIP_GAP + c.build.w)) < 1e-6, 'and spans what leaked: the blue and the amber, the part of the strip that is not carried');
  // (a day the belly reabsorbs more than leaked: the extra is the ascites going down, the green part, and the bracket stays at what leaked)
  const d = stripParts(dayOf(STATES.diuretics), W);
  assert.ok(d.shrink.w > 0 && d.build.w === 0 && d.brk.w < d.blue.w + d.shrink.w, 'shrinks: green part, no amber, bracket shorter than the reabsorbed');
});

test('ten mL a day over still leaves a mark (the Ascites 4/13 slide), and an empty part shows none', () => {
  const t = stripParts({ carried: 3600, over: 10, back: 0, room: 0 }, W);
  assert.ok(t.build.w >= STRIP_MARK - 1e-9, 'the amber part is a mark you can see');
  assert.equal(t.blue.w, 0, 'nothing reabsorbed: no blue part');
  assert.ok(t.brk.op === 1 && t.brk.w >= STRIP_MARK - 1e-9, 'and its bracket');
  const none = stripParts({ carried: 3600, over: 0, back: 0, room: 0 }, W);
  assert.equal(none.build.w + none.blue.w + none.shrink.w, 0); assert.equal(none.brk.op, 0);
});

test('eased values make no step (nothing pops in or out), and nothing leaves the track', () => {
  let prev = null;
  for (let over = 0; over <= 2200; over++) {
    const P = stripParts({ carried: 3600, over, back: over / 3, room: 0 }, W);
    for (const id of ORDER) assert.ok(P[id].x + P[id].w <= W + 1e-9);
    if (prev) for (const id of ORDER) for (const k of ['x', 'w']) assert.ok(Math.abs(P[id][k] - prev[id][k]) < 1, `${id}.${k} steps by ${Math.abs(P[id][k] - prev[id][k])} at ${over} mL over`);
    prev = P;
  }
  prev = null;
  for (let made = 0; made <= 3600; made += 5) {
    const P = stripParts({ carried: made, over: 0, back: 0, room: 3600 - made }, W);
    assert.ok(P.room.op >= 0 && P.room.op <= 1);
    if (prev) assert.ok(Math.abs(P.room.op - prev.room.op) < 0.1 && Math.abs(P.room.w - prev.room.w) < 0.6, 'the dashed room fades out and shrinks as the lymphatics fill');
    prev = P;
  }
  for (const g of [{ carried: 0, over: 0, back: 0, room: 0 }, { carried: 5000, over: 9000, back: 9000, room: 0 }, { carried: 1, over: 1, back: 0, room: 0 }]) {
    const P = stripParts(g, 120);
    for (const id of ORDER) assert.ok(P[id].x + P[id].w <= 120 + 1e-9 && P[id].w >= 0, `${JSON.stringify(g)}: ${id}`);
  }
});

test('the forces strip: two arrows meeting at the wall, each as long as its pressure', () => {
  const t = tugParts(8.5, 5.3, 300);
  assert.ok(Math.abs(t.push.w + t.pull.w + 3 - 300) < 1e-9, 'together the whole track, less the wall\'s 3 px');
  assert.ok(Math.abs(t.wall / 300 - 8.5 / 13.8) < 1e-9 && t.push.w > t.pull.w);
  assert.ok(t.pull.x > t.push.x + t.push.w, 'the wall lies between them');
  const none = tugParts(0, 0, 300); assert.equal(none.wall, 150);
  assert.equal(tugParts(-2, 4, 300).push.w, 0, 'a push below zero draws nothing');
});

test('only the Testing deck\'s four fluid slides draw the strip, with their tiles under the card', () => {
  const deck = readFileSync(new URL('../src/ui/test-decks/demo-all-new-visuals.js', import.meta.url), 'utf8');
  assert.equal((deck.match(/"kind": "fluid",\s*"window": true/g) || []).length, 4);
  assert.equal((deck.match(/"kind": "fluid"/g) || []).length, 4);
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pres, /!\(s\.tool\?\.kind === 'fluid' && s\.tool\.window\)/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.gs\[hidden\], \.gs-forces\[hidden\] \{ display: none; \}/, 'hidden really hides the flex rows');
  const ext = readFileSync(new URL('../src/ui/ext-instruments.js', import.meta.url), 'utf8');
  assert.match(ext, /'Fluid balance · mL\/day'/, 'the title carries the unit');
  const src = readFileSync(new URL('../src/ui/tool-fluid.js', import.meta.url), 'utf8');
  assert.match(src, /'Leaked '/); assert.match(src, /'Reabsorbed '/); assert.match(src, /'Lymph made '/); assert.match(src, /'Each day'/);
  assert.match(src, /set\(sLeak, mlInt\(d\.over\)\)/); assert.match(src, /set\(sBack, mlInt\(d\.back\)\)/);
  assert.doesNotMatch(src, /taken back:|mL a day · model rates/, 'no "taken back" words and no model sentence on the strip');
});

test('the strip draws each part, keys its swatches, and never sets text under 12 px', () => {
  const src = readFileSync(new URL('../src/ui/tool-fluid.js', import.meta.url), 'utf8');
  for (const cls of ['gs-car', 'gs-blue', 'gs-shrink', 'gs-build', 'gs-ghost', 'gs-brk', 'gs-wall', 'gs-push', 'gs-pull', 'gs-sw-car', 'gs-sw-back', 'gs-sw-build']) assert.ok(src.includes(cls), `${cls} is built`);
  assert.match(src, /swBack\.classList\.toggle\('none'/); assert.match(src, /swBuild\.classList\.toggle\('down'/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.gs-ghost \{[^}]*dashed/);
  assert.match(css, /\.gs-sw\.none \{[^}]*dashed/);
  assert.match(css, /--gs-fs: max\(var\(--fs-12\), calc\(12px \/ \(var\(--pz-fit, 1\) \* var\(--pz-dk, 1\)\)\)\)/, 'the text size holds 12 px on the screen after the card\'s zoom');
  const px = [...css.matchAll(/\.gs[\w-]*[^{}]*\{[^}]*font-size: (\d+(?:\.\d+)?)px/g)].map((m) => +m[1]);
  assert.ok(px.every((n) => n >= 12), 'no text under 12 px in the card');
  assert.match(css, /\[data-kind="fluid"\] \{ width: 100%; \}/, 'the strip fills the card\'s width, as a monitor does');
});

// The card's title is set in capitals by its style; "mL/day" keeps its own case (Mohammad's pick on 20 Oct: "mL/day", not "ML/DAY").
test('a unit in a card title is split out, so the style leaves its case alone', async () => {
  const { titleParts } = await import('../src/ui/title-units.js');
  assert.deepEqual(titleParts('Fluid balance · mL/day'), ['Fluid balance · ', 'mL/day', '']);
  assert.deepEqual(titleParts('Liver stiffness (kPa), FibroScan'), ['Liver stiffness (', 'kPa', '), FibroScan']);
  assert.deepEqual(titleParts('Flow, L/min, and speed, cm/s'), ['Flow, ', 'L/min', ', and speed, ', 'cm/s', '']);
  assert.deepEqual(titleParts('Pressure, portal vein to heart'), ['Pressure, portal vein to heart'], 'no unit, no split');
  assert.deepEqual(titleParts('Millimetres and mLs'), ['Millimetres and mLs'], 'a unit is a whole word');
  const ext = (await import('../src/ui/ext-instruments.js')).default.tools.fluid;
  for (const t of [ext.title({ window: true }), ext.short({ window: true })]) assert.equal(titleParts(t)[1], 'mL/day', `"${t}": the unit is split out, long title and short`);
});
test('the data card sets its title and the footer\'s copy of it through the unit split, and the style keeps the unit as typed', () => {
  const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(js, /ui\.dhT\.textContent = cardTitle\(s\); unitSpans\(ui\.dhT\);/, 'the card header');
  assert.doesNotMatch(js, /pz-tfold/, 'no copy of the title under the words is left (the folded ladder\'s, gone with the ladder on 21 Oct)');
  assert.match(js, /h\('span', \{ class: 'pz-unit' \}, t\)/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pz-unit \{ text-transform: none; letter-spacing: normal; \}/, 'the unit is not upper-cased and takes no caps spacing');
  assert.match(css, /\.pz-dh \{[^}]*text-transform: uppercase/, 'the rest of the header stays in capitals');
  assert.match(css, /\.pz-sub \{[^}]*text-transform: uppercase/, '(and the folded title)');
});
