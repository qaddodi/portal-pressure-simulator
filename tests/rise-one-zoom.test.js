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

test('no way into the anatomy from the lobule stops at the fit unless the fit is where it is going', () => {
  // Every call of toAnatomy with no framing lands on the whole figure. Each is listed with why that is right; a new one must be argued here.
  const files = ['presenter.js', 'presenter-case.js', 'presenter-lapse.js', 'presenter-proc.js'];
  const calls = [];
  for (const f of files) {
    const src = readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/toAnatomy\(([^,)]*)/g)) calls.push(`${f}: ${m[1].trim()}`);
  }
  const nullCalls = calls.filter((c) => /: null$/.test(c)).map((c) => c.split(':')[0]).sort();
  assert.deepEqual(nullCalls, [
    'presenter-case.js',   // the case card shows the whole patient: the fit is where it goes
    'presenter-lapse.js',  // cathTo: the rise already landed on its first shot (cathRise); here the lobule is no longer open
    'presenter-proc.js',   // a procedure's slide: its own slide camera (riseFor) lands first; the procedure's shot is its own move after it
  ]);
});
