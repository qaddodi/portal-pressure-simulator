// The pressure monitor takes a picture's place for one measurement and gives it back (15 Nov 2026, Mohammad: "the monitor should REPLACE the scope, then once the
// reading is done it fades away and scope render comes back"). The bug: the EUS-PPG's panel stayed over the scope after its run until the next run, and the PPG by
// IR's monitor stayed in the HVPG tracing's place until the HVPG was measured again; nothing closed either. One clock for both (monitor-takeover.js), and these
// checks hold every surface that plays the monitor on a card of its own to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTakeover, createSwap, HOLD_MS } from '../src/ui/monitor-takeover.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const fakeTimer = () => {
  const jobs = new Map(); let n = 0;
  return { jobs, set: (f, ms) => { jobs.set(++n, { f, ms }); return n; }, clear: (id) => { jobs.delete(id); }, fire: () => { const all = [...jobs]; jobs.clear(); for (const [, j] of all) j.f(); } };
};

test('a run holds its result, then gives the place back by itself', () => {
  const timer = fakeTimer(), seen = [];
  const tk = createTakeover({ timer, onChange: (p) => seen.push(p) });
  assert.equal(tk.phase(), 'idle'); assert.equal(tk.shown(), false);
  tk.start(); assert.equal(tk.phase(), 'run'); assert.equal(tk.shown(), true);
  tk.finish(true); assert.equal(tk.phase(), 'hold'); assert.equal(tk.shown(), true, 'the result stays up for a while');
  assert.equal(timer.jobs.size, 1); assert.equal([...timer.jobs.values()][0].ms, HOLD_MS);
  timer.fire(); assert.equal(tk.phase(), 'idle'); assert.equal(tk.shown(), false, 'and then it goes: it never stays for good');
  assert.deepEqual(seen, ['run', 'hold', 'idle']);
});

test('the result is held long enough to read and not so long that it blocks the picture', () => {
  assert.ok(HOLD_MS >= 3000 && HOLD_MS <= 10000, `${HOLD_MS} ms`);
});

test('a run that is stopped or fails gives the place back at once, with no hold', () => {
  const timer = fakeTimer(), tk = createTakeover({ timer });
  tk.start(); tk.finish(false);
  assert.equal(tk.phase(), 'idle'); assert.equal(timer.jobs.size, 0);
  tk.finish(true); assert.equal(tk.phase(), 'idle', 'a finish with nothing running holds nothing');
});

test('a tap takes a held result away sooner; it does not cut a run short', () => {
  const timer = fakeTimer(), tk = createTakeover({ timer });
  tk.start(); tk.close(); assert.equal(tk.phase(), 'run');
  tk.finish(true); tk.close(); assert.equal(tk.phase(), 'idle'); assert.equal(timer.jobs.size, 0, 'the hold timer is cleared');
});

test('a new run while a result is held starts afresh and the old timer cannot close it', () => {
  const timer = fakeTimer(), tk = createTakeover({ timer });
  tk.start(); tk.finish(true);
  tk.start(); assert.equal(tk.phase(), 'run'); assert.equal(timer.jobs.size, 0);
  timer.fire(); assert.equal(tk.phase(), 'run');
});

test('reset and dispose leave no timer behind', () => {
  const timer = fakeTimer(), tk = createTakeover({ timer });
  tk.start(); tk.finish(true); tk.reset(); assert.equal(tk.phase(), 'idle'); assert.equal(timer.jobs.size, 0);
  tk.start(); tk.finish(true); tk.dispose(); assert.equal(timer.jobs.size, 0);
  tk.start(); tk.reset(); assert.equal(tk.phase(), 'idle', 'reset also ends a run in play');
});

// A stand-in element: hidden, an animate() that finishes when the test says so.
const el = (name) => {
  const e = { name, hidden: false, anims: [], animate(kf, o) { const a = { kf, o, cancelled: false, onfinish: null, oncancel: null, cancel() { this.cancelled = true; this.oncancel?.(); } }; e.anims.push(a); return a; } };
  return e;
};
const finish = (e) => { for (const a of [...e.anims]) if (a.onfinish && !a.cancelled) { const f = a.onfinish; a.onfinish = null; f(); } };

test('the hand-over fades the leaver out, then the monitor in; nothing is hidden before its fade has run', () => {
  const base = el('trace'), over = el('mon'), sw = createSwap({ base: [base], over: [over], drawn: () => true });
  assert.equal(over.hidden, true, 'the monitor starts hidden');
  sw.set(true);
  assert.equal(base.hidden, false, 'the trace is still there while it fades');
  assert.equal(base.anims.length, 1); assert.deepEqual(base.anims[0].kf, [{ opacity: 1 }, { opacity: 0 }]);
  assert.equal(over.hidden, true);
  finish(base);
  assert.equal(base.hidden, true); assert.equal(over.hidden, false); assert.equal(sw.shown(), true);
  assert.deepEqual(over.anims[0].kf, [{ opacity: 0 }, { opacity: 1 }], 'the monitor fades in');
  sw.set(false);
  assert.equal(over.hidden, false, 'the monitor fades out before it goes');
  finish(over);
  assert.equal(over.hidden, true); assert.equal(base.hidden, false); assert.equal(sw.shown(), false, 'the trace comes back');
});

