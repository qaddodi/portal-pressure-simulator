// Leaving the lobule is ONE zoom, from where the camera is to where the next slide frames, never out to the whole figure first and then in again
// (Mohammad, 18 Nov 2026, HVPG slide 5 to 6: "when we zoom out of the lobule, I want to just zoom back out to the view of the catheter; it seems that it
// zooms out to fit first then zooms in again. We have to be able to zoom from anywhere to anywhere between views.")
// Cause: the way out of the lobule (presenter toAnatomy) lands on the next slide's framing only when it is told that framing (stage.riseTo). A catheter slide
// was never told: its camera is the catheter's own (cathFocus), made after the figure was whole again, so the rise ended on the fit and the catheter then zoomed in.
// Code only: nobody has looked on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cathFirstShot, cathLegs } from '../src/ui/cath-arrival.js';
import { ENDO, GRAFTS, MEASURES, PLUGS, PROCS, procFirstShot, procFrame, specOf } from '../src/ui/proc-anim.js';
import { presenterSource, } from './split-src.js';
import { stageSource } from './stage-src.js';

test('the first shot of a catheter step is the one its slide opens with', () => {
  // put back in place after the dive: the tip close up, no route
  assert.deepEqual(cathFirstShot('result', { resume: true }), { leg: 'tip', near: false, both: true });
  assert.deepEqual(cathFirstShot('wedge', { resume: true }), { leg: 'tip', near: false, both: true });
  // Next from nothing: the catheter comes in along the route, the view near and following it
  for (const m of ['route', 'free', 'wedge', 'result', 'blocked']) assert.deepEqual(cathFirstShot(m, { u: 0 }), { leg: 'route', near: true, both: false }, m);
  // already in (the catheter kept from the slide before): the tip, or the route as it is for the route step
  assert.deepEqual(cathFirstShot('wedge', { u: 1 }), { leg: 'tip', near: false, both: true });
  assert.deepEqual(cathFirstShot('route', { u: 1 }), { leg: 'route', near: false, both: false });
  // Back or a jump: one glide to where Next would leave it
  for (const m of ['free', 'wedge', 'result', 'blocked']) assert.deepEqual(cathFirstShot(m, { instant: true }), { leg: 'tip', near: false, both: true }, m);
  assert.deepEqual(cathFirstShot('route', { instant: true }), { leg: 'route', near: false, both: false });
  // and it is always the first of cathTo's own legs, so the camera that follows it has nowhere further to go
  for (const m of ['route', 'free', 'wedge', 'result', 'blocked']) for (const instant of [false, true]) for (const u of [0, 1]) {
    assert.equal(cathFirstShot(m, { instant, u }).leg, cathLegs(m, u, instant)[0], `${m} ${instant} ${u}`);
  }
});

