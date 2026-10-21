// The fluid balance's capacity window (tool { kind: 'fluid', window: true }, tool-fluid.js; Mohammad's pick, 20 Oct 2026):
// per-day numbers whose printed sums are exact, the window's geometry on one scale, the Lymphatics row's word, and the
// Testing deck's four fluid slides opting in.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fluidDay, windowGeom, windowState, windowParts, WINDOW_TOP, GHOST, SLIVER, LANE_MIN } from '../src/ui/tool-fluid.js';

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

test('the window widens with what the lymphatics can carry, and the overflow never leaves the bar', () => {
  const h = windowGeom(perMin(STATES.healthy)), c = windowGeom(perMin(STATES.day60));
  assert.ok(Math.abs(h.win - 3600 / WINDOW_TOP) < 1e-9 && c.win > h.win, 'one scale: the day-60 window is wider');
  assert.ok(Math.abs(h.fill - 790 / 3600) < 1e-9 && c.fill === 1, 'health fills a fifth; cirrhosis fills it');
  assert.ok(Math.abs(c.over - 1020 / WINDOW_TOP) < 1e-9);
  assert.ok(Math.abs(c.back - 860 / WINDOW_TOP) < 1e-9, 'reabsorbed on the same scale as the overflow');
  assert.ok(Math.abs(c.liver - 2330 / 5360) < 1e-9 && h.liver === 1, 'health is all liver');
  for (const f of [perMin(STATES.day60), { hep: 4, spl: 4, cap: 2, back: 0 }, { hep: 0, spl: 0, cap: 6, back: 0 }]) {
    const g = windowGeom(f);
    assert.ok(g.win + g.over <= 1 + 1e-9, 'window and overflow fit the bar');
    assert.ok(g.fill >= 0 && g.fill <= 1);
    assert.ok(g.liver >= 0 && g.liver <= 1, 'the liver\'s part is a share of the fill');
  }
});

test('the Lymphatics row names the room left or the overflow', () => {
  assert.deepEqual(windowState(fluidDay(perMin(STATES.healthy))), { text: '2,810 to spare', rate: 'ok' });
  assert.deepEqual(windowState(fluidDay(perMin(STATES.schisto))), { text: '10 to spare', rate: 'mid' });
  assert.deepEqual(windowState(fluidDay(perMin(STATES.day60))), { text: 'Full, 1,020 over', rate: 'hi' });
});

test('only the Testing deck\'s four fluid slides draw the window, with their tiles under the card', () => {
  const deck = readFileSync(new URL('../src/ui/test-decks/demo-all-new-visuals.js', import.meta.url), 'utf8');
  assert.equal((deck.match(/"kind": "fluid",\s*"window": true/g) || []).length, 4);
  assert.equal((deck.match(/"kind": "fluid"/g) || []).length, 4);
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pres, /!\(s\.tool\?\.kind === 'fluid' && s\.tool\.window\)/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.gw\[hidden\] \{ display: none; \}/, 'hidden really hides the flex rows');
  const ext = readFileSync(new URL('../src/ui/ext-instruments.js', import.meta.url), 'utf8');
  assert.match(ext, /'Fluid balance · mL\/day'/, 'the title carries the unit');
  const src = readFileSync(new URL('../src/ui/tool-fluid.js', import.meta.url), 'utf8');
  assert.match(src, /'Leaked'/); assert.match(src, /'Reabsorbed'/);
  assert.match(src, /set\(wInV, n0\(d\.over\)\)/); assert.match(src, /set\(wBackV, n0\(d\.back\)\)/);
  assert.doesNotMatch(src, /taken back:|mL a day · model rates/, 'no "taken back" words and no model sentence on the window');
});

