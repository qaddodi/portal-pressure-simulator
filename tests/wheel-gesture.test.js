// A trackpad (or wheel) works the slide as a finger does (Mohammad, 22 Oct: "use the touch pad on the mac to move slides just like on ipad
// and to open the stack and close it (scroll up opens it anywhere I scroll up, scroll down closes it, scroll right and left move
// slides/throws away case card same as ipad/iphone) - make sure on ipad i'm able to swipe up and down anywhere to open close tuck untuck stack
// just like iphone"). The rules are pure (src/ui/swipe.js); presenter.js needs a DOM, so its wiring is read as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wheelFinger, wheelGesture, ownsWheel, WHEEL_X, WHEEL_Y, WHEEL_QUIET } from '../src/ui/swipe.js';

const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

// Feeds a run of finger movements, 16 ms apart, and gives every action it took.
function run(steps, t0 = 1000, g = null) {
  const acts = []; let t = t0;
  for (const [fx, fy] of steps) { const r = wheelGesture(g, fx, fy, t); g = r.g; if (r.act) acts.push(r.act); t += 16; }
  return { acts, g, t };
}

test('the fingers\' own direction: natural scrolling reports the page\'s movement the other way round', () => {
  assert.deepEqual(wheelFinger(0, 10, 0, true), [-0, -10]);   // natural: the page moved down, the fingers moved up
  assert.deepEqual(wheelFinger(5, -10, 0, false), [5, -10]);   // classic: the page and the fingers go the same way
  assert.deepEqual(wheelFinger(0, 10), [-0, -10], 'natural unless the browser says otherwise (macOS\'s default)');
  assert.deepEqual(wheelFinger(0, 2, 1, true), [-0, -32], 'lines are 16 px');
  assert.deepEqual(wheelFinger(0, 1, 2, true, 700), [-0, -700], 'a page is the window\'s height');
});

test('fingers up open the stack, down close it: one action for a whole gesture, tail included', () => {
  const up = run(Array.from({ length: 40 }, (_, i) => [0, -Math.max(1, 12 - i * 0.3)]));
  assert.deepEqual(up.acts, [{ axis: 'y', dir: -1 }]);
  const down = run(Array.from({ length: 40 }, (_, i) => [0, Math.max(1, 12 - i * 0.3)]));
  assert.deepEqual(down.acts, [{ axis: 'y', dir: 1 }]);
  // (A single mouse-wheel notch is enough.)
  assert.deepEqual(run([[0, -100]]).acts, [{ axis: 'y', dir: -1 }]);
  assert.ok(WHEEL_Y <= 30);
});

test('fingers left go on, right go back: sideways must beat vertical and pass its distance', () => {
  const left = run(Array.from({ length: 30 }, () => [-9, 1]));
  assert.deepEqual(left.acts, [{ axis: 'x', dir: -1 }]);
  const right = run(Array.from({ length: 30 }, () => [9, -1]));
  assert.deepEqual(right.acts, [{ axis: 'x', dir: 1 }]);
  assert.deepEqual(run([[-WHEEL_X + 10, 0]]).acts, [], 'not far enough');
  assert.deepEqual(run(Array.from({ length: 30 }, () => [-4, 4])).acts.length, 1, 'a long diagonal settles on its larger axis, once');
});

test('a small twitch, a stray event or a vertical move with a little sideways in it does nothing sideways', () => {
  assert.deepEqual(run([[0.5, 0.5], [0, 1]]).acts, []);
  assert.deepEqual(run([[NaN, 1]]).acts, []);
  const a = run(Array.from({ length: 6 }, () => [-2, -12])).acts;
  assert.deepEqual(a, [{ axis: 'y', dir: -1 }], 'mostly up is up');
});

test('after it acts the rest of the glide does nothing, however it jitters: only a quiet gap or fingers turned back start the next', () => {
  const first = run([[0, -40], [0, -30], [0, -22], [0, -15], [0, -9], [0, -5], [0, -3]]);
  assert.equal(first.acts.length, 1);
  // a harder push right after the tail is still the glide's (a momentum tail has bumps; it is not a new swipe)
  assert.deepEqual(run([[0, -60]], first.t, first.g).acts, [], 'a bump in the tail');
  assert.deepEqual(run([[0, 0], [0, -60], [0, -80]], first.t, first.g).acts, [], 'a zero event, then a bump');
  // fingers turned the other way, as far as a gesture needs, in one unbroken run
  assert.deepEqual(run([[0, 12], [0, 12], [0, 12]], first.t, first.g).acts, [{ axis: 'y', dir: 1 }]);
  assert.deepEqual(run([[0, 12], [0, -2], [0, 12], [0, -2], [0, 12]], first.t, first.g).acts, [], 'a wobble in the tail is not a turn');
  // a quiet gap
  assert.deepEqual(run([[0, -40]], first.t + WHEEL_QUIET + 50, first.g).acts, [{ axis: 'y', dir: -1 }]);
});

