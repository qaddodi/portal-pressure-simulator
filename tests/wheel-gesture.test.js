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

test('after it acts the glide of the same push does nothing; a stronger push, a turn back or a quiet gap starts the next', () => {
  const first = run([[0, -40], [0, -30], [0, -22], [0, -15], [0, -9], [0, -5], [0, -3]]);
  assert.equal(first.acts.length, 1);
  // a harder push right after the tail
  const again = run([[0, -60]], first.t, first.g);
  assert.deepEqual(again.acts, [{ axis: 'y', dir: -1 }]);
  // fingers turned the other way
  const back = run([[0, 40]], first.t, first.g);
  assert.deepEqual(back.acts, [{ axis: 'y', dir: 1 }]);
  // a quiet gap
  const later = run([[0, -40]], first.t + WHEEL_QUIET + 50, first.g);
  assert.deepEqual(later.acts, [{ axis: 'y', dir: -1 }]);
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
  assert.match(w, /wheelFinger\(e\.deltaX, e\.deltaY, e\.deltaMode, e\.webkitDirectionInvertedFromDevice, innerHeight\)/);
  assert.match(w, /if \(ownsWheel\(e\.target, Math\.abs\(fx\) > Math\.abs\(fy\) \? 'x' : 'y', \{ stop: wrap \}\)\) \{ wheelG = null; return; \}/);
  assert.match(w, /if \(card\) caseFly\(card, a\.dir, 1\.2\);/, 'a case card is thrown off the way the fingers go');
  assert.match(w, /else if \(a\.dir < 0\) \{ if \(caseLift \|\| want < slides\.length - 1\) next\(\); \}\n\s*else prev\(\);/, 'left goes on, but never off the end of the deck');
  assert.match(w, /wideSheet\(ui\.data\)/);
  assert.match(w, /const open = a\.dir < 0;/, 'fingers up open');
  assert.match(w, /if \(open !== ui\.data\.classList\.contains\('tool-open'\)\) ui\.setFold\(open\);/, 'eased by the card\'s own setFold');
  assert.match(w, /\{ passive: false, capture: true \}/);
  // (Before the figure's read-only swallow of the wheel, which stops the event for everything after it.)
  assert.ok(pz.indexOf('let wheelG = null;') < pz.indexOf("for (const t of ['pointerdown', 'mousedown'"), 'ahead of the hands-off listeners');
  // The wide stack is no longer a card that docks to the side, so a sideways swipe on it moves the slide.
  assert.match(pz, /cardSideways: ui && !ui\.data\.hidden && !phone\(\) && !ui\.root\.classList\.contains\('pz-wide'\)/);
  assert.match(pz, /!\(phone\(\) \|\| wideSheet\(d\)\)/, 'a swipe up or down anywhere on an iPad on its side works the stack as the iPhone\'s does');
});