// Ghost parts (Mohammad's pick A, 21 Oct): every part is always drawn, a dashed outline while it has nothing in it, and the solid
// part grows out of it, so no part pops in or out and a number never floats without its mark.
const BW = 300, NAME = 70;
const parts = (st, nameW = NAME) => windowParts(windowGeom(perMin(st)), BW, nameW);
test('ghost parts: health shows every ghost, cirrhosis none, and the lanes end together', () => {
  const h = parts(STATES.healthy);
  assert.equal(h.cap, 0); assert.equal(h.capGhost, 1); assert.equal(h.inGhost, 1); assert.equal(h.backGhost, 1);
  assert.equal(h.spare, 1, 'health has room left in the window: dashed');
  assert.ok(Math.abs(h.end - (h.win + GHOST)) < 1e-9, 'with nothing over, the lanes end at the ghost\'s end');
  const c = parts(STATES.day60), d = parts(STATES.diuretics);
  for (const x of [c, d]) { assert.equal(x.capGhost, 0); assert.equal(x.inGhost, 0); assert.equal(x.backGhost, 0); assert.equal(x.spare, 0, 'the window is full'); }
  assert.ok(Math.abs(c.end - (c.win + c.cap)) < 1e-9 && c.end === d.end, 'the lanes end under the overflow\'s end');
  assert.ok(d.backW > c.backW && c.inW === d.inW, 'the diuretics slide\'s Reabsorbed lane is the longer one');
});
test('ghost parts: ten mL a day over still leaves a mark (the Ascites 4/13 slide)', () => {
  const t = parts({ liver: 2850, gut: 760, limit: 3600, back: 0 });
  assert.ok(t.cap >= SLIVER && t.inW >= LANE_MIN, 'a cap and a lane you can see');
  assert.equal(t.backW, 0, 'no Reabsorbed lane, only its ghost');
  assert.ok(t.inGhost > 0.5 && t.backGhost === 1, 'the ghosts still show beside the marks');
});
test('ghost parts: eased values make no step (nothing pops in or out)', () => {
  let prev = null;
  for (let over = 0; over <= 2200; over++) {
    const p = windowParts(windowGeom({ hep: (3600 + over) / 1440, spl: 0, cap: 3600 / 1440, back: over / 3 / 1440 }), BW, NAME);
    if (prev) for (const k of ['cap', 'end', 'inW', 'backW', 'capGhost', 'inGhost', 'backGhost']) assert.ok(Math.abs(p[k] - prev[k]) < 0.4, `${k} steps by ${Math.abs(p[k] - prev[k])} at ${over} mL over`);
    prev = p;
  }
  prev = null;
  for (let made = 0; made <= 3600; made += 5) {
    const p = windowParts(windowGeom({ hep: made / 1440, spl: 0, cap: 3600 / 1440, back: 0 }), BW, NAME);
    assert.ok(p.spare >= 0 && p.spare <= 1);
    if (prev) assert.ok(Math.abs(p.spare - prev.spare) < 0.2, 'the dashed room fades out as the window fills');
    prev = p;
  }
});
test('ghost parts: a lane keeps clear of the name, and nothing leaves the track', () => {
  for (const back of [0, 860, 2160, 5000, 9000]) {
    const p = parts({ liver: 2330, gut: 3030, limit: 4340, back }, 80);
    assert.ok(p.end - p.backW >= 80 + 8 - 1e-9, `Reabsorbed ${back} stays 8 px clear of its name`);
    assert.ok(p.end <= BW + 1e-9 && p.win + p.cap <= BW + SLIVER, 'the overflow ends inside the track');
  }
  const wide = windowParts(windowGeom({ hep: 3, spl: 0, cap: 3.8, back: 0 }), BW, NAME);
  assert.ok(wide.end <= BW && wide.ghostW <= GHOST, 'a very wide window leaves the ghost less room, never past the track');
});
test('ghost parts: the card draws each ghost and keys the fill\'s greens', () => {
  const src = readFileSync(new URL('../src/ui/tool-fluid.js', import.meta.url), 'utf8');
  for (const cls of ['gw-spare', 'gw-overg', 'gw-dropg', 'gw-slot-in', 'gw-slot-back', 'gw-sw-l', 'gw-sw-g', 'gw-ld-in', 'gw-ld-back']) assert.ok(src.includes(cls), `${cls} is built`);
  assert.match(src, /gw-nosw/, 'the swatches give way on a card too narrow for them, the same on every slide');
  assert.doesNotMatch(src, /Nothing runs over|gw-none/, 'the dashed lanes say it; no sentence');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.gw-ghost \{[^}]*dashed/);
  assert.match(css, /\.gw-sw\.none \{[^}]*dashed/);
  assert.match(css, /\.gw-pic\.back \.gw-back \{ opacity: 1; \}|\.gw-pic\.back \.gw-back, /, 'the Reabsorbed lane shows whenever something is reabsorbed');
  const sizes = [...css.matchAll(/\.gw[\w-]*[^{}]*\{[^}]*font-size: (\d+(?:\.\d+)?)px/g)].map((m) => +m[1]);
  assert.ok(sizes.every((n) => n >= 12), 'no text under 12 px in the card');
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
  assert.match(js, /row\.firstChild\.textContent = ui\.dhT\.textContent; unitSpans\(row\.firstChild\);/, 'the folded title under the words (Mac and iPad)');
  assert.match(js, /h\('span', \{ class: 'pz-unit' \}, t\)/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pz-unit \{ text-transform: none; letter-spacing: normal; \}/, 'the unit is not upper-cased and takes no caps spacing');
  assert.match(css, /\.pz-dh \{[^}]*text-transform: uppercase/, 'the rest of the header stays in capitals');
  assert.match(css, /\.pz-sub \{[^}]*text-transform: uppercase/, '(and the folded title)');
});
