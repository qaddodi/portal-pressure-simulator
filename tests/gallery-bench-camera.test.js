// The Camera bench's pure parts (src/ui/gallery/benches/camera-grid.js): the move list, which call plays a move, the straight-zoom judge (the 18 Nov 2026 rule: no
// zoom-out-then-in between views), the zoom recorder, the busy test and the settle wait, and the copied report. The DOM half is not run here (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_KEYS, viewKey, setViewKey } from '../src/ui/store.js';
import { judgeStraight, moveList, moveVia, appMove, isBusy, createZoomRecorder, createSettler, reportText, resultLine, VIEWS, STRAIGHT_TOL } from '../src/ui/gallery/benches/camera-grid.js';

// A zoom path from a to b over n frames: ease in log space, plus an optional bump (log units, positive overshoots) in the middle.
const path = (a, b, n = 40, bump = 0) => Array.from({ length: n }, (_, i) => {
  const u = i / (n - 1), s = u * u * (3 - 2 * u);
  return { t: i * 16.7, z: Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * s + bump * Math.sin(Math.PI * u)) };
});

test('moveList: the 12 ordered pairs and the 4 same-view refits, every pair once', () => {
  const l = moveList();
  assert.equal(l.length, 16);
  assert.equal(l.filter((m) => m.refit).length, 4);
  assert.equal(l.filter((m) => !m.refit).length, 12);
  assert.equal(new Set(l.map((m) => m.id)).size, 16);
  assert.deepEqual(VIEWS, VIEW_KEYS);
  for (const v of VIEW_KEYS) assert.ok(l.some((m) => m.from === v && m.to === v && m.refit), `refit ${v}`);
  for (const a of VIEW_KEYS) for (const b of VIEW_KEYS) if (a !== b) assert.ok(l.some((m) => m.from === a && m.to === b && !m.refit), `${a} to ${b}`);
  assert.equal(moveList(['anatomy', 'circuit']).length, 4);
});

test('moveVia picks the call the View switch picks', () => {
  assert.equal(moveVia('anatomy', 'anatomy'), 'refit');
  assert.equal(moveVia('circuit', 'lobule'), 'diveToLobule');
  assert.equal(moveVia('sinusoid', 'lobule'), 'diveToLobule');
  assert.equal(moveVia('lobule', 'sinusoid'), 'askSinusoid');
  assert.equal(moveVia('anatomy', 'sinusoid'), 'diveToSinusoid');
  assert.equal(moveVia('circuit', 'sinusoid'), 'diveToSinusoid');
  assert.equal(moveVia('sinusoid', 'anatomy'), 'exitSinusoid');
  assert.equal(moveVia('sinusoid', 'circuit'), 'exitSinusoid:circuit');
  assert.equal(moveVia('anatomy', 'circuit'), 'setViewKey');
  assert.equal(moveVia('lobule', 'anatomy'), 'setViewKey');
  for (const a of VIEW_KEYS) for (const b of VIEW_KEYS) assert.ok(moveVia(a, b), `${a} ${b}`);
});

test('appMove calls the stage method named, and falls back to setViewKey when the stage lacks it', () => {
  const calls = [];
  const stage = { fitAgain: () => calls.push('fitAgain'), diveToLobule: () => calls.push('diveToLobule'), askSinusoid: (...a) => calls.push(`askSinusoid${a.length ? `(${a})` : ''}`), exitSinusoid: (...a) => calls.push(`exitSinusoid(${a})`), diveToSinusoid: () => calls.push('diveToSinusoid') };
  assert.equal(appMove({ stage }, 'anatomy', 'anatomy'), 'refit');
  assert.equal(appMove({ stage }, 'circuit', 'lobule'), 'diveToLobule');
  assert.equal(appMove({ stage }, 'lobule', 'sinusoid'), 'askSinusoid');
  assert.equal(appMove({ stage }, 'sinusoid', 'circuit'), 'exitSinusoid:circuit');
  assert.deepEqual(calls, ['fitAgain', 'askSinusoid(false)', 'diveToLobule', 'askSinusoid', 'exitSinusoid(circuit)']);
  const before = viewKey();
  try {
    assert.match(appMove({ stage: {} }, 'anatomy', 'lobule'), /missing/);
    assert.equal(viewKey(), 'lobule');
  } finally { setViewKey(before); }
});

