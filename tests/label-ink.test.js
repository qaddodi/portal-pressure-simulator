// A label's words' ink is the GPU instance's, not its picture's (render-cost plan 2.2, ledger R11's open limit): the atlas holds each
// label's outlined shape once, and lit (the term's colour on the words, the outline kept), unlit and dim (35 %) are numbers per instance.
// Run as the stage runs it (stage-label-layer.js renderBlock and blockRest, label-gl.js over the warm harness's WebGL), the atlas paints
// are counted; and the split picture is laid down by a reference rasteriser beside the picture painted in its colours, pixel for pixel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from '../scripts/warm/dom.mjs';

const P = installPage();
globalThis.AbortController = P.dom.window.AbortController;
globalThis.WebGL2RenderingContext ??= function WebGL2RenderingContext() {};
globalThis.getComputedStyle = (el, p) => P.liveStyle(el, p);
const TEXT = await import('../src/ui/text-gl.js');
await TEXT.loadGlyphs();
const { createLabelGL, inkSplit, layBlock, blockOps, lookKey } = await import('../src/ui/label-gl.js');
const { createLabelLayer } = await import('../src/ui/stage-label-layer.js');
const { store } = await import('../src/ui/store.js');
const NS = 'http://www.w3.org/2000/svg';

// (The theme's label inks, light: --text-2 for a name, --text for a reading, --text-3 for its unit, over the cream --label-halo; a lit
// term's colour on every run, its name bold (app.css .lb.term); unlit and an explained label's others at 35 %.)
const NAME = 'rgb(78, 75, 70)', VAL = 'rgb(26, 25, 23)', UNIT = 'rgb(103, 99, 93)';
const TONES = { a: 'rgb(196, 61, 47)', b: 'rgb(40, 110, 200)', c: 'rgb(30, 140, 90)' };
const rgb = (s) => s.match(/\d+/g).slice(0, 3).map((v) => v / 255);
{
  const st = document.createElement('style');
  st.textContent = `#lbi .lb tspan { font-family: Inter; font-size: 12px; font-weight: 500; stroke: rgba(251, 250, 247, 0.92); stroke-width: 3px; stroke-linejoin: round; paint-order: stroke; }
    #lbi .lb .lb-name { fill: ${NAME}; } #lbi .lb .lb-val { fill: ${VAL}; } #lbi .lb .lb-unit { fill: ${UNIT}; }
    ${Object.entries(TONES).map(([k, c]) => `#lbi .lb.term.t-${k} :is(.lb-name, .lb-val, .lb-unit) { fill: ${c}; }`).join('\n')}
    #lbi .lb.term .lb-name { font-weight: 700; }
    #lbi .lb.unlit, #lbi .lb.spot-dim { opacity: 0.35; }`;
  document.head.append(st);
}

