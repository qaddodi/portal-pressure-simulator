// The stiffness plane's dot is the case the tiles show. Mohammad, 26 Oct, Stiffness slide 7 (Case 2): the tiles read 29.8 kPa and
// platelets of 90 while the plane's dot sat in "No CSPH" at platelets of about 150, where Case 1 had left it. The presenter pins the
// slide's reading while the data card is still out of the layout (the case card is up); the plot has no size then, drew nothing, and
// the observer did not draw it again when the card came back at the same size.
// This runs the real card on a small fake page whose plot can be taken out of the layout and put back, and checks the dot against
// the numbers the tiles print, for every slide in the decks that has the plane in its data card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { DECKS } from '../src/ui/decks.js';
import { deckStates } from './deck-states.js';

const node = (tag) => ({
  tag, nodeType: 1, attrs: {}, kids: [], style: {}, dataset: {}, className: '', isConnected: true, clientWidth: 0, clientHeight: 0, textContent: '',
  classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
  setAttribute(k, v) { this.attrs[k] = v; },
  append(...k) { this.kids.push(...k); },
  replaceChildren(...k) { this.kids = k; },
  addEventListener() {},
  remove() {},
});
globalThis.document.createElement = (tag) => node(tag);
globalThis.document.createElementNS = (ns, tag) => node(tag);
globalThis.document.createTextNode = (t) => ({ nodeType: 3, textContent: String(t) });
globalThis.getComputedStyle = () => ({ fontSize: '14px', getPropertyValue: () => '' });
const frames = [], observers = [];
globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.ResizeObserver = class { constructor(cb) { observers.push(cb); } observe() {} disconnect() {} };
const settle = () => { for (const cb of observers) cb([]); while (frames.length) frames.shift()(); };

const { createPlaneTool, toolPlane, planeOf, planeReading, shownReading, zoneOf, frame, scaler } = await import('../src/ui/visual-plane.js');
const { tileShown } = await import('../src/ui/table-marks.js');
const { fmt } = await import('../src/ui/util.js');

const csph = planeOf('csph');
// The plot's dot, in data units' pixels: where the card's ring group stands, and the words under the plot.
const SIZE = [420, 200];
const place = (f) => { const fr = frame(SIZE[0], SIZE[1]), { X, Y } = scaler(csph, fr); return `translate(${X(f.lsm).toFixed(1)}px, ${Y(f.plt).toFixed(1)}px)`; };
function card() {
  const tool = createPlaneTool();
  tool.configure({ kind: 'plane', plane: 'csph' });
  const plot = tool.el.kids[0], ring = plot.kids[0].kids[2], read = tool.el.kids.at(-1);
  const size = (w, h) => { plot.clientWidth = w; plot.clientHeight = h; };
  return { tool, plot, ring, read, size };
}

test('the dot stands on the numbers pinned while the card was out of the layout (Stiffness Case 2: 29.8 kPa, platelets 90)', () => {
  const a1 = { lsm: 12.4, plt: 160, hvpg: 6.4, ppg: 8.4 }, a2 = { lsm: 29.8, plt: 90, hvpg: 18.3, ppg: 19.7 };
  const { tool, ring, read, size } = card();
  size(...SIZE);
  tool.pin(a1); settle();
  assert.equal(ring.style.transform, place(a1), 'Case 1 first: the dot at 12.4 and 160');
  // The case card comes up: the data card leaves the layout, and the new slide's reading is pinned while it is out.
  size(0, 0); settle();
  tool.pin(a2); settle();
  // The card comes back at the size it had: the observer sees the same size and draws nothing more.
  size(...SIZE); settle();
  assert.equal(ring.style.transform, place(a2), 'Case 2: the dot at 29.8 and 90, not where Case 1 left it');
  assert.match(read.textContent, /29\.8 kPa/);
  assert.match(read.textContent, /90 ×10³\/µL/);
  assert.match(read.textContent, /· CSPH$/, 'and the zone the dot stands in is CSPH, not No CSPH');
});

