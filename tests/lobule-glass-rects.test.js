import { test } from 'node:test';
import assert from 'node:assert/strict';

// The stage's vessel canvas keeps no picture of its own (120 fps addendum §7; on by default since 31 Oct, recs A3): it is made
// without preserveDrawingBuffer, and the picture the frames repaint in part is kept in a texture of the renderer's own, copied whole
// onto the canvas whenever it is drawn on. A renderer that is neither the stage's nor the lobule's keeps its canvas's picture itself.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

function fakeGL() {
  const calls = [], enums = new Map();
  let nextObj = 1;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls };
}
async function renderer(url, who) {
  const mod = await import(url);
  const f = fakeGL();
  let attrs = null;
  const canvas = { width: 800, height: 600, getContext: (_, a) => { attrs = a; return f.gl; }, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, ...(who ? { who } : {}) });
  const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(mod.MAX_TIERS).fill(1), tierGroup: Array(mod.MAX_TIERS).fill(1) };
  return { g, f, attrs, canvas, look };
}

// Lobule lag rec 8 (6 Nov 2026): the glass over the lobule blurs again only the parts of the canvas its pictures reached. The lobule's picture
// has the tissue drawn under it (an `under` host), which used to make every one of its pictures unknown to the glass: now a host that numbers its
// pictures (under.ver) lets a part of the picture drawn again be known, so long as the tissue under it is the one seen at the last counted picture.
const M = [1, 0, 0, 1, 0, 0];
async function lobuleWith(under) {
  const r = await renderer('../src/ui/veins-gl.js', 'lobule');
  if (under) r.g.top.under(under);
  r.g.draw(M, r.look, { on: false });
  r.g.composite(r.look, { on: true });
  return r;
}
const again = (r) => { r.g.setRadii(0, new Float32Array(32).fill(3 + (r.n = (r.n || 0) + 1))); r.g.composite(r.look, { on: true }); };

test('a lobule picture drawn again over the same tissue has known tiles for the glass', async () => {
  const r = await lobuleWith({ on: () => true, draw() {}, ver: () => 1 });
  const s = r.g.drawSeq;
  again(r);
  assert.equal(r.g.drawSeq, s + 1, 'the picture was counted');
  assert.ok(r.g.pictureDirtyRects(s, s + 1, [], []) >= 0, 'known: a part of the picture');
});

test('a lobule picture drawn after the tissue was drawn again is unknown, and so is the one after it', async () => {
  let ver = 1;
  const r = await lobuleWith({ on: () => true, draw() {}, ver: () => ver });
  const s = r.g.drawSeq;
  ver = 2;
  again(r);
  assert.equal(r.g.pictureDirtyRects(s, s + 1, [], []), -1, 'the tissue moved: the canvas may differ anywhere');
  again(r);
  assert.equal(r.g.pictureDirtyRects(s, s + 2, [], []), -1, 'a range with an unknown picture in it is unknown');
});

test('an under host with no picture number keeps its pictures unknown, as before', async () => {
  const r = await lobuleWith({ on: () => true, draw() {} });
  const s = r.g.drawSeq;
  again(r);
  assert.equal(r.g.pictureDirtyRects(s, s + 1, [], []), -1);
});