function rig(n) {
  const svg = document.createElementNS(NS, 'svg'), leaders = document.createElementNS(NS, 'g'), blocks = document.createElementNS(NS, 'g');
  svg.id = 'lbi'; leaders.setAttribute('class', 'lb-leaders');
  svg.append(leaders, blocks); document.body.append(svg);
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
  const host = { canvas, gl: canvas.getContext('webgl2'), active: () => true, ask: () => {}, now: () => {} };
  const lg = createLabelGL(svg, blocks, { host, marks: [leaders], force: true });
  const q = [];
  const run = (op, a, b) => {
    if (op === 'label') { if (!a.isConnected) blocks.append(a); } else if (op === 'kids') { a.replaceChildren(...b); lg.dirty(a); } else if (op === 'fill') { a.style.fill = b; lg.dirty(a); }
  };
  const late = (op, a, b) => q.push([op, a, b]);
  const lateQueue = { now() { for (const [op, a, b] of q.splice(0)) run(op, a, b); } };
  const pool = new Map(), explain = { key: null, state: () => null };
  const live = { labelGL: lg, laidFrame: 1, frameNo: 1, labelK: 1, keyStops: true, morph: 0, morphTarget: 0, resLit: new Map(), CTM: { a: 1, b: 0, e: 0, f: 0 } };
  live.labelGlSync = () => lg.sync([...pool.values()].filter((b) => b.pos).map((b) => b.pos));
  const setA = (el, k, v) => { const c = el._a || (el._a = {}); if (c[k] === v) return false; c[k] = v; el.setAttribute(k, v); return true; };
  const noop = () => {};
  const L = createLabelLayer({ ANCHOR_W: [0, 0], LABEL_GLIDE_MS: 450, LINE_H: () => 16, NO_ANCHOR: /./, dprDots: noop, easeInOut: (t) => t, explain, fontPx: (v) => v ?? 12,
    gLeaders: leaders, late, lateQueue, localToWorldInto: noop, nextFrame: (f) => setTimeout(f, 16), onSelect: noop, pinKind: () => 0, pool, setA,
    toneCol: (t) => TONES[t], unlitKeys: new Set(), updateLabels: noop, wrap: document.createElement('div') }, live);
  const r = (t, cls, gap) => ({ t, size: 12, weight: 500, cls, gap });
  const items = [];
  for (let i = 0; i < n; i++) {
    // (Every tenth a reading with no name: lighting it changes no weight, only its colour.)
    const lines = i % 10 === 9 ? [[r(String(10 + i), 'lb-val'), r('mmHg', 'lb-unit', 3)]] : [[r('Vein ' + i, 'lb-name'), r(String(10 + i), 'lb-val', 4), r('mmHg', 'lb-unit', 3)]];
    items.push({ key: 'n:V' + i, node: 'V' + i, cls: 'node', lines, align: 'start', w: 110, h: 14, padX: 2, padY: 2, x: 10 + (i % 6) * 190, y: 30 + Math.floor(i / 6) * 120, live: true });
  }
  const lay = () => { live.laidFrame = ++live.frameNo; for (const it of items) L.renderBlock(it); live.labelGlSync(); };
  const frames = async (k = 10) => { for (let i = 0; i < k; i++) { await new Promise((res) => setTimeout(res, 15)); lg.drawInto(); } };
  const settle = async () => { lay(); await frames(); lay(); await frames(); };
  // (A change that waits on the label layer's own between-frames pass: frames are drawn until the picture shows it, so a busy machine's late timers cannot fail the check.)
  const until = async (ok, k = 200) => { for (let i = 0; i < k && !ok(); i++) await frames(1); };
  // (A slide that lights some stations in tone t: the label layer's classes, and the tone's own class, as a slide's --term would set it.)
  const light = (tones) => {
    store.set({ presenting: !!tones, presentTerms: tones });
    for (const b of pool.values()) for (const k of Object.keys(TONES)) b.g.classList.toggle('t-' + k, !!tones && tones[b.it?.node] === k);
  };
  const shot = () => { const o = {}; for (const it of lg.snapshot().items) o[it.key] = it; return o; };
  return { lg, pool, items, settle, frames, until, light, shot };
}
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

