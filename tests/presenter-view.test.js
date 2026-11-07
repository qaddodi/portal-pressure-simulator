// N1: the presenter view's link: the slide on show reaches a second window, its keys come back, and the notes match the deck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresenterLink, slideView, plain, CHANNEL } from '../src/ui/presenter-view.js';
import { DECKS } from '../src/ui/decks.js';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const slides = [{ title: 'One', line: 'A {portal} line with [a term](pv).', notes: 'Say this.', ask: ['Why?', 'Because.'] }, { title: 'Two', kicker: 'K' }];

test('plain strips term markup', () => { assert.equal(plain('A {portal} [x](pv) **b**'), 'A portal x b'); });

test('slideView carries title, line, notes and ask as the deck has them', () => {
  const v = slideView(slides[0]);
  assert.deepEqual([v.title, v.line, v.notes, v.ask], ['One', 'A portal line with a term.', 'Say this.', ['Why?', 'Because.']]);
  assert.equal(slideView(undefined), null);
  assert.equal(slideView({ title: 'T', ask: 'Only a question' }).ask[1], '');
});

test('every real slide with notes round-trips unchanged', () => {
  const d = Object.values(DECKS).flat?.() ?? DECKS;
  const list = Array.isArray(d) ? d : Object.values(DECKS);
  let n = 0;
  for (const deck of list) for (const s of deck.slides || []) if (s.notes) { assert.equal(slideView(s).notes, String(s.notes).trim()); n++; }
  assert.ok(n > 0);
});

test('publish reaches a second page; its commands come back; ending and closing either side leaves the other working', async () => {
  const cmds = [];
  const talk = createPresenterLink({ onCmd: (m) => cmds.push([m.c, m.i]) });
  const win = new BroadcastChannel(CHANNEL), got = [];
  win.onmessage = (e) => got.push(e.data);
  talk.publish({ id: 'd', title: 'Deck', }, slides, 0, 0, 1);
  await wait();
  assert.equal(got.at(-1).t, 'state');
  assert.equal(got.at(-1).cur.title, 'One'); assert.equal(got.at(-1).next.title, 'Two'); assert.equal(got.at(-1).deck.n, 2);
  const s0 = got.at(-1).slide0;
  talk.publish({ id: 'd', title: 'Deck' }, slides, 0, 1, 2);   // a beat: same slide, same slide clock
  await wait(); assert.equal(got.at(-1).slide0, s0); assert.equal(got.at(-1).beat, 1);
  win.postMessage({ t: 'cmd', c: 'next' }); win.postMessage({ t: 'cmd', c: 'go', i: 1 });
  await wait(); assert.deepEqual(cmds, [['next', undefined], ['go', 1]]);
  win.postMessage({ t: 'hello' }); await wait(); assert.equal(got.at(-1).t, 'state');   // a window opened late is told where the talk is
  talk.end(); await wait(); assert.equal(got.at(-1).t, 'end');
  win.postMessage({ t: 'hello' }); await wait(); assert.equal(got.at(-1).t, 'end');
  win.close();                                   // the window closes: the talk goes on
  assert.doesNotThrow(() => talk.publish({ id: 'd', title: 'Deck' }, slides, 1));
  talk.close();
});
