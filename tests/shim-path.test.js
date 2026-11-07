// The GPU drawer's 2D context keeps its path, clips, transform and dashes in rows that are written in place (trace-gl.js, 2 Nov 2026:
// "cut per-frame garbage in chart drawing"). These check that the rows behave as the 2D canvas's own state does: a nested path, a nested
// clip, a saved transform and a saved dash come back as they were, and a draw reads the points the path was given.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Element = class {};
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.Image = class {}; globalThis.OffscreenCanvas = class {};
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
globalThis.document = { createElement: () => ({ style: {}, getContext: () => null, addEventListener() {}, setAttribute() {} }), documentElement: { style: {}, dataset: {}, getAttribute() { return null; } }, addEventListener() {}, readyState: 'complete', hidden: false, fonts: { addEventListener() {}, ready: Promise.resolve() }, head: { append() {} } };
globalThis.location = { search: '' };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const { createShim } = await import('../src/ui/trace-gl.js');

// The drawer, recording what it is asked to draw: a poly as its pieces (arrays of numbers), a line as its points and options.
const recorder = () => {
  const log = [];
  const G = {
    box: (...a) => log.push({ box: a }),
    text: (...a) => log.push({ text: a }),
    measure: (s) => s.length * 6,
    clip: (r) => log.push({ clip: r ? Array.from(r) : null }),
    keep: (n, sig, f) => { f(); return true; },
    image() {},
    end: () => true,
    poly(b, st, p0, p1, end, style, alpha) {
      const pieces = [];
      for (let q = p0; q < p1; q++) { const e = q + 1 < p1 ? st[q + 1] : end; if (e - st[q] >= 6) pieces.push(Array.from(b.subarray(st[q], e))); }
      log.push({ poly: pieces, style: typeof style === 'string' ? style : { grad: style.grad ? Array.from(style.grad) : null, stops: Array.from(style.offs.subarray(0, style.n)) }, alpha });
    },
    line(xs, ys, n, style, w, o) {
      log.push({ line: Array.from(xs.subarray(0, n), (x, i) => [x, ys[i]]), w, dash: o.dash ? Array.from(o.dash).slice(0, o.dashN) : null, offset: o.offset, round: o.round, alpha: o.alpha });
    },
    clipPaths(cl, count) {
      const out = [];
      for (let i = 0; i < count; i++) {
        const p0 = i ? cl.ep[i - 1] : 0, p1 = cl.ep[i], pieces = [];
        for (let q = p0; q < p1; q++) pieces.push(Array.from(cl.b.subarray(cl.st[q], q + 1 < p1 ? cl.st[q + 1] : cl.en[i])));
        out.push(pieces);
      }
      log.push({ clipPaths: out });
    },
  };
  return { G, log, ctx: createShim(G).reset(1) };
};
const GRAD = (ctx) => { const g = ctx.createLinearGradient(0, 0, 10, 0); g.addColorStop(0, '#f00'); g.addColorStop(1, '#00f'); return g; };

test('a rectangle filled in the middle of a path leaves the path as it was', () => {
  const { ctx, log } = recorder();
  ctx.fillStyle = GRAD(ctx);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.lineTo(10, 10);
  ctx.fillRect(100, 100, 5, 5);
  ctx.lineTo(0, 10); ctx.fill();
  assert.deepEqual(log[0].poly, [[100, 100, 105, 100, 105, 105, 100, 105, 100, 100]]);
  assert.deepEqual(log[1].poly, [[0, 0, 10, 0, 10, 10, 0, 10]]);
});

test('a drawing kept as a picture makes its own path and the outer path stays', () => {
  const { ctx, log } = recorder();
  ctx.fillStyle = GRAD(ctx);
  ctx.beginPath(); ctx.moveTo(1, 1); ctx.lineTo(2, 2); ctx.lineTo(3, 1);
  ctx.keep('layer', 'sig', () => {
    ctx.beginPath(); ctx.moveTo(50, 50); ctx.lineTo(60, 50); ctx.lineTo(60, 60); ctx.fill();
    ctx.beginPath(); ctx.moveTo(70, 70); ctx.lineTo(80, 70); ctx.lineTo(80, 80); ctx.fill();
  });
  ctx.fill();
  assert.deepEqual(log.map((e) => e.poly), [[[50, 50, 60, 50, 60, 60]], [[70, 70, 80, 70, 80, 80]], [[1, 1, 2, 2, 3, 1]]]);
});

test('a path of several pieces, a closed one and an arc come out as the 2D canvas builds them', () => {
  const { ctx, log } = recorder();
  ctx.strokeStyle = '#123456';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, 0); ctx.lineTo(4, 4); ctx.closePath(); ctx.lineTo(9, 9);
  ctx.moveTo(20, 20); ctx.lineTo(21, 21);
  ctx.moveTo(30, 30);   // (a lone point draws nothing)
  ctx.stroke();
  const pts = log[0].line.filter((p) => !Number.isNaN(p[0]));
  assert.deepEqual(pts, [[0, 0], [4, 0], [4, 4], [0, 0], [0, 0], [9, 9], [20, 20], [21, 21]]);
  assert.equal(log[0].line.filter((p) => Number.isNaN(p[0])).length, 3, 'a break after each piece worth drawing');
  const b = recorder();
  b.ctx.fillStyle = GRAD(b.ctx);
  b.ctx.beginPath(); b.ctx.arc(10, 10, 5, 0, 1);   // (not a whole circle: a piece, not a shape)
  b.ctx.fill();
  assert.ok(b.log[0].poly[0].length >= 6 && Math.abs(b.log[0].poly[0][0] - 15) < 1e-9);
});