test('lit, unlit and dim on 30 labels paint nothing in the atlas: the drawn ink and opacity change', async () => {
  const R = rig(30);
  await R.settle();
  const s0 = R.shot();
  assert.equal(Object.keys(s0).length, 30, `all drawn on the GPU: ${Object.keys(s0).length}`);
  for (const it of Object.values(s0)) assert.ok(it.ink && it.a === 1, `${it.key}: inks of its own, full strength`);
  assert.ok(close(s0['n:V0'].ink, [...rgb(NAME), ...rgb(VAL), ...rgb(UNIT)]), `at rest the theme's inks: ${s0['n:V0'].ink}`);
  // (Each label's bold name, lit, is a shape of its own: painted the first time a slide lights it, then kept beside the plain one.)
  const all = Object.fromEntries(R.items.map((it) => [it.node, 'a']));
  R.light(all); await R.settle();
  R.light(null); await R.settle();
  const warm = R.lg.paints;
  // Now: slides that light half of them in one tone, the other half in another, none, and an explained label whose others step back.
  const evens = {}, odds = {};
  R.items.forEach((it, i) => { (i % 2 ? odds : evens)[it.node] = i % 2 ? 'c' : 'b'; });
  for (const round of [evens, odds, all, evens, null]) {
    R.light(round); await R.settle();
    const s = R.shot();
    for (const it of R.items) {
      const got = s[it.key], tone = round?.[it.node];
      assert.ok(got, `${it.key} drawn`);
      if (tone) {
        const t = rgb(TONES[tone]), lit = it.lines[0].length === 2 ? [...t, ...t, 0, 0, 0] : [...t, ...t, ...t];
        assert.ok(close(got.ink, lit), `${it.key}: lit in ${tone}: ${got.ink}`);
        assert.equal(got.a, 1);
      } else {
        const rest = it.lines[0].length === 2 ? [...rgb(VAL), ...rgb(UNIT), 0, 0, 0] : [...rgb(NAME), ...rgb(VAL), ...rgb(UNIT)];
        assert.ok(close(got.ink, rest), `${it.key}: the theme's inks: ${got.ink}`);
        assert.ok(Math.abs(got.a - (round ? 0.35 : 1)) < 1e-6, `${it.key}: ${round ? 'unlit at 35 %' : 'full'}: ${got.a}`);
      }
    }
  }
  // (An explained label: the others at 35 %, told as stage-hover.js tells them.)
  for (const b of R.pool.values()) if (b.it.node !== 'V3') { b.g.classList.add('spot-dim'); R.lg.dirty(b.g); }
  await R.until(() => Math.abs((R.shot()['n:V0']?.a ?? 1) - 0.35) < 1e-6);
  const sd = R.shot();
  assert.ok(Math.abs(sd['n:V0'].a - 0.35) < 1e-6 && sd['n:V3'].a === 1, 'dim: the others at 35 %');
  for (const b of R.pool.values()) { b.g.classList.remove('spot-dim'); R.lg.dirty(b.g); }
  await R.until(() => Math.abs((R.shot()['n:V0']?.a ?? 0) - 1) < 1e-6);
  await R.frames();
  assert.equal(R.lg.paints, warm, `no atlas paint through ${R.lg.paints - warm} toggles' worth`);
  R.lg.dispose();
});

test('a reading lit for the first time, its weight unchanged, paints nothing', async () => {
  const R = rig(10);
  await R.settle();
  const p0 = R.lg.paints;
  R.light({ V9: 'a' }); await R.settle();
  assert.ok(close(R.shot()['n:V9'].ink.slice(0, 6), [...rgb(TONES.a), ...rgb(TONES.a)]));
  R.light({ V9: 'b' }); await R.settle();
  R.light(null); await R.settle();
  // (V0..V8 are unlit and lit again in this: opacity only. V9 changes colour twice.)
  assert.equal(R.lg.paints, p0);
  R.lg.dispose();
});

test('a label of more than three word colours keeps them in its picture, and is painted again for a new one', () => {
  const run = (t, fill, x) => ({ t, dx: x, font: '500 12px Inter', size: 12, wt: 500, it: false, fam: 'Inter', ls: 0, tnum: true, fill, stroke: '', sw: 0, join: 'round', strokeFirst: true });
  const d = (c) => ({ opacity: 1, filter: '', parts: [{ k: 'text', x: 0, y: 12, anchor: 'start', runs: [run('a', NAME, 0), run('b', VAL, 3), run('c', UNIT, 3), run('d', c, 3)] }] });
  assert.equal(inkSplit(d('rgb(1, 2, 3)')), null, 'four colours: its own colours');
  assert.notEqual(lookKey(d('rgb(1, 2, 3)'), false, 2), lookKey(d('rgb(4, 5, 6)'), false, 2));
  const s = inkSplit(d(VAL));
  assert.equal(s.n, 3, 'four runs of three colours share three inks');
  assert.equal(lookKey(s.shape, false, 2), lookKey(inkSplit(d(VAL)).shape, false, 2));
});

