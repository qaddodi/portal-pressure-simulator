// The real-time GPU motion check's judgement (scripts/gate-motion.mjs, recs R16): a move whose glass and words stay together passes; one
// frame in which the glass is left where it was (the separation the owner saw on his iPhone) fails; too few frames is inconclusive, never a pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionIssues } from '../scripts/gate-motion.mjs';

const card = (x, o = 1, moving = true) => ({ x, y: 100, w: 320, h: 200, o, moving });
const glass = (x, a = 1) => ({ x: x - 6, y: 94, w: 332, h: 212, a });
function move({ n = 10, stale = -1, from = 400, to = 340 } = {}) {
  const out = [];
  let gx = from;
  for (let i = 0; i < n; i++) {
    const x = from + ((to - from) * i) / (n - 1);
    if (i !== stale) gx = x;   // (a stale frame: the glass is drawn where the card was a frame ago)
    out.push({ n: i, els: { text: card(x + 20), shade: card(x), data: null }, glass: { seq: i, panes: { shade: glass(gx), data: null } } });
  }
  return out;
}

test('a move whose glass, shade and words stay together passes', () => {
  const r = motionIssues(move());
  assert.deepEqual(r.issues, []);
  assert.equal(r.inconclusive, false);
  assert.equal(r.frames, 10);
});

test('one frame of glass left behind its card fails', () => {
  const r = motionIssues(move({ stale: 5 }));
  assert.equal(r.issues.length, 1, r.issues.join('\n'));
  assert.match(r.issues[0], /glass vs its shade: parted by 6\.7 px in frame 5/);
});

test('the words leaving their shade for a frame fails', () => {
  const s = move();
  s[3].els.text = card(s[3].els.shade.x + 32);
  const r = motionIssues(s);
  assert.equal(r.issues.length, 1);
  assert.match(r.issues[0], /teaching words vs their shade/);
});

test('glass drawn under a card that has faded out fails', () => {
  const s = move();
  s.push({ n: 99, els: { text: null, shade: card(340, 0, false), data: null }, glass: { seq: 99, panes: { shade: glass(340, 0.8), data: null } } });
  const r = motionIssues(s);
  assert.equal(r.issues.length, 1);
  assert.match(r.issues[0], /shade glass drawn alone/);
});

test('too few sampled frames is inconclusive, not a pass', () => {
  const r = motionIssues(move({ n: 3 }));
  assert.deepEqual(r.issues, []);
  assert.equal(r.inconclusive, true);
  assert.match(r.why, /only 3 moving frame/);
});

test('frames with no glass record are not counted as judged', () => {
  const s = move().map((x) => ({ ...x, glass: null }));
  const r = motionIssues(s);
  assert.equal(r.frames, 0);
  assert.equal(r.inconclusive, true);
});

test('a card that changes size starts a new run rather than a false parting', () => {
  const s = move();
  for (let i = 5; i < s.length; i++) { s[i].els.shade.w = 300; s[i].glass.panes.shade.w = 312; s[i].glass.panes.shade.x = s[i].els.shade.x - 3; }
  assert.deepEqual(motionIssues(s).issues, []);
});