// A fast flick on a Mac: the fingers' events, then the momentum tail (about 0.95 a step), whole numbers, an odd zero where the phases meet
// and now and then (Mohammad, 22 Oct: "swiping sideways on mac is moving multiple slides").
function flick(sign, { zero = true, jitter = true, tail = 70, axis = 'x' } = {}) {
  const ev = [];
  for (let i = 0; i < 8; i++) ev.push(sign * Math.round(10 + i * 7));
  if (zero) ev.push(0);
  let v = 60;
  for (let i = 0; i < tail; i++) { v *= 0.95; ev.push(jitter && i % 9 === 4 ? 0 : sign * Math.round(v)); }
  return ev.map((d) => (axis === 'x' ? [d, 0] : [0, d]));
}

test('one flick, however long its momentum, is one action (a zero or a bump in the tail does not start another)', () => {
  for (const zero of [false, true]) for (const jitter of [false, true]) for (const axis of ['x', 'y']) for (const sign of [-1, 1]) {
    const r = run(flick(sign, { zero, jitter, axis }));
    assert.deepEqual(r.acts, [{ axis, dir: sign }], `zero ${zero} jitter ${jitter} ${axis} ${sign}`);
  }
  // coalesced into slow frames (two or three events a frame): still one
  const slow = flick(-1).reduce((o, e, i) => { if (i % 3 === 0) o.push([0, 0]); const l = o[o.length - 1]; l[0] += e[0]; return o; }, []);
  assert.equal(run(slow).acts.length, 1);
  // a second flick after the first one's glide went quiet is the next action; one inside the glide is not
  const one = run(flick(-1));
  assert.equal(run(flick(-1), one.t + WHEEL_QUIET + 20, one.g).acts.length, 1, 'after a quiet gap');
  assert.equal(run(flick(-1), one.t + 40, one.g).acts.length, 0, 'inside the glide');
});

test('a slow frame inside a glide does not split it: gaps up to the quiet time keep it one gesture', () => {
  let g = null, t = 1000, acts = 0;
  for (const [fx] of flick(-1)) { const r = wheelGesture(g, fx, 0, t); g = r.g; if (r.act) acts++; t += 16; }
  t -= 16;   // (back to the last event's time)
  for (const d of [-4, -3, -3, -2, -2]) { t += WHEEL_QUIET - 10; const r = wheelGesture(g, d, 0, t); g = r.g; if (r.act) acts++; }
  assert.equal(acts, 1);
  assert.ok(WHEEL_QUIET >= 250);
  // (a stamp a hair out of order is not a gap)
  assert.equal(wheelGesture(g, -3, 0, t - 5).g.spent, true);
});

test('a box that scrolls itself keeps its wheel; the slide list, fields and plain cards do not', () => {
  const win = { getComputedStyle: (n) => n.style };
  const box = (extra = {}, parent = null) => ({ nodeType: 1, parentElement: parent, ownerDocument: { defaultView: win }, scrollHeight: 100, clientHeight: 100, scrollWidth: 100, clientWidth: 100, style: { overflowX: 'visible', overflowY: 'visible' }, matches: () => false, ...extra });
  const wrap = box();
  assert.equal(ownsWheel(box({}, wrap), 'y', { stop: wrap }), false);
  assert.equal(ownsWheel(box({ scrollHeight: 300, style: { overflowY: 'auto', overflowX: 'visible' } }, wrap), 'y', { stop: wrap }), true);
  assert.equal(ownsWheel(box({ scrollHeight: 300, style: { overflowY: 'auto', overflowX: 'visible' } }, wrap), 'x', { stop: wrap }), false, 'only the axis it scrolls on');
  assert.equal(ownsWheel(box({ scrollWidth: 300, style: { overflowX: 'scroll', overflowY: 'visible' } }, wrap), 'x', { stop: wrap }), true);
  assert.equal(ownsWheel(box({ scrollHeight: 300, style: { overflowY: 'hidden', overflowX: 'visible' } }, wrap), 'y', { stop: wrap }), false, 'overflow hidden is not a scroller');
  assert.equal(ownsWheel(box({ matches: (sel) => sel.includes('.pz-jump') }, wrap), 'y', { stop: wrap }), true);
});