test('whole shapes fill as boxes, and a stroke of dashes is the dashes scaled by the transform', () => {
  const { ctx, log } = recorder();
  ctx.fillStyle = '#abcdef';
  ctx.beginPath(); ctx.roundRect(5, 6, 20, 10, 3); ctx.fill();
  assert.deepEqual(log[0].box, [5, 6, 20, 10, 3, '#abcdef', null, 0, 1]);
  ctx.save(); ctx.scale(2, 2); ctx.setLineDash([4, 3]); ctx.lineDashOffset = 1; ctx.strokeStyle = '#000';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();
  assert.deepEqual([log[1].dash, log[1].offset, log[1].line[0]], [[8, 6], 2, [0, 0]]);
  ctx.setLineDash([5]);
  ctx.stroke();
  assert.deepEqual(log[2].dash, [10, 10], 'an odd list is read twice over');
  ctx.restore();
  ctx.stroke();
  assert.equal(log[3].dash, null, 'the saved state had no dashes');
});

test('the transform composes as the 2D canvas composes it and is given back by restore', () => {
  const { ctx } = recorder();
  ctx.translate(10, 20); ctx.save(); ctx.scale(2, 3); ctx.translate(1, 1);
  const t = ctx.getTransform();
  assert.deepEqual([t.a, t.b, t.c, t.d, t.e, t.f], [2, 0, 0, 3, 12, 23]);
  ctx.restore();
  const u = ctx.getTransform();
  assert.deepEqual([u.a, u.d, u.e, u.f], [1, 1, 10, 20]);
  ctx.setTransform();
  assert.deepEqual([ctx.getTransform().e, ctx.getTransform().f], [0, 0]);
});

test('a clip by a path nests with save and restore, and a clip by a rectangle is the scissor alone', () => {
  const { ctx, log } = recorder();
  ctx.beginPath(); ctx.rect(0, 0, 50, 40); ctx.clip();
  assert.deepEqual(log.map((e) => Object.keys(e)[0]), ['clip'], 'a rectangle: the scissor, no stencil path');
  ctx.save();
  ctx.beginPath(); ctx.arc(20, 20, 10, 0, 2); ctx.lineTo(20, 20); ctx.clip();
  const first = log.filter((e) => e.clipPaths);
  assert.equal(first.length, 1);
  assert.equal(first[0].clipPaths.length, 1);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30, 0); ctx.lineTo(30, 30); ctx.clip();
  assert.equal(log.filter((e) => e.clipPaths).at(-1).clipPaths.length, 2, 'two paths now');
  assert.deepEqual(log.filter((e) => e.clipPaths).at(-1).clipPaths[1], [[0, 0, 30, 0, 30, 30]]);
  ctx.restore();
  assert.equal(log.filter((e) => e.clipPaths).at(-1).clipPaths.length, 1, 'back to the first');
  assert.deepEqual(log.filter((e) => e.clipPaths).at(-1).clipPaths[0], first[0].clipPaths[0], 'the first path is as it was');
  ctx.restore();
  assert.equal(log.filter((e) => e.clipPaths).at(-1).clipPaths.length, 0, 'and none');
});

test('letter spacing is added after every character, a surrogate pair counting once', () => {
  const { ctx } = recorder();
  assert.equal(ctx.measureText('abc').width, 18);
  ctx.letterSpacing = '2px';
  // (the stub measures 6 px for every code unit: a letter, a pair and a letter are 4 units and 3 characters)
  assert.equal(ctx.measureText('a\u{1F600}b').width, 4 * 6 + 3 * 2);
});

test('gradients are handed round: two in one frame are two, a frame after the reset reuses them rewritten', () => {
  const { ctx, log } = recorder();
  const a = ctx.createLinearGradient(0, 0, 10, 0); a.addColorStop(0, '#f00'); a.addColorStop(1, '#00f');
  const b = ctx.createLinearGradient(0, 0, 10, 0); b.addColorStop(0, '#0f0');
  assert.notEqual(a, b, 'two asked for in one frame are two');
  ctx.fillStyle = a; ctx.fillRect(0, 0, 4, 4); ctx.fillStyle = b; ctx.fillRect(0, 0, 4, 4);
  assert.deepEqual([log[0].style.stops, log[1].style.stops], [[0, 1], [0]], 'each keeps its own stops');
  ctx.reset(1);
  const c = ctx.createRadialGradient(1, 2, 3, 4, 5, 6); c.addColorStop(0.25, '#fff');
  assert.equal(c, a, 'the first of the next frame is the first of the last');
  ctx.fillStyle = c; ctx.fillRect(0, 0, 4, 4);
  assert.deepEqual([log[2].style.stops, log[2].style.grad], [[0.25], null], 'rewritten: one stop, a circle not a line');
  for (let i = 0; i < 20; i++) c.addColorStop(i / 20, '#000');
  assert.equal(c.n, 16, 'a gradient holds at most the 16 stops the drawer reads');
});
