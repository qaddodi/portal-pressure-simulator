// A talk that ends while a slide change still holds the room its cards leave, or inside a panel width change, leaves nothing behind:
// the held room is never written back onto Explore, and the width's timer never sets the projector's label size after the talk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInsetHold, INSET_KEYS } from '../src/ui/inset-hold.js';

function fakes() {
  const props = new Map(), q = new Map();
  let id = 0;
  const style = { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) };
  const timers = { setTimeout: (f) => { q.set(++id, f); return id; }, clearTimeout: (t) => q.delete(t) };
  const fire = () => { for (const [k, f] of [...q]) { q.delete(k); f(); } };
  return { props, q, style, timers, fire };
}

test('a held room is written as the glide sets off, or on its own after the wait', () => {
  const F = fakes(), h = createInsetHold(F.style, { timers: F.timers });
  h.put('--pz-l', '10px');
  assert.equal(F.props.get('--pz-l'), '10px');
  h.hold();
  h.put('--pz-l', '300px'); h.put('--pz-r', '40px');
  assert.equal(F.props.get('--pz-l'), '10px', 'held: not written yet');
  assert.equal(h.go(), true);
  assert.equal(F.props.get('--pz-l'), '300px'); assert.equal(F.props.get('--pz-r'), '40px');
  assert.equal(F.q.size, 0, 'go clears its late timer');
  let late = 0;
  h.hold(() => late++); h.put('--pz-t', '80px'); F.fire();
  assert.equal(F.props.get('--pz-t'), '80px'); assert.equal(late, 1);
});

test('the talk ending while a room is held: nothing is written back after it', () => {
  const F = fakes(), h = createInsetHold(F.style, { timers: F.timers });
  h.put('--pz-l', '120px');
  h.hold(); h.put('--pz-l', '360px'); h.put('--pz-b', '90px');
  h.reset();
  for (const k of INSET_KEYS) assert.equal(F.props.has(k), false, `${k} taken off`);
  assert.equal(F.q.size, 0, 'no late timer left');
  F.fire();
  assert.equal(F.props.size, 0, 'the held room never comes back');
  assert.equal(h.held, false);
  h.put('--pz-l', '5px');
  assert.equal(F.props.get('--pz-l'), '5px', 'the next talk writes at once');
});

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const stopNow = src.slice(src.indexOf('  function stopNow('), src.indexOf('  let healthyGen'));

test('stopNow resets the held room and stops the timers that would act after the talk', () => {
  assert.match(stopNow, /insets\.reset\(\)/);
  assert.doesNotMatch(stopNow, /removeProperty\(k\)/, 'the room is taken off by insets.reset, after its timer is stopped');
  assert.match(stopNow, /clearTimeout\(widthT\); widthT = 0; widthOwn = false;/);
  assert.match(stopNow, /clearTimeout\(dataHideT\); dataHideT = 0;/);
  assert.doesNotMatch(src, /insetPend|insetT\b/, 'one keeper of the held room: inset-hold.js');
});

test('a panel width timer that fires after the talk sets nothing', () => {
  const at = src.indexOf('widthT = setTimeout(() => {');
  const body = src.slice(at, src.indexOf('}, 240);', at));
  assert.ok(body.indexOf('if (!ui)') > -1 && body.indexOf('if (!ui)') < body.indexOf('apply()'), 'ui looked at before apply');
});