test('presenter: the wheel works the slide, the stack and the case card; a wide screen\'s stack takes the swipe anywhere too', () => {
  const w = pz.slice(pz.indexOf('let wheelG = null;'), pz.indexOf('// ── Hands off'));
  assert.match(w, /if \(!deck \|\| !ui \|\| e\.ctrlKey \|\| e\.metaKey \|\| leaving \|\| !ui\.jump\.hidden \|\| isModalOpen\(\)\) return;/, 'a pinch, the slide list and dialogs keep their wheel');
  assert.match(w, /const now = e\.timeStamp > 0 \? e\.timeStamp : performance\.now\(\);/, 'timed by the event\'s own stamp, not when a busy frame got to it');
  assert.match(w, /wheelGesture\(wheelG, fx, fy, now\)/);
  assert.match(w, /wheelFinger\(e\.deltaX, e\.deltaY, e\.deltaMode, e\.webkitDirectionInvertedFromDevice, innerHeight\)/);
  assert.match(w, /if \(ownsWheel\(e\.target, Math\.abs\(fx\) > Math\.abs\(fy\) \? 'x' : 'y', \{ stop: wrap \}\)\) \{ wheelG = wheelG\?\.spent \? \{ \.\.\.wheelG, t: now \} : null; return; \}/, 'a glide that has acted stays spent');
  assert.match(w, /if \(card\) caseFly\(card, a\.dir, 1\.2\);/, 'a case card is thrown off the way the fingers go');
  assert.match(w, /else if \(a\.dir < 0\) next\(\);[^\n]*\n\s*else prev\(\);/, 'left goes on, and off the end of the deck it ends the talk, as the touch swipe does');
  assert.doesNotMatch(w, /want < slides\.length - 1/, 'no last-slide guard on the wheel');
  assert.match(w, /else stackFold\(a\.dir < 0\);/, 'fingers up open');
  const f = pz.slice(pz.indexOf('function stackFold(open)'), pz.indexOf('let wheelG = null;'));
  assert.match(f, /!wideSheet\(d\)/);
  assert.match(f, /\(caseCard && !caseCard\.flown\)/, 'not over a case card');
  assert.match(f, /if \(open !== d\.classList\.contains\('tool-open'\)\) ui\.setFold\(open\);/, 'eased by the card\'s own setFold');
  assert.match(w, /\{ passive: false, capture: true \}/);
  // (Before the figure's read-only swallow of the wheel, which stops the event for everything after it.)
  assert.ok(pz.indexOf('let wheelG = null;') < pz.indexOf("for (const t of ['pointerdown', 'mousedown'"), 'ahead of the hands-off listeners');
  // The wide stack is no longer a card that docks to the side, so a sideways swipe on it moves the slide.
  assert.match(pz, /cardSideways: ui && !ui\.data\.hidden && !phone\(\) && !ui\.root\.classList\.contains\('pz-wide'\)/);
  assert.match(pz, /!\(phone\(\) \|\| wideSheet\(d\)\)/, 'a swipe up or down anywhere on an iPad on its side works the stack as the iPhone\'s does');
});

test('presenter: the up arrow untucks the stack and the down arrow tucks it, and neither moves a slide', () => {
  const onKey = pz.slice(pz.indexOf('function onKey('), pz.indexOf("addEventListener('keydown', onKey, true)"));
  assert.match(onKey, /else if \(k === 'ArrowUp' \|\| k === 'ArrowDown'\) \{ if \(!e\.repeat\) stackFold\(k === 'ArrowUp'\); \}/);
  // (Left and right, page keys, space, enter and backspace still move slides; the up and down arrows no longer do.)
  assert.match(onKey, /k === 'ArrowRight' \|\| k === 'PageDown' \|\| k === ' ' \|\| k === 'Enter'\) \{ if \(!e\.repeat\) next\(\); \}/);
  assert.match(onKey, /k === 'ArrowLeft' \|\| k === 'PageUp' \|\| k === 'Backspace'\) \{ if \(!e\.repeat\) prev\(\); \}/);
  const slideKeys = onKey.split('\n').filter((l) => /\b(next|prev)\(\)/.test(l)).join('\n');
  assert.doesNotMatch(slideKeys, /ArrowUp|ArrowDown/, 'a slide key line never names the up or down arrow');
  // A focused slider, field or list keeps its arrow keys; the slide list (G) has its own.
  assert.match(onKey, /if \(tag === 'input' \|\| tag === 'textarea' \|\| tag === 'select'\) return;/);
  assert.match(onKey, /if \(ui && !ui\.jump\.hidden\) \{ jumpKey\(e\); return; \}/);
  // The Guide lists the keys.
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main.slice(main.indexOf('const PRESENT_KEYS'), main.indexOf('];', main.indexOf('const PRESENT_KEYS'))), /\['↑ · ↓', /);
});