test('the way out of the lobule for a catheter slide lands on the catheter shot, in both places the presenter leaves the lobule', () => {
  const pres = presenterSource();
  assert.match(pres, /ct \? cathRise\(ct, cathInstant\(to, lastAt\), lastAt\) : null/, 'a catheter slide tells the rise where its camera goes');
  // one place turns the rise into the stage's ask, for the lobule's way out and the sinusoid's alike, a box or a view
  assert.equal((pres.match(/riseOn\(next\)/g) || []).length, 2, 'the sinusoid and the lobule both land on it');
  assert.match(pres, /next\.vt \? stage\.riseToVT\(next\.vt\) : stage\.riseTo\(next\.box/);
  assert.ok(!/stage\.riseTo\(next\.box[^\n]*\n[^\n]*stage\.exitSinusoid/.test(pres));
});

test('the stage lands the rise on a view the presenter measured, and measures a catheter shot without moving', () => {
  const src = stageSource();
  assert.match(src, /function riseToVT\(fn\) \{ live\.riseBox = fn \? \{ vt: fn \} : null;/);
  assert.match(src, /if \(r\.vt\) return r\.vt\(\) \|\| null;/, 'riseVT answers the measured view, or null (the fit) when there is no route yet');
  assert.match(src, /cathShot\(mode, opt\) \{[^\n]*aimView\(\(\) => \{ ok = cathFocus\(mode, 0, opt\); \}\)/, 'cathShot asks cathFocus where it would go, aimed, not moved');
  assert.match(src, /if \(!had\) cath\.saved = null;/, 'the aimed shot does not leave a view to go back to');
});

test('every procedure that starts from the lobule lands the rise on its own first shot', () => {
  let n = 0;
  for (const kind of [...Object.keys(PROCS), ...Object.keys(MEASURES), ...Object.keys(GRAFTS), ...Object.keys(ENDO), ...Object.keys(PLUGS)]) {
    const P = specOf(kind), f = procFirstShot(kind);
    if (P.graft) { assert.equal(f, null, `${kind}: a graft has no camera shot`); continue; }
    const first = procFrame(kind, 0).shot;
    if (!first) { assert.equal(f, null, kind); continue; }
    n++;
    assert.equal(f.shot, first, `${kind}: the rise lands on the shot the run opens with`);
    assert.equal(f.route, P.route || kind, `${kind}: on its own route, not the HVPG catheter's`);
    assert.ok(f.opt && typeof f.opt === 'object', kind);
  }
  assert.ok(n >= 10, 'the procedures and measurements were found');
  const proc = readFileSync(new URL('../src/ui/presenter-proc.js', import.meta.url), 'utf8');
  assert.match(proc, /await toAnatomy\(procRise\(kind\), \(\) => !mine\(\)\)/);
  assert.match(proc, /stage\.cathShot\?\.\(f\.shot, \{ \.\.\.f\.opt, route: f\.route \}\)/);
  const cath = readFileSync(new URL('../src/ui/stage-cath.js', import.meta.url), 'utf8');
  assert.match(cath, /function cathRoute\(over = ''\) \{\s*\n\s*const kind = over \|\| cath\.st\?\.route/);
  assert.match(cath, /const r = cathRoute\(route\);\s*\n\s*if \(mode === 'home'\)/);
});

test('no way out of the lobule stops at the fit unless the fit is where it is going', () => {
  // A call of toAnatomy with no framing lands on the whole figure. The only two left are argued here; a new one fails until it is.
  const files = ['presenter.js', 'presenter-case.js', 'presenter-lapse.js', 'presenter-proc.js'];
  const nullCalls = [];
  for (const f of files) {
    const src = readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/toAnatomy\(null/g)) nullCalls.push(f);
  }
  assert.deepEqual(nullCalls.sort(), [
    'presenter-case.js',   // a case card shows the whole patient: the fit is the destination
    'presenter-lapse.js',  // cathTo: the rise already landed on its first shot (cathRise); the lobule is no longer open here
  ]);
  // and in the presenter every other way out passes a framing: a slide's own (riseFor), a catheter slide's (cathRise), or none only where the slide's view is not the anatomy
  // (the Circuit: the figure is redrawn, the change between the views carries the camera, stage.js circGo)
  const pres = presenterSource();
  assert.match(pres, /toAnatomy\(inAnatomy \? riseFor\(cam, fv\) : ct \? cathRise\(ct, cathInstant\(to, lastAt\), lastAt\) : null, cut\)/);
  assert.match(pres, /toAnatomy\(v === 'anatomic' \? riseFor\(cam, s\) : null, cut, viaRise \? 'circuit' : 'anatomy'\)/);
});

test('out of the lobule into a Circuit slide is one move: the Circuit begins as the rise nears its end, framed on the slide\'s own region', () => {
  const pres = presenterSource(), stage = stageSource();
  // the slide's own camera does it (cards in first, then the rise and the change together), not the transition's sequential rise to the whole anatomy
  assert.match(pres, /const inView = inAnatomy \|\| \(!ct && !!cam && !LOBULE_CAM\.test\(cam\) && s\.view === 'circuit'\);/);
  assert.match(pres, /\(!inView \|\| si !== shownState \|\| liveOff\)/);
  assert.match(pres, /const viaRise = v === 'circuit' && ms > 0 && store\.get\(\)\.lobule && !store\.get\(\)\.sinusoid;/);
  assert.match(pres, /if \(to === 'circuit'\) \{ stage\.circuitEarly\?\.\(true\); setViewKey\('circuit'\); await until\(\(\) => cut\(\) \|\| stage\.morphTargetNow\?\.\(\) === 1, 6000\); return; \}/);
  // the framing is asked of the running change (a retarget), never a glide after it: switching stays true, the view key is only written when it differs
  assert.match(pres, /const switching = viaRise \|\| store\.get\(\)\.view !== v;\s*\n\s*if \(store\.get\(\)\.view !== v\) setViewKey/);
  // the stage lets only that ask begin early, from RISE_CIRC_T of the rise, and only once
  assert.match(stage, /const RISE_CIRC_T = 0\.3;/);
  assert.match(stage, /diveT > \(diveOut && circEarly \? RISE_CIRC_T : 0\)/);
  assert.match(stage, /if \(circWait && !on && circEarly && e <= RISE_CIRC_T\) nextFrame\(circGo\)/);
  assert.match(stage, /circEarly = false;\s*\/\/ \(asked for once/);
});