// ── The pictures, laid down by a reference rasteriser: the split one (its shape, and its inks' shares, each as an RGBA8 texture) put
// together as the labels' fragment shader does (AFS: c.rgb += m.r * ink0 + m.g * ink1 + m.b * ink2) against the picture painted in its
// own colours, as the label layer painted every label before. ──
const SS = 4;   // (4 × 4 samples a pixel)
function coverage(op, w, h) {
  const m = op.m, at = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const segs = [];
  for (const p of op.geom.poly) {
    const n = p.pts.length / 2;
    for (let i = 0; i < n; i++) {
      if (!p.closed && i === n - 1) break;
      const j = (i + 1) % n;
      segs.push([...at(p.pts[2 * i], p.pts[2 * i + 1]), ...at(p.pts[2 * j], p.pts[2 * j + 1])]);
    }
  }
  const W = w * SS, H = h * SS, hit = new Uint8Array(W * H);
  if (op.kind === 'fill') {
    for (let sy = 0; sy < H; sy++) {
      const y = (sy + 0.5) / SS, xs = [];
      for (const [x0, y0, x1, y1] of segs) if ((y0 <= y) !== (y1 <= y)) xs.push([x0 + (y - y0) / (y1 - y0) * (x1 - x0), y1 > y0 ? 1 : -1]);
      xs.sort((a, b) => a[0] - b[0]);
      let wn = 0;
      for (let k = 0; k < xs.length - 1; k++) {
        wn += xs[k][1];
        if (!wn) continue;
        for (let sx = Math.max(0, Math.ceil(xs[k][0] * SS - 0.5)); sx < W && (sx + 0.5) / SS < xs[k + 1][0]; sx++) hit[sy * W + sx] = 1;
      }
    }
  } else {
    const r = op.w * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) / 2;
    for (const [x0, y0, x1, y1] of segs) {
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-12;
      const a0 = Math.max(0, Math.floor((Math.min(x0, x1) - r) * SS)), a1 = Math.min(W - 1, Math.ceil((Math.max(x0, x1) + r) * SS));
      const b0 = Math.max(0, Math.floor((Math.min(y0, y1) - r) * SS)), b1 = Math.min(H - 1, Math.ceil((Math.max(y0, y1) + r) * SS));
      for (let sy = b0; sy <= b1; sy++) for (let sx = a0; sx <= a1; sx++) {
        const px = (sx + 0.5) / SS - x0, py = (sy + 0.5) / SS - y0, t = Math.max(0, Math.min(1, (px * dx + py * dy) / L2)), ex = px - t * dx, ey = py - t * dy;
        if (ex * ex + ey * ey <= r * r) hit[sy * W + sx] = 1;
      }
    }
  }
  const c = new Float64Array(w * h);
  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) if (hit[sy * W + sx]) c[Math.floor(sy / SS) * w + Math.floor(sx / SS)] += 1 / (SS * SS);
  return c;
}
// (Source over, premultiplied, as the painter lays each op; then kept as an RGBA8 texture.)
function paint(ops, covs, w, h) {
  const px = new Float64Array(w * h * 4);
  ops.forEach((op, k) => {
    const [r, g, b, a] = op.paint.solid, cv = covs[k];
    for (let i = 0; i < w * h; i++) {
      const s = a * op.alpha * cv[i];
      if (!s) continue;
      const o = i * 4;
      px[o] = r * s + px[o] * (1 - s); px[o + 1] = g * s + px[o + 1] * (1 - s); px[o + 2] = b * s + px[o + 2] * (1 - s); px[o + 3] = s + px[o + 3] * (1 - s);
    }
  });
  return Uint8Array.from(px, (v) => Math.round(Math.min(1, v) * 255));
}
const runOf = (t, fill, wt, dx, halo) => ({ t, dx, font: `${wt} 12px Inter`, size: 12, wt, it: false, fam: 'Inter, system-ui, sans-serif', ls: 0, tnum: true, fill, stroke: halo, sw: 3, join: 'round', strokeFirst: true });
const label = (fills, wt, halo, opacity) => ({ opacity, filter: '', parts: [{ k: 'text', x: 0, y: 12, anchor: 'start', runs: [runOf('Portal', fills[0], wt, 0, halo), runOf('12', fills[1], 500, 4, halo), runOf('mmHg', fills[2], 500, 3, halo)] }] });
const THEMES = {
  // (Light: cream outlines; dark: dark ones. Mohammad's call: the outline colours stay as they are.)
  light: { halo: 'rgba(251, 250, 247, 0.92)', rest: [NAME, VAL, UNIT], term: TONES.a },
  dark: { halo: 'rgba(26, 25, 23, 0.9)', rest: ['rgb(183, 177, 168)', 'rgb(238, 235, 229)', 'rgb(166, 158, 149)'], term: 'rgb(232, 120, 98)' },
};

