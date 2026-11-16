// The context registry counts contexts, not asks (play-test T01, 16 Nov 2026: "14 live WebGL contexts after about 11 decks"). gl-state.js hands
// noteContext every result of getContext('webgl2'), and asking a canvas that already has its context (the sinusoid support check does, on the
// figure's canvas, once a deck) answers the same object: each ask was counted as one more live context, so the warning that a page is near
// WebKit's 16 fired on a page holding two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteContext, contextStats, WARN_AT } from '../src/ui/gl-contexts.js';

const fake = () => ({ isContextLost: () => false });

test('asking again for the context a canvas already has does not count a new one', () => {
  const before = contextStats();
  const a = fake(), b = fake();
  for (let i = 0; i < WARN_AT + 6; i++) noteContext(a, null);
  noteContext(b, null);
  const after = contextStats();
  assert.equal(after.made - before.made, 2, 'two contexts were made');
  assert.equal(after.live - before.live, 2, 'two are live');
});

test('a lost context stops counting as live', () => {
  const before = contextStats().live;
  let lostNow = false;
  const g = { isContextLost: () => lostNow };
  noteContext(g, null);
  assert.equal(contextStats().live, before + 1);
  lostNow = true;
  assert.equal(contextStats().live, before);
});