test('a card that comes back at another size draws the pinned reading at that size', () => {
  const a2 = { lsm: 29.8, plt: 90 };
  const { tool, ring, size } = card();
  size(...SIZE);
  tool.pin({ lsm: 12.4, plt: 160 }); settle();
  size(0, 0); settle();
  tool.pin(a2); settle();
  size(360, 168); settle();
  const fr = frame(360, 168), { X, Y } = scaler(csph, fr);
  assert.equal(ring.style.transform, `translate(${X(29.8).toFixed(1)}px, ${Y(90).toFixed(1)}px)`);
});

test('a card pinned before it has ever had a size draws as soon as it has one', () => {
  const { tool, ring, size } = card();
  tool.pin({ lsm: 29.8, plt: 90 }); settle();
  assert.equal(ring.style.opacity, undefined, 'nothing to draw on yet');
  size(...SIZE); settle();
  assert.equal(ring.style.transform, place({ lsm: 29.8, plt: 90 }));
});

// The dot and its zone read the numbers as the tiles print them (each tile's own decimals): 24.97 kPa prints as 25.0, which is
// CSPH by the rule (25 kPa or more); 15.04 kPa with platelets of 150.4 print as 15.0 and 150, which is No CSPH.
test('the dot, its zone and the words read the numbers as the tiles print them', () => {
  for (const [f, zone] of [[{ lsm: 24.97, plt: 200 }, 'CSPH'], [{ lsm: 15.04, plt: 150.4 }, 'No CSPH'], [{ lsm: 14.96, plt: 149.6 }, 'No CSPH']]) {
    assert.equal(zoneOf(csph, shownReading(csph, f)).t, zone, JSON.stringify(f));
    assert.ok(planeReading(csph, f).endsWith(`· ${zone}`), `${planeReading(csph, f)} names ${zone}`);
  }
  const { tool, ring, size } = card();
  size(...SIZE);
  tool.pin({ lsm: 24.97, plt: 89.6 }); settle();
  assert.equal(ring.style.transform, place({ lsm: 25, plt: 90 }), 'the dot is on 25.0 and 90, the tiles\' numbers');
});

// Every slide whose data card carries the plane: its dot, its words and its zone are the tiles' numbers for the slide's state, and
// the tiles beside it are not the plane's own two readings again (the chart prints those).
test('every slide with the plane in its data card reads the numbers the tiles print, and its tiles are not the chart\'s axes', async () => {
  let n = 0;
  for (const d of DECKS) {
    const st = await deckStates(d);
    for (const [i, s] of d.slides.entries()) {
      if (s.tool?.kind !== 'plane') continue;
      n++;
      const pl = toolPlane(s.tool), id = `${d.id}/${s.id}`, fp = st[i];
      assert.ok(Number.isFinite(fp[pl.x.key]) && Number.isFinite(fp[pl.y.key]), `${id}: the state has both readings`);
      const x = tileShown(pl.x.key, fp[pl.x.key]), y = tileShown(pl.y.key, fp[pl.y.key]);
      const sh = shownReading(pl, fp);
      assert.equal(sh[pl.x.key], x, `${id}: the x reading is the tile's`);
      assert.equal(sh[pl.y.key], y, `${id}: the y reading is the tile's`);
      const dec = (k) => (k === 'plt' ? 0 : 1);
      assert.ok(planeReading(pl, fp).includes(fmt(x, dec(pl.x.key))) && planeReading(pl, fp).includes(fmt(y, dec(pl.y.key))), `${id}: the words print ${fmt(x, dec(pl.x.key))} and ${fmt(y, dec(pl.y.key))}`);
      assert.equal(planeReading(pl, fp).split(' · ').at(-1), zoneOf(pl, sh).t, `${id}: the zone is the shown numbers'`);
      if (s.data === 'tiles') for (const k of [pl.x.key, pl.y.key]) assert.ok(!(s.tiles || []).includes(k), `${id}: the ${k} tile repeats the chart's own axis`);
    }
  }
  assert.ok(n >= 7, 'the Stiffness cases, Treating the cause year 2 and Ten years year 0 all have it');
});
