// A picture painted on the GPU can be painted a few tiles at a time (paint-gl.js beginJob / stepJob), so no frame holds the whole of it (17 Nov 2026, the tester,
// a lobule pick that changed the tissue's state: the new bitmap painted in one frame, texUpload 743 ms on his Mac). The sliced paint covers the same picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= globalThis;
const { createPaintGL, recordPaint } = await import('../src/ui/paint-gl.js');

// A GL context that accepts every call and records the ones the painter's tiles are made of.
function stubGL() {
  const log = [];
  let id = 0;
  const count = new Map();
  const gl = new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k.length * 977 + 3;
      if (k === 'isContextLost') return () => t.lost === true;
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (k === 'getParameter') return () => 16384;
      if (k === 'getExtension') return () => null;
      if (k === 'checkFramebufferStatus') return () => 36053;
      if (k === 'getError') return () => 0;
      if (/^create/.test(k)) return () => ({ id: ++id });
      return (...a) => { count.set(k, (count.get(k) || 0) + 1); if (k === 'copyTexSubImage2D') log.push(a.slice(2)); };
    },
  });
  return { gl, log, count };
}
const picture = (w, h) => recordPaint(w, h, (c) => { c.fillStyle = '#123456'; c.fillRect(0, 0, w, h); });
const covered = (log) => { const s = new Set(); for (const [x, y, , , w, h] of log) for (let i = x; i < x + w; i += 64) for (let j = y; j < y + h; j += 64) s.add(`${i},${j}`); return s; };

test('a picture painted in slices covers the same pixels as the one painted whole, a tile at a time when the budget is spent', () => {
  const A = stubGL(), B = stubGL();
  const whole = createPaintGL(A.gl), sliced = createPaintGL(B.gl);
  const rec = picture(2700, 1900);
  assert.ok(whole.paint(rec), 'painted whole');
  const job = sliced.beginJob(rec, { tile: 512 });
  assert.ok(job, 'a job is begun');
  let steps = 0;
  while (!sliced.stepJob(job, 0)) { steps++; assert.ok(steps < 200); }
  assert.ok(!job.failed && job.out, 'the picture is whole');
  assert.equal(steps + 1, Math.ceil(2700 / 512) * Math.ceil(1900 / 512), 'a spent budget draws one tile a step (a slice always draws one)');
  assert.deepEqual([...covered(B.log)].sort(), [...covered(A.log)].sort(), 'the same pixels are copied into the picture');
  assert.equal(B.count.get('generateMipmap'), 1, 'mipmapped once, when the last tile is in');
});

test('a slice with room draws many tiles, and stepping a finished job does nothing', () => {
  const S = stubGL();
  const p = createPaintGL(S.gl);
  const job = p.beginJob(picture(2048, 2048), { tile: 512 });
  assert.equal(p.stepJob(job, Infinity), true, 'all of it in one step when the budget allows');
  assert.equal(S.log.length, 16);
  const n = S.count.get('bufferData');
  assert.equal(p.stepJob(job, Infinity), true);
  assert.equal(S.count.get('bufferData'), n, 'a finished job touches nothing');
});

test("each slice sends the shapes again, so a picture painted between two slices cannot leave the other's behind", () => {
  const S = stubGL();
  const p = createPaintGL(S.gl);
  const job = p.beginJob(picture(1500, 1500), { tile: 512 });
  p.stepJob(job, 0);
  const a = S.count.get('bufferData');
  p.stepJob(job, 0);
  assert.equal(S.count.get('bufferData') - a, 2, 'the two shape buffers, each slice');
});

test('a job given back before it is whole deletes its texture and cannot be stepped on', () => {
  const S = stubGL();
  const p = createPaintGL(S.gl);
  const job = p.beginJob(picture(2000, 2000), { tile: 512 });
  p.stepJob(job, 0);
  p.abandon(job);
  assert.equal(S.count.get('deleteTexture'), 1);
  assert.equal(p.stepJob(job, 0), true);
  assert.equal(job.out, null);
});

test('a lost context ends the job as failed, never throwing', () => {
  const S = stubGL();
  const p = createPaintGL(S.gl);
  const job = p.beginJob(picture(1500, 1500), { tile: 512 });
  p.stepJob(job, 0);
  S.gl.lost = true;
  assert.equal(p.stepJob(job, 0), true);
  assert.ok(job.failed && !job.out);
});

test('paint (the whole picture at once) is the one job run to its end, 1024 px tiles', () => {
  const S = stubGL();
  const p = createPaintGL(S.gl);
  assert.ok(p.paint(picture(2500, 1100)));
  assert.equal(S.log.length, 3 * 2, 'tiles of 1024');
});
