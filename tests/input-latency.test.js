import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInputLatency, describeTarget } from '../src/ui/input-latency.js';

// Input to first change (recs R2). A fake window, clock, mutation watcher and frame stand in for the browser.
function rig(opts = {}) {
  let t = 1000;
  const handlers = {}, asks = [];
  let observing = 0, onChange = null;
  const il = createInputLatency({
    now: () => t,
    listen: (type, fn) => { handlers[type] = fn; },
    watch: (cb) => { onChange = cb; return { start() { observing++; }, stop() { observing--; } }; },
    ask: (fn) => asks.push(fn),
    ignore: (n) => n === 'perf-readout',
    describe: (x) => x?.name || '',
    ...opts,
  });
  const fire = (type, e = {}) => handlers[type]({ timeStamp: t, target: { name: 'button#go' }, ...e });
  /** A frame ends at the next `ms`: the callbacks asked for run. */
  const frame = (ms) => { t += ms; const run = asks.splice(0); run.forEach((f) => f()); };
  const mutate = (target = 'x') => onChange([{ target }]);
  return { il: il.api, fire, frame, mutate, tick: (ms) => { t += ms; }, asks, observing: () => observing };
}

test('a key answered by the next frame reads the time from the key to that frame', () => {
  const { il, fire, frame, mutate, tick } = rig();
  fire('keydown', { key: 'ArrowRight' });
  tick(5); mutate();           // the page changes inside the key's handlers
  frame(11);                    // the frame that paints it
  const [e] = il.entries(0);
  assert.equal(e.kind, 'keydown');
  assert.equal(e.ms, 16);
  assert.equal(e.target, 'button#go');
  assert.equal(il.pending(), 0);
});

test("the event's own time counts: a main thread busy when the input arrived is part of the wait", () => {
  const { il, fire, frame, mutate } = rig();
  fire('click', { detail: 1, timeStamp: 940 });   // arrived at 940, handled at 1000
  mutate(); frame(20);
  assert.equal(il.entries(0)[0].ms, 80);
});

test('a missing, future or stale event time falls back to now', () => {
  const { il, fire, frame, mutate, tick } = rig();
  tick(10000);
  for (const timeStamp of [undefined, 0, -5, 99999, 5]) { fire('click', { detail: 1, timeStamp }); mutate(); frame(10); }   // (5: ten seconds old)
  assert.deepEqual(il.entries(0).map((e) => e.ms), [10, 10, 10, 10, 10]);
});

test('an input the page never answers is dropped after the wait and counted as ignored', () => {
  const { il, fire, frame } = rig();
  fire('pointerdown');
  frame(300); assert.equal(il.pending(), 1, 'still waiting');
  frame(600); assert.equal(il.pending(), 0);
  assert.equal(il.summary().n, 0);
  assert.equal(il.summary().ignored, 1);
});

test('a real click replaces the press that began it; a keyboard or script click is not stamped again', () => {
  const { il, fire, frame, mutate, tick } = rig();
  fire('pointerdown');
  tick(90);
  fire('click', { detail: 1 });   // the finger came up: the button acts now
  mutate(); frame(10);
  const all = il.entries(0);
  assert.equal(all.length, 1);
  assert.equal(all[0].kind, 'click');
  assert.equal(all[0].ms, 10, "the 90 ms the finger rested is the person's, not the page's");
  fire('keydown', { key: 'Enter' });
  fire('click', { detail: 0 });   // (what Enter on a button does after the keydown)
  mutate(); frame(8);
  assert.deepEqual(il.entries(all.at(-1).i).map((e) => e.kind), ['keydown']);
});

test('a press answered before the click keeps its own answer', () => {
  const { il, fire, frame, mutate } = rig();
  fire('pointerdown');
  mutate(); frame(12);             // answered at the press (a drag began)
  fire('click', { detail: 1 });
  mutate(); frame(9);
  assert.deepEqual(il.entries(0).map((e) => [e.kind, e.ms]), [['pointerdown', 12], ['click', 9]]);
});

test('modifier keys, Tab and key repeats are not inputs', () => {
  const { il, fire, asks } = rig();
  for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'Tab']) fire('keydown', { key });
  fire('keydown', { key: 'a', repeat: true });
  assert.equal(il.pending(), 0);
  assert.equal(asks.length, 0);
  fire('pointerdown', { isPrimary: false });
  assert.equal(il.pending(), 0, 'the second finger of a pinch');
});

test("the ?perf readout's own changes are not the page answering", () => {
  const { il, fire, frame, mutate } = rig();
  fire('keydown', { key: 'a' });
  mutate('perf-readout'); frame(10);
  assert.equal(il.pending(), 1, 'not answered by the panel writing itself');
  mutate('figure'); frame(10);
  assert.equal(il.entries(0).length, 1);
});