test('lit, unlit and dim labels look as they did, pixel for pixel within rounding, in both themes', () => {
  const dpr = 2;
  for (const [name, th] of Object.entries(THEMES)) {
    const cases = {
      lit: label([th.term, th.term, th.term], 700, th.halo, 1),
      unlit: label(th.rest, 500, th.halo, 0.35),
      dim: label(th.rest, 500, th.halo, 0.35),
      rest: label(th.rest, 500, th.halo, 1),
    };
    const keys = {};
    for (const [state, d] of Object.entries(cases)) {
      const sp = inkSplit(d);
      assert.ok(sp, `${name} ${state}: split`);
      keys[state] = lookKey(sp.shape, false, dpr);
      const lay = layBlock(sp.shape, dpr), old = blockOps(d, layBlock(d, dpr)), base = blockOps(sp.shape, lay, 1), share = blockOps(sp.shape, lay, 2);
      assert.equal(base.length, old.length); assert.equal(share.length, old.length);
      const covs = old.map((op) => coverage(op, lay.w, lay.h));
      const was = paint(old, covs, lay.w, lay.h), B = paint(base, covs, lay.w, lay.h), M = paint(share, covs, lay.w, lay.h);
      // (The words' black at their own alpha in the first half, the outline in its cream or dark: kept as the page has it.)
      let worst = 0, inked = 0;
      for (let i = 0; i < lay.w * lay.h; i++) {
        const o = i * 4, a = d.opacity;
        for (let ch = 0; ch < 3; ch++) {
          const now = B[o + ch] / 255 + (M[o] / 255) * sp.ink[ch] + (M[o + 1] / 255) * sp.ink[3 + ch] + (M[o + 2] / 255) * sp.ink[6 + ch];
          worst = Math.max(worst, Math.abs(Math.round(now * a * 255) - Math.round((was[o + ch] / 255) * a * 255)));
        }
        worst = Math.max(worst, Math.abs(Math.round((B[o + 3] / 255) * a * 255) - Math.round((was[o + 3] / 255) * a * 255)));
        if (M[o] || M[o + 1] || M[o + 2]) inked++;
      }
      assert.ok(inked > 50, `${name} ${state}: its words are in the shares (${inked} px)`);
      assert.ok(worst <= 1, `${name} ${state}: within rounding of the old picture, worst ${worst} / 255`);
    }
    // (Unlit, dim and rest are one shape, one picture; lit is the bold name's.)
    assert.equal(keys.unlit, keys.rest); assert.equal(keys.dim, keys.rest);
    assert.notEqual(keys.lit, keys.rest);
    assert.equal(lookKey(inkSplit(label([th.term, th.term, th.term], 500, th.halo, 1)).shape, false, dpr), keys.rest, 'the term\'s colour alone is no new picture');
  }
  // (The outline's colour is the picture's: a theme change paints again, as before.)
  assert.notEqual(lookKey(inkSplit(label(THEMES.light.rest, 500, THEMES.light.halo, 1)).shape, false, 2), lookKey(inkSplit(label(THEMES.dark.rest, 500, THEMES.dark.halo, 1)).shape, false, 2));
});