test('asked again mid-fade it finishes the fade, then goes where the last ask says: never both up, never neither', () => {
  const base = el('trace'), over = el('mon'), sw = createSwap({ base: [base], over: [over], drawn: () => true });
  sw.set(true); sw.set(false);   // (a run that starts and stops at once)
  finish(base);                  // the trace's fade-out lands: the monitor appears, and is faded out again
  assert.equal(over.hidden, false); assert.equal(base.hidden, true);
  finish(over);
  assert.equal(over.hidden, true); assert.equal(base.hidden, false);
  assert.equal(sw.shown(), false);
});

test('where nothing is on screen to fade (the card is closed) it swaps at once', () => {
  const base = el('trace'), over = el('mon'), sw = createSwap({ base: [base], over: [over], drawn: () => false });
  sw.set(true); assert.equal(base.hidden, true); assert.equal(over.hidden, false);
  sw.set(false); assert.equal(base.hidden, false); assert.equal(over.hidden, true);
});

// ── Every surface that plays the monitor on a card of its own is on the one clock ──
test('EUS-PPG: the panel is shown only while the takeover is, the scope fades with it, and no state is left for good', () => {
  const js = read('src/ui/eus-ppg.js'), css = read('styles/scope-card.css');
  assert.match(js, /createTakeover\(/); assert.match(js, /tk\.start\(\)/); assert.match(js, /tk\.finish\(d\)/); assert.match(js, /tk\.dispose\(\)/);
  assert.doesNotMatch(js, /run \? 'run' : done \? 'done' : 'idle'/, 'the panel state is the takeover phase, not "done" kept until the next run');
  assert.doesNotMatch(css, /data-state="done"/, 'no rule keeps the panel up once the reading is done');
  for (const lay of ['#app:not(.thumb) .instrument-workspace.float-ui.side', '#app.thumb .instrument-workspace']) {
    const b = `${lay} .dock-pane[data-pane="endoscopy"] > .instrument-view:not(.wall-view)`;
    assert.ok(css.includes(`${b} .eus-ppg:is([data-state="run"], [data-state="hold"]) .eus-panel { opacity: 1;`), `${lay}: the panel is up in run and hold only`);
    assert.ok(css.includes(`${b}:has(.eus-ppg:is([data-state="run"], [data-state="hold"])) .endo-stage { opacity: 0; }`), `${lay}: the scope gives way while it is`);
    assert.ok(css.includes(`${b} .endo-stage { transition: opacity`), `${lay}: and fades, not pops`);
    assert.ok(css.includes(`${b} .eus-panel {`) && /\.eus-panel \{[^}]*align-self: stretch/.test(css), `${lay}: the panel fills the picture's place`);
  }
  assert.doesNotMatch(css, /\.eus-panel \{ transition: none; \}/, 'Reduce Motion keeps the fade (a cross-fade is allowed, an instant swap is not)');
});

test("PPG by IR: its monitor hands the HVPG tracing's place back after the hold, with a fade each way", () => {
  const ir = read('src/ui/ir-ppg.js'), proc = read('src/ui/hvpg-proc.js');
  assert.match(ir, /createTakeover\(/); assert.match(ir, /tk\.finish\(d\)/); assert.match(ir, /tk\.start\(\)/);
  assert.doesNotMatch(ir, /panel\.hidden|\bset\(true\)/, 'no instant show of the monitor');
  assert.doesNotMatch(proc, /propSoon\(box, 'hidden'/, 'the HVPG tracing is not hidden at once');
  assert.match(proc, /createSwap\(\{ base: \[box\], over: \[ir\.box\]/); assert.match(proc, /trace\.set\(ir\.shown\(\)\)/);
  assert.match(proc, /foldHidden\(stepsEl, ir\.shown\(\)\)/, 'the four steps fold away and back with it');
});

test('every card that builds the monitor itself (createReading outside a slide) owns a takeover', () => {
  // (A slide's reading card is the slide's own card and goes with the slide; a measurement on a dock card takes the picture's place and must give it back.)
  const users = ['src/ui/eus-ppg.js', 'src/ui/ir-ppg.js'];
  for (const f of users) assert.match(read(f), /createTakeover\(/, `${f} plays the monitor on a card of its own`);
  for (const f of ['src/ui/instruments.js', 'src/ui/dock.js', 'src/ui/hvpg-proc.js', 'src/ui/presenter-tools.js']) assert.doesNotMatch(read(f), /createReading\(/, `${f}: a new monitor on a dock card goes through eus-ppg.js or ir-ppg.js, with a takeover`);
});