test('the watcher runs only while an input waits, and the scheduler is asked only while one does', () => {
  const { il, fire, frame, mutate, asks, observing } = rig();
  assert.equal(observing(), 0);
  fire('keydown', { key: 'a' });
  fire('keydown', { key: 'b' });
  assert.equal(observing(), 1, 'one watcher for both');
  assert.equal(asks.length, 1, 'one frame asked for');
  mutate(); frame(10);
  assert.equal(il.pending(), 0);
  assert.equal(observing(), 0, 'stopped once nothing waits');
  assert.equal(asks.length, 0, 'and no frame asked for again');
});

test('summary: the count, p50, p95, the worst and what it was, and the last few', () => {
  const { il, fire, frame, mutate } = rig();
  for (let i = 1; i <= 20; i++) { fire('click', { detail: 1, target: { name: i === 7 ? 'button#slow' : 'button#fast' } }); mutate(); frame(i === 7 ? 250 : 10 + i); }
  const s = il.summary();
  assert.equal(s.n, 20);
  assert.equal(s.worst, 250);
  assert.equal(s.worstWhat, 'click button#slow');
  assert.equal(s.recent.length, 10);
  assert.ok(s.p95 >= s.p50);
  assert.equal(il.slowest(1)[0].ms, 250);
  assert.equal(il.entries(18).length, 2, 'entries after a count');
});

test('only the last `keep` answers are held, and reset empties everything', () => {
  const { il, fire, frame, mutate, observing } = rig({ keep: 3 });
  for (let i = 0; i < 6; i++) { fire('keydown', { key: 'a' }); mutate(); frame(5); }
  assert.equal(il.entries(0).length, 3);
  assert.equal(il.summary().n, 6);
  fire('keydown', { key: 'a' });
  il.reset();
  assert.equal(il.pending(), 0);
  assert.equal(il.summary().n, 0);
  assert.equal(observing(), 0);
});

test('describeTarget names the control an event hit', () => {
  const el = (localName, id, cls, up) => ({ nodeType: 1, localName, id, classList: cls ? [cls] : [], closest: (sel) => (up && sel.includes('button') ? up : null) });
  const btn = el('button', 'btnMenu');
  assert.equal(describeTarget(btn), 'button#btnMenu');
  assert.equal(describeTarget(el('button', '', 'pzb-next')), 'button.pzb-next');
  assert.equal(describeTarget(el('use', '', '', btn)), 'button#btnMenu', 'a glyph inside the button');
  assert.equal(describeTarget({ nodeType: 3, parentElement: btn }), 'button#btnMenu', 'a text node');
  assert.equal(describeTarget(null), '');
});

test('describeTarget names the control around an icon, not the svg inside it, and the picture when there is no control', () => {
  // (a tree with a real `closest`: the nearest ancestor, or the element itself, that any of the selectors names)
  const chain = (...tags) => {
    let parent = null;
    return tags.map(([localName, id, role]) => {
      const n = { nodeType: 1, localName, id: id || '', classList: [], parentElement: parent, getAttribute: (a) => (a === 'role' ? role : null),
        closest(sel) { const want = sel.split(',').map((x) => x.trim()); for (let m = n; m; m = m.parentElement) if (want.some((w) => (w.startsWith('[role=') ? w.includes(`"${m.getAttribute('role')}"`) : w === m.localName))) return m; return null; } };
      parent = n; return n;
    });
  };
  const [, , use] = chain(['button', 'btnTreat'], ['svg'], ['use']);
  assert.equal(describeTarget(use), 'button#btnTreat', 'the icon of a button');
  const [, svg] = chain(['div'], ['svg', 'logo']);
  assert.equal(describeTarget(svg), 'svg#logo', 'a picture that is no control');
  const [, tab] = chain(['div'], ['div', 'tabX', 'tab']);
  assert.equal(describeTarget(tab), 'div#tabX', 'a role=tab');
  const [, canvas] = chain(['section'], ['canvas', 'veins']);
  assert.equal(describeTarget(canvas), 'canvas#veins', 'the figure');
});

test('frame.js hands the page this tracker, and the tracker asks for frames only through the scheduler', () => {
  const frameJs = readFileSync(new URL('../src/ui/frame.js', import.meta.url), 'utf8');
  assert.match(frameJs, /get inputToPaint\(\) \{ return inputMeasure\(\); \}/, 'perf().inputToPaint');
  assert.ok(!/^(const|let) inputLatency = .*addEventListener/m.test(frameJs) && /let inputLatency = null;/.test(frameJs), 'made on the first read, not at load: the glass test counts window listeners');
  assert.match(frameJs, /ask: \(fn\) => finalFrame\(fn, 'input'\)/, 'its frames come from the scheduler');
  const js = readFileSync(new URL('../src/ui/input-latency.js', import.meta.url), 'utf8');
  assert.ok(!/requestAnimationFrame/.test(js), 'no frame loop of its own');
});
