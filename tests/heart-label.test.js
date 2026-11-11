// The heart's rate and output on the heart's own label (heart-label.js; Mohammad, 11 Nov 2026: "just be a label on the heart label, discrete
// and ok to hide if not important but can show if can fit with the label"): a quiet suffix on the right atrium's label in the Anatomy, a quiet
// line under the Heart title in the Circuit, shown only where it fits, never moving a label or its leader, and laying nothing out as it ticks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL } from './stage-gl-boot.js';
import { HEART_KEY, addHeart, heartPass, heartRuns, heartStrip, heartWords, HEART_LOOK } from '../src/ui/heart-label.js';

const F = { metrics: { hr: 72, co: 5.04 } };
const lineW = (l) => l.reduce((a, r, i) => a + r.t.length * 6 + (i ? r.gap ?? 3 : 0), 0), LINE_H = () => 14;
const station = () => ({ key: 'n:RA', align: 'start', x: 100, y: 100, w: 90, h: 14, padX: 3, padY: 2, label: 'Right atrium: 3 millimeters of mercury',
  lines: [[{ t: 'Right atrium', size: 11.5, cls: 'lb-name' }, { t: '3.0', size: 14, weight: 650, cls: 'lb-val', gap: 4 }]], ax: 80, ay: 140, leader: true });

test('the reading is the tiles\' words, quieter than the label\'s value, and not part of its box', () => {
  const r = heartRuns(F, HEART_LOOK.node, 6);
  assert.deepEqual(r.map((x) => x.t), ['72 /min', '·', '5.0 L/min']);
  assert.ok(r.every((x) => x.sfx && x.cls === 'lb-unit' && x.size < 14 && x.weight < 650), 'smaller and lighter than the value, in the units\' ink');
  assert.deepEqual(heartRuns(F, HEART_LOOK.node, 6, true).map((x) => x.t), ['88 /min', '·', '88.8 L/min'], 'fitted at its widest');
  assert.equal(heartWords(F), 'heart rate 72 a minute, cardiac output 5.0 litres a minute');
  const it = station();
  addHeart(it, F); addHeart(it, { metrics: { hr: 81, co: 4.2 } });
  assert.equal(it.lines[0].filter((x) => x.sfx).length, 3, 'put on again, it replaces the one it had');
  assert.equal(it.lines[0][2].t, '81 /min');
  assert.equal(it.w, 90, 'the label\'s box is its own');
  assert.equal(it.label, 'Right atrium: 3 millimeters of mercury, heart rate 81 a minute, cardiac output 4.2 litres a minute');
  const s = heartStrip(station(), F, lineW, LINE_H);
  assert.equal(s.x0, 100 + lineW(station().lines[0]), 'after the value');
  assert.equal(heartStrip({ ...station(), align: 'end' }, F, lineW, LINE_H), null, 'a label set from its end has no room after it that keeps it still');
});

test('it comes on only where it fits, and stays on with less room than it took to come on', () => {
  const pass = (other, was) => {
    const it = station(), out = [it, ...(other ? [other] : [])], sol = new Map();
    heartPass(out, { f: F, solve: true, circuit: false, on: true, sol, was, lineW, LINE_H, lineHits: null, obstacles: [], view: () => ({ x0: 0, y0: 0, x1: 1000, y1: 1000 }),
      boxOf: (o) => ({ x0: o.x - o.padX, y0: o.y - o.padY, x1: o.x + o.w + o.padX, y1: o.y + o.h + o.padY }), rectOf: (o) => ({ x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h }), leaderEnd: (r) => ({ x: r.x0, y: r.y1 }) });
    return { on: sol.get(HEART_KEY).on.has('n:RA'), it };
  };
  const end = 100 + lineW(heartRuns(F, HEART_LOOK.node, 6, true).reduce((l, r) => [...l, r], station().lines[0]));
  const at = (x) => ({ key: 'n:X', x: x + 3, y: 100, w: 40, h: 14, padX: 3, padY: 2, ax: x + 200, ay: 100 });
  assert.equal(pass(null).on, true, 'room: on');
  assert.equal(pass(null).it.lines[0].length, 5);
  assert.equal(pass(at(end + 1)).on, false, 'a label 1 px past its end: no room to come on');
  const was = new Map([[HEART_KEY, { on: new Set(['n:RA']) }]]);
  assert.equal(pass(at(end + 1), was).on, true, 'but on already, it stays');
  assert.equal(pass(at(end - 2), was).on, false, 'and goes once it would touch');
  const off = pass(at(end - 2));
  assert.equal(off.it.lines[0].length, 2, 'left off, the label is as it was');
});

