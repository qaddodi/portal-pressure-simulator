// The view switch's pieces (stage-morph.js createMorph, R1, 10 Nov 2026): when they are made, what makes them again, and how a slice of
// the making is cut. createMorph is built here from a small fake stage (two vessels, a worker that answers at once, a GPU that records
// the sets it is given) on a fake clock, and the real frame scheduler (frame.js) runs the may tasks, so what is judged is what the
// module does and exports, never its text (rule PR-02).
import test from 'node:test';
import assert from 'node:assert/strict';

const clock = { T: 1000 };
const timers = new Map();
let tid = 1, order = 0, asked = [];
globalThis.Worker ??= class {};   // (the pieces are made only where there is a worker; this one is never asked: the fake stage's sweepBin answers)
Object.defineProperty(performance, 'now', { value: () => clock.T, configurable: true });
globalThis.setTimeout = (fn, ms, ...a) => { const id = tid++; timers.set(id, { fn, at: clock.T + Math.max(0, ms || 0), a, o: order++ }); return id; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
globalThis.requestAnimationFrame = (cb) => { asked.push(cb); return asked.length; };
globalThis.cancelAnimationFrame = () => {};
function runTimers(until) {
  for (;;) {
    let best = null;
    for (const [id, t] of timers) if (t.at <= until && (!best || t.at < best[1].at || (t.at === best[1].at && t.o < best[1].o))) best = [id, t];
    if (!best) return;
    const [id, t] = best;
    timers.delete(id);
    clock.T = Math.max(clock.T, t.at);
    t.fn(...t.a);
  }
}
// One display frame: the clock moves on, due timers run, then the frame asked for (the scheduler's), then promises are let through.
async function frame(dt = 16.7) {
  const end = clock.T + dt;
  runTimers(end);
  clock.T = Math.max(clock.T, end);
  const run = asked; asked = [];
  for (const cb of run) cb(clock.T);
  await new Promise((r) => setImmediate(r));
}
async function frames(ms) { const end = clock.T + ms; while (clock.T < end) await frame(); }

const { installDomStub } = await import('../scripts/warm/dom-stub.mjs');
installDomStub();
const { createMorph } = await import('../src/ui/stage-morph.js');
const { cancelMay } = await import('../src/ui/frame.js');
const { newJoinStore } = await import('../src/ui/vein-joins.js');
void newJoinStore;

const N_SAMPLES = 4;
/** A fake stage: two vessels, joins that cost `cost.joins` ms a pass, a worker that answers at once, and a GPU that makes a set in `cost.set` ms. */
function boot(cost = { joins: 0, set: 0 }) {
  const mk = (id, row) => ({ e: { id, kind: 'vein' }, row, width: 2, isArt: false, ghost: false, strands: [], feeders: [], cbr: null });
  const EV = [mk('a', 0), mk('b', 1)];
  const geo = { a: { cur: true, wig: 0, spr: 1 }, b: { cur: true, wig: 0, spr: 1 } };
  const shown = { a: true, b: true };
  const log = { sets: [], sweeps: [], units: 0 };
  const veins = {
    lost: false, useMorphSet() {}, dropMorphSet() {},
    // (vesselAt writes t into a vessel's points: the stretch a binning is for, in b.t0)
    makeMorphSet(b) { clock.T += cost.set; log.sets.push(b.t0 / 100); return { owner: veins, t0: b.t0 }; },
  };
  const live = {
    F: {}, morph: 0, morphTarget: 0, lobuleOn: false, rotU: 0, rotTarget: 0, coilEasing: false, veins, using: null,
    easeInOut: (t) => t, glStraight: null, glRadDirty: null, glStore: null, vBinReach: new Map(), binShown: null, bendShown: null, lenOfArc: null,
    smoothRunOn: () => new Map(),
    sweepBin: (msg) => { log.sweeps.push(msg.tubes[0].path[0][0][0]); return Promise.resolve({ rows: 2, entRows: 1, posBase: 1, joinBase: 1, t0: msg.tubes[0].path[0][0][0] }); },
  };
  const st = {
    BLOOD_PAD: 2, EV, GL_ROWS: 2, N_SAMPLES, cavaAsOne: (items) => items, cbAt: () => [], geo, itemRadii: () => [0, () => 1], reachOf: () => 12, strandAt: () => [],
    veinJoins: () => { clock.T += cost.joins; log.units++; return []; },
    vesselAt: (x, t) => ({ pts: Array.from({ length: N_SAMPLES }, (_, i) => [t * 100 + i, x.row * 50 + i]) }),
    edgeVisible: (x) => shown[x.e.id],
    wrap: { classList: { contains: (c) => c === 'gl-on' } },
  };
  const m = createMorph(st, live);
  m.mt.reach = [new Map(), new Map()];
  return { m, live, geo, shown, log, veins };
}
const ready = (m) => (m.mt.pieces || []).filter((pc) => pc.set).length;
const builds = (m) => m.mt.stats.builds;

test('the first build starts in the frame after the first binning, not 400 ms later, and makes all six pieces', async () => {
  const { m } = boot();
  const t0 = clock.T;
  m.morphTrackSoon();
  await frames(100);
  assert.equal(builds(m), 1, 'a build began');
  assert.ok(m.mt.stats.restart.at - t0 < 60, `it began ${m.mt.stats.restart.at - t0} ms after the binning`);
  assert.equal(m.mt.stats.restart.reason, 'first build');
  await frames(4000);
  assert.equal(ready(m), 6, 'six pieces made');
  assert.equal(m.mt.stats.last.reason, 'first build');
  assert.ok(m.mt.stats.last.wallMs > 0 && m.mt.stats.last.slices > 0 && m.mt.stats.last.bad === 0);
  assert.equal(builds(m), 1, 'and none made again');
  cancelMay('view-switch pieces');
});

test('a turn or a coil on its way does not restart the build; one that settles at a new shape or a vessel shown does', async () => {
  const { m, live, geo, shown } = boot();
  m.morphTrackSoon();
  await frames(4000);
  assert.equal(ready(m), 6);
  const key = () => `${builds(m)} ${m.mt.stats.restart.reason}`;
  const poke = async () => { m.morphTrackSoon(); await frames(2500); };
  // The Circuit's turn eases (rotU moves, rotTarget stays) and comes back: nothing is made again.
  live.rotU = 0.4; await poke(); live.rotU = 0.8; await poke(); live.rotU = 0; await poke();
  assert.equal(builds(m), 1, `rotU easing alone: ${key()}`);
  // A turn on its way to a new target is not judged until it lands; landed, it is a new geometry.
  live.rotTarget = 1; live.rotU = 0.5; await poke();
  assert.equal(builds(m), 1, 'a turn under way is not built for');
  live.rotU = 1; await poke();
  assert.equal(builds(m), 2, key());
  assert.match(m.mt.stats.restart.reason, /Circuit turn/);
  await frames(4000);
  assert.equal(ready(m), 6);
  // A coil easing (any value on the way, even a new one) waits; one that returns to the shape the pieces were made for costs nothing.
  live.coilEasing = true; geo.a.wig = 1.2; await poke(); geo.a.wig = 3.4; await poke();
  assert.equal(builds(m), 2, `coil easing: ${key()}`);
  live.coilEasing = false; geo.a.wig = 0; await poke();
  assert.equal(builds(m), 2, `a coil that came back: ${key()}`);
  // Settled at another shape: made again.
  geo.a.wig = 3.4; await poke();
  assert.equal(builds(m), 3, key());
  assert.match(m.mt.stats.restart.reason, /coil shape/);
  await frames(4000);
  // A vessel shown or hidden at the ends of the change is a real change, even while a coil is easing.
  live.coilEasing = true; shown.b = false; await poke();
  assert.equal(builds(m), 4, key());
  assert.match(m.mt.stats.restart.reason, /vessels shown/);
  await frames(4000);
  assert.equal(ready(m), 6);
  cancelMay('view-switch pieces');
});

test('the first build waits a moment for a coil easing at load, but not for ever', async () => {
  const { m, live } = boot();
  live.coilEasing = true;
  m.morphTrackSoon();
  await frames(1500);
  assert.equal(builds(m), 0, 'waiting for the coil');
  await frames(2500);
  assert.equal(builds(m), 1, 'then built anyway');
  assert.equal(m.mt.stats.restart.reason, 'first build');
  cancelMay('view-switch pieces');
});

test('a slice is cut inside 8 ms from units that are small; a unit that cannot be cut is counted as a slice over', async () => {
  const { m, log } = boot({ joins: 1.5, set: 20 });
  m.morphTrackSoon();
  await frames(8000);
  assert.equal(ready(m), 6);
  const last = m.mt.stats.last, units = Object.values(m.mt.stats.units).reduce((n, u) => n + u.n, 0);
  assert.ok(last.slices < units, `${units} units in ${last.slices} slices: several share one`);
  assert.equal(m.mt.stats.over, 6, 'only the six uploads (20 ms each) are over');
  assert.ok(last.longestMs >= 20 && last.longestMs < 30);
  assert.ok(log.units > 0);
  for (const [k, u] of Object.entries(m.mt.stats.units)) if (k !== 'upload') assert.ok(u.max < 8, `${k} unit ${u.max} ms`);
  cancelMay('view-switch pieces');
});

test('a change between the views under way makes the stretch it is crossing first, then those ahead of it', async () => {
  const { m, live, log } = boot({ joins: 1.5, set: 0 });
  m.morphTrackSoon();
  await frames(34);          // the build has begun (the first stretch is part made)
  assert.equal(builds(m), 1);
  live.morph = 0.9; live.morphTarget = 1;   // the person taps Circuit; the change is in its last sixth
  await frames(7000);
  assert.ok(Math.abs(log.sets[0] - 5 / 6) < 1e-9, `first set made is the last stretch (${log.sets[0]})`);
  assert.equal(ready(m), 6);
  // Going back (eased 0.4: the third stretch, travelling down) it is the same: those behind the travel come last.
  const second = boot({ joins: 1.5, set: 0 });
  second.m.morphTrackSoon();
  await frames(34);
  second.live.morph = 0.4; second.live.morphTarget = 0;
  await frames(7000);
  assert.ok(Math.abs(second.log.sets[0] - 1 / 3) < 1e-9, `first set made is the one it is in (${second.log.sets[0]})`);
  assert.deepEqual(second.log.sets.slice(0, 3).map((t) => Math.round(t * 6)), [2, 1, 0]);
  cancelMay('view-switch pieces');
});