// The number the glass keys the lobule on, and its question about the pictures between two of them (src/ui/lobule-glass-seq.js).
// (7 Nov 2026: every lobule picture is a new number at once (it was held for 80 ms, and the frost over a lobule that moved stepped), and the
// open sinusoid's pictures, which no count the glass read took in, turn the epoch over.)
test('the glass is told every new lobule picture at once, as a number, and asked about it by the lobule\'s tiles in one epoch', async () => {
  const { createLzGlassSeq, LZ_V } = await import('../src/ui/lobule-glass-seq.js');
  let seq = 5, plain = true, fig = 3, asked = [];
  const lz = { drawSeq: () => seq, plain: () => plain, pictureRects: (a, b) => { asked.push([a, b]); return 2; } };
  const veins = { drawSeq: 0, pictureDirtyRects: (a, b) => { asked.push(['fig', a, b]); return 1; } };
  veins.drawSeq = fig;
  const s = createLzGlassSeq({ lz: () => lz, veins: () => veins });
  const n0 = s.seq();
  assert.ok(Number.isFinite(n0) && n0 >= LZ_V, 'a number in the lobule\'s range');
  seq = 6;
  const n1 = s.seq();
  assert.equal(n1, n0 + 1, 'the next picture: the next number, at once');
  assert.equal(s.rects(n0, n1, [], []), 2, 'its tiles asked of the lobule');
  assert.deepEqual(asked.pop(), [n0 - LZ_V, n1 - LZ_V].map((x) => x % 1e9));
  // A hand: the lobule is not plain, and what the glass saw before is not known against what it sees after.
  plain = false; seq = 7;
  const n2 = s.seq();
  assert.equal(s.rects(n1, n2, [], []), -1, 'across a turn of the epoch: not known');
  plain = true; seq = 8;
  const n3 = s.seq();
  assert.equal(s.rects(n2, n3, [], []), -1, 'and back again');
  seq = 9;
  const n4 = s.seq();
  assert.equal(s.rects(n3, n4, [], []), 2, 'then known again in the new epoch');
  // The figure itself drawn.
  veins.drawSeq = 4; seq = 10;
  const n5 = s.seq();
  assert.equal(s.rects(n4, n5, [], []), -1, 'the figure drawn: not known');
  // Across the two kinds of number: never known; the figure\'s own are asked of the figure.
  assert.equal(s.rects(10, n5, [], []), -1);
  assert.equal(s.rects(10, 12, [], []), 1);
  // The lobule\'s count began again.
  seq = 1;
  const n6 = s.seq();
  assert.ok(n6 > n5 - 1e9 && s.rects(n5, n6, [], []) === -1, 'a smaller count turns the epoch over');
});

test('the open sinusoid\'s pictures give the glass a new number, every `every` of them, and never a known range', async () => {
  const { createLzGlassSeq } = await import('../src/ui/lobule-glass-seq.js');
  let sin = -1;
  const lz = { drawSeq: () => 4, plain: () => false, sinSeq: () => sin, pictureRects: () => 0 };
  const veins = { drawSeq: 1 };
  const s = createLzGlassSeq({ lz: () => lz, veins: () => veins, every: 3 });
  const a = s.seq();
  assert.equal(s.seq(), a, 'nothing drawn: the same number, the kept blur stands');
  sin = 10;
  const b = s.seq();
  assert.notEqual(b, a, 'the sinusoid opened: a new number');
  sin = 11; assert.equal(s.seq(), b, 'one picture on: held, at the anatomy blood\'s cadence');
  sin = 12; assert.equal(s.seq(), b);
  sin = 13;
  const c = s.seq();
  assert.notEqual(c, b, 'three pictures on: a new number');
  assert.equal(s.rects(b, c, [], []), -1, 'what it drew is not known: the glass blurs all it reads');
  sin = -1;
  assert.notEqual(s.seq(), c, 'the sinusoid closed: a new number');
});

test('the figure\'s blood under a lobule not laid plain counts; under a plain one it does not', async () => {
  const { createLzGlassSeq } = await import('../src/ui/lobule-glass-seq.js');
  let plain = true;
  const lz = { drawSeq: () => 4, plain: () => plain, pictureRects: () => 0 };
  const veins = { drawSeq: 1, bloodSeq: 0 };
  const s = createLzGlassSeq({ lz: () => lz, veins: () => veins, every: 1 });
  const a = s.seq();
  veins.bloodSeq = 5;
  assert.equal(s.seq(), a, 'plain: the lobule covers the figure\'s blood');
  plain = false;
  const b = s.seq();
  veins.bloodSeq = 6;
  assert.notEqual(s.seq(), b, 'not plain: the figure\'s blood shows through, a new number');
});

test('the lobule laid differently with no new picture (a dive\'s zoom, its field, a fade) gives the glass a new number', async () => {
  // (11 Nov 2026, Mohammad, the iPad: "Watch how the tint of the card glass changes after the lobule zoom". Through the dive the frost kept the pale
  // field it had blurred as the dive set off, and stepped darker at the landing.)
  const { createLzGlassSeq } = await import('../src/ui/lobule-glass-seq.js');
  let lay = 0;
  const lz = { drawSeq: () => 4, plain: () => false, laySeq: () => lay, pictureRects: () => 0 };
  const veins = { drawSeq: 1, bloodSeq: 0 };
  const s = createLzGlassSeq({ lz: () => lz, veins: () => veins, every: 3 });
  const a = s.seq();
  assert.equal(s.seq(), a, 'laid as before: the kept blur stands');
  lay = 1;
  const b = s.seq();
  assert.notEqual(b, a, 'laid at a new scale or strength: a new number');
  assert.equal(s.rects(a, b, [], []), -1, 'and where it changed is not known: the glass blurs all it reads');
  assert.equal(s.seq(), b);
});