const { st, frame, page } = await bootGL({ w: 1200, h: 800, dpr: 1 });
const { store } = await import('../src/ui/store.js');
// (jsdom gives a color-mix() fill back as written; a browser computes it to a colour, which is what the label layer reads: as one here.)
{ const cs = globalThis.getComputedStyle; globalThis.getComputedStyle = (el, p) => { const c = cs(el, p); return /^color-mix/.test(c.fill) ? new Proxy(c, { get: (o, k) => (k === 'fill' ? 'rgb(120, 200, 140)' : typeof o[k] === 'function' ? o[k].bind(o) : o[k]) }) : c; }; }
const fx = (heart) => ({ live: {}, organs: [], calipers: [], spans: [], zone: -1, steps: null, heart });
const box = (k) => { const d = (st.labelSnapshot()?.items || []).find((x) => x.key === k && +x.a > 0.5); return d && { x: d.x, y: d.y, w: d.w, h: d.h, pin: d.pin ? [d.px, d.py] : null }; };
const aria = (k) => page.document.querySelector(`[data-key="${k}"]`)?.getAttribute('aria-label') || '';
const run = async (n) => { for (let i = 0; i < n; i++) await frame(); };

test('on the figure the heart\'s label takes the reading where it fits, and nothing moves', async () => {
  await run(60);
  store.set({ presenting: true, presentLabels: ['RA'], presentTerms: null });
  for (const [view, key] of [['anatomy', 'n:RA'], ['circuit', 'z:Heart']]) {
    st.setView(view);
    await run(160);
    st.callouts(fx(false)); await run(40);
    const off = box(key);
    assert.ok(off, `${view}: the heart's label shows`);
    assert.doesNotMatch(aria(key), /heart rate/);
    st.callouts(fx(true)); await run(40);
    const on = box(key);
    assert.match(aria(key), /heart rate \d+ a minute, cardiac output [\d.]+ litres a minute/i, `${view}: it reads the rate and output`);
    // (The Circuit's line is centred under its title: the picture is as wide as the wider of the two, about the same middle.)
    const mid = (b) => b.x + b.w / 2;
    if (view === 'anatomy') assert.equal(on.x, off.x, `${view}: the label stands where it stood`); else assert.ok(Math.abs(mid(on) - mid(off)) < 1, `${view}: the title stands where it stood`);
    assert.equal(on.y, off.y);
    assert.deepEqual(on.pin, off.pin, `${view}: its leader too`);
    assert.ok(view === 'anatomy' ? on.w > off.w + 40 : on.h > off.h + 6, `${view}: the reading is drawn with it (${JSON.stringify(off)} → ${JSON.stringify(on)})`);
    const n0 = st.labelStats().layouts;
    st.callouts(fx(true)); await run(30);
    assert.equal(st.labelStats().layouts, n0, `${view}: the slide's readings coming again lay nothing out`);
    const again = box(key);
    assert.deepEqual([again.x, again.y, again.pin], [on.x, on.y, on.pin]);
    st.callouts(fx(false)); await run(40);
    const back = box(key);   // (its own value may have ticked meanwhile: its words' width with it)
    assert.deepEqual([back.x, back.y, back.pin], [off.x, off.y, off.pin], `${view}: on a slide without it the label is as it was`);
    assert.ok(Math.abs(back.w - off.w) < 8 && Math.abs(back.h - off.h) < 1, `${view}: and as wide (${JSON.stringify(back)})`);
  }
});