test('judgeStraight: a straight zoom-in and zoom-out are straight, either direction', () => {
  for (const [a, b] of [[1, 8], [8, 1], [0.5, 0.52], [2, 40]]) {
    const j = judgeStraight(path(a, b));
    assert.equal(j.straight, true, `${a} to ${b}: ${j.text}`);
  }
  const j = judgeStraight(path(1, 8));
  assert.equal(j.text, 'straight');
  assert.ok(Math.abs(j.z0 - 1) < 1e-9 && Math.abs(j.z1 - 8) < 1e-9);
});

test('judgeStraight: a zoom-out before the zoom-in (a fit waypoint) is named, with how far it dipped', () => {
  // in from 4 to 16, but out to 1.5 on the way
  const s = [...path(4, 1.5, 20), ...path(1.5, 16, 30)];
  const j = judgeStraight(s);
  assert.equal(j.straight, false);
  assert.match(j.text, /dipped to \d+% of the lower end's zoom \(zoomed out, then in\)/);
  assert.ok(j.dip > Math.log(4 / 1.5) - 1e-6);
  assert.ok(Math.abs(j.zMin - 1.5) < 1e-6);
  // the same going out: in to a close view first, then out
  const k = judgeStraight([...path(16, 40, 20), ...path(40, 2, 30)]);
  assert.equal(k.straight, false);
  assert.match(k.text, /overshot the higher end by \d+%/);
});

test('judgeStraight: an overshoot past the end and a slide back mid-move are named', () => {
  const over = judgeStraight(path(1, 8, 40, 0.4));
  assert.equal(over.straight, false);
  assert.match(over.text, /overshot the higher end by \d+%/);
  // a stall that slips backwards 10 % half way, within the ends
  const b0 = path(1, 8, 40), s = b0.map((p, i) => (i > 15 && i < 22 ? { ...p, z: b0[15].z * 0.85 } : p));
  const slide = judgeStraight(s);
  assert.equal(slide.straight, false);
  assert.match(slide.text, /slid back \d+% against the move/);
  assert.ok(slide.dip === 0);
});

test('judgeStraight: the tolerance, a refit that does not move, too few samples, bad numbers', () => {
  const base = path(1, 8, 40), small = base.map((p, i) => (i > 15 && i < 22 ? { ...p, z: base[15].z * 0.99 } : p));   // (a plateau 1 % under the last good frame)
  assert.equal(judgeStraight(small).straight, true, 'a 1 % wobble is inside the tolerance');
  assert.equal(judgeStraight(small, 0.001).straight, false, 'and outside a tight one');
  assert.ok(STRAIGHT_TOL > 0 && STRAIGHT_TOL < 0.1);
  const flat = judgeStraight(Array.from({ length: 30 }, (_, i) => ({ t: i, z: 3 })));
  assert.equal(flat.straight, true); assert.equal(flat.flat, true); assert.match(flat.text, /flat/);
  // a refit that zooms out and back to where it began is not straight
  const refit = judgeStraight([...path(3, 1, 15), ...path(1, 3, 15)]);
  assert.equal(refit.straight, false);
  assert.equal(judgeStraight([{ t: 0, z: 2 }]).straight, null);
  assert.equal(judgeStraight([]).straight, null);
  assert.equal(judgeStraight(undefined).straight, null);
  assert.equal(judgeStraight([{ t: 0, z: NaN }, { t: 1, z: 0 }, { t: 2, z: -1 }]).straight, null);
  assert.equal(judgeStraight([{ t: 0, z: NaN }, ...path(1, 4)]).straight, true, 'a bad sample is skipped');
});

test('the zoom recorder keeps samples in order and stops at its size', () => {
  const r = createZoomRecorder(4);
  for (let i = 0; i < 6; i++) r.push(i * 10, i + 1);
  assert.equal(r.n, 4);
  assert.deepEqual(r.samples(), [{ t: 0, z: 1 }, { t: 10, z: 2 }, { t: 20, z: 3 }, { t: 30, z: 4 }]);
  r.reset(); assert.equal(r.n, 0); assert.deepEqual(r.samples(), []);
});

test('isBusy: a glide, a change, a lobule dive or glide, or a slide change is busy; a still page is not', () => {
  assert.equal(isBusy(null), false);
  assert.equal(isBusy({ stage: { gliding: () => false } }), false);
  assert.equal(isBusy({ stage: { gliding: () => true } }), true);
  assert.equal(isBusy({ stage: { gliding: () => false } }, true), true);
  assert.equal(isBusy({ stage: { gliding: () => false, lobuleSettled: () => false } }), true);
  assert.equal(isBusy({ stage: { gliding: () => false, lobuleSettled: () => true, lobuleGlide: () => true } }), true);
  assert.equal(isBusy({ stage: { gliding: () => false }, presenter: { busy: () => true } }), true);
  assert.equal(isBusy({ stage: { gliding: () => false, lobuleSettled: () => true, lobuleGlide: () => false }, presenter: { busy: () => false } }), false);
});

test('the settler resolves once the page has been still for the quiet time, and can be cancelled', async () => {
  let moving = true;
  const pps = { stage: { gliding: () => moving } };
  const s = createSettler(pps, { quietMs: 40, pollMs: 10 });
  setTimeout(() => { moving = false; }, 80);
  const r = await s.wait(2000);
  assert.equal(r.ok, true);
  assert.ok(r.ms >= 100, `waited ${r.ms}`);
  moving = true;
  const p = s.wait(2000);
  setTimeout(() => s.cancel(), 30);
  const c = await p;
  assert.equal(c.ok, false); assert.equal(c.cancelled, true);
  const t = await s.wait(60);   // still moving: runs out
  assert.equal(t.ok, false); assert.ok(!t.cancelled);
});

test('the report: a line a cell played, failures marked, a count; nothing played is just the header', () => {
  const ok = { from: 'anatomy', to: 'circuit', ms: 640.4, frames: 38, judge: judgeStraight(path(1, 2)), endedIn: 'circuit' };
  const bad = { from: 'circuit', to: 'lobule', ms: 1210, frames: 70, judge: judgeStraight([...path(4, 1.5, 20), ...path(1.5, 16, 30)]), endedIn: 'lobule' };
  const lost = { from: 'anatomy', to: 'sinusoid', ms: 0, frames: 0, noMotion: true, judge: judgeStraight([]), endedIn: 'anatomy' };
  const t = reportText(new Map([['anatomy>circuit', ok], ['circuit>lobule', bad], ['anatomy>sinusoid', lost]]), { device: 'phone', look: 'dark', when: '2026-11-18 10:00' });
  const lines = t.split('\n');
  assert.match(lines[0], /Camera moves on a phone, dark look, 2026-11-18 10:00/);
  assert.ok(lines.some((l) => /^ok\s+Anatomy to Circuit: 640 ms, 38 frames.*straight/.test(l)));
  assert.ok(lines.some((l) => /^FAIL Circuit to Lobule: .*dipped to/.test(l)));
  assert.ok(lines.some((l) => /^FAIL Anatomy to Sinusoid: no motion.*ended in anatomy, not sinusoid/.test(l)));
  assert.match(lines.at(-1), /3 played, 2 not straight or not landed/);
  assert.equal(reportText(new Map()).split('\n').length, 2);
  assert.equal(resultLine(null), 'not played');
});
