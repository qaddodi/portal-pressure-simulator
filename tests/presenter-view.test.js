// N1: the presenter view's link: the slide on show reaches a second window, its keys come back, and the notes match the deck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresenterLink, slideView, plain, CHANNEL, PROTOCOL, COMMANDS, VIEW_QUERY, channelOf, commandOf, fromTalk, newSession, validSession, BEAT_MS, STALE_MS } from '../src/ui/presenter-view.js';
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
  const win = new BroadcastChannel(channelOf(talk.sid)), got = [];
  const msg = (m) => ({ v: PROTOCOL, sid: talk.sid, ...m });
  win.onmessage = (e) => got.push(e.data);
  talk.publish({ id: 'd', title: 'Deck', }, slides, 0, 0, 1);
  await wait();
  assert.equal(got.at(-1).t, 'state');
  assert.equal(got.at(-1).cur.title, 'One'); assert.equal(got.at(-1).next.title, 'Two'); assert.equal(got.at(-1).deck.n, 2);
  const s0 = got.at(-1).slide0;
  talk.publish({ id: 'd', title: 'Deck' }, slides, 0, 1, 2);   // a beat: same slide, same slide clock
  await wait(); assert.equal(got.at(-1).slide0, s0); assert.equal(got.at(-1).beat, 1);
  win.postMessage(msg({ t: 'cmd', c: 'next' })); win.postMessage(msg({ t: 'cmd', c: 'go', i: 1 }));
  await wait(); assert.deepEqual(cmds, [['next', undefined], ['go', 1]]);
  win.postMessage(msg({ t: 'hello' })); await wait(); assert.equal(got.at(-1).t, 'state');   // a window opened late is told where the talk is
  talk.end(); await wait(); assert.equal(got.at(-1).t, 'end');
  win.postMessage(msg({ t: 'hello' })); await wait(); assert.equal(got.at(-1).t, 'end');
  win.close();                                   // the window closes: the talk goes on
  assert.doesNotThrow(() => talk.publish({ id: 'd', title: 'Deck' }, slides, 1));
  talk.close();
});

// ---- R06 (external production review, 15 Nov 2026): one talk, one notes window ---------------------------------------------------------------------------
test('R06: a session id is random, valid, and names the channel; a talk mints its own', () => {
  const a = newSession(), b = newSession();
  assert.ok(validSession(a) && validSession(b) && a !== b, `${a} ${b}`);
  assert.equal(channelOf(a), `${CHANNEL}:${a}`);
  for (const bad of [null, undefined, '', 'short', 'UPPERCASEUPPERCASE', 'has space 123456', 'a'.repeat(65), 7, {}, ['abcdefabcdef']]) assert.equal(validSession(bad), false, String(bad));
  const x = createPresenterLink(), y = createPresenterLink();
  assert.ok(validSession(x.sid) && validSession(y.sid) && x.sid !== y.sid, 'two talks, two sessions');
  x.close(); y.close();
});

test('R06: a command carries the protocol and the session, and only next, prev or a whole-number go is taken', () => {
  const sid = newSession();
  assert.deepEqual(COMMANDS, ['next', 'prev', 'go']);
  assert.deepEqual(commandOf({ v: PROTOCOL, sid, t: 'cmd', c: 'next' }, sid), { c: 'next' });
  assert.deepEqual(commandOf({ v: PROTOCOL, sid, t: 'cmd', c: 'go', i: 4 }, sid), { c: 'go', i: 4 });
  assert.deepEqual(commandOf({ v: PROTOCOL, sid, t: 'cmd', c: 'next', i: 9 }, sid), { c: 'next' }, 'only the fields a command has');
  for (const bad of [null, 'next', 7, [], {}, { t: 'cmd', c: 'next' }, { v: PROTOCOL, t: 'cmd', c: 'next' }, { v: PROTOCOL, sid: 'x'.repeat(20), t: 'cmd', c: 'next' }, { v: PROTOCOL + 1, sid, t: 'cmd', c: 'next' },
    { v: PROTOCOL, sid, t: 'cmd', c: 'close' }, { v: PROTOCOL, sid, t: 'cmd', c: '__proto__' }, { v: PROTOCOL, sid, t: 'cmd' }, { v: PROTOCOL, sid, t: 'state', c: 'next' },
    { v: PROTOCOL, sid, t: 'cmd', c: 'go' }, { v: PROTOCOL, sid, t: 'cmd', c: 'go', i: '2' }, { v: PROTOCOL, sid, t: 'cmd', c: 'go', i: 1.5 }, { v: PROTOCOL, sid, t: 'cmd', c: 'go', i: -1 },
    { v: PROTOCOL, sid, t: 'cmd', c: 'go', i: NaN }, { v: PROTOCOL, sid, t: 'cmd', c: 'go', i: 1e9 }]) assert.equal(commandOf(bad, sid), null, JSON.stringify(bad));
  assert.equal(fromTalk({ v: PROTOCOL, sid, t: 'state' }, sid), true);
  assert.equal(fromTalk({ v: PROTOCOL, sid, t: 'beat' }, sid), true);
  assert.equal(fromTalk({ v: PROTOCOL, sid: 'other', t: 'state' }, sid), false);
  assert.equal(fromTalk({ v: PROTOCOL, sid, t: 'cmd' }, sid), false, 'a notes window does not take a command as a slide');
  assert.equal(fromTalk(null, sid), false);
});

test('R06: two talks on one origin: a notes window and its commands reach only their own talk', async () => {
  const got1 = [], got2 = [];
  const t1 = createPresenterLink({ onCmd: (c) => got1.push(c) }), t2 = createPresenterLink({ onCmd: (c) => got2.push(c) });
  const w1 = new BroadcastChannel(channelOf(t1.sid)), w2 = new BroadcastChannel(channelOf(t2.sid)), seen1 = [], seen2 = [];
  w1.onmessage = (e) => seen1.push(e.data); w2.onmessage = (e) => seen2.push(e.data);
  const m1 = (m) => ({ v: PROTOCOL, sid: t1.sid, ...m }), m2 = (m) => ({ v: PROTOCOL, sid: t2.sid, ...m });
  t1.publish({ id: 'one', title: 'One' }, slides, 0); t2.publish({ id: 'two', title: 'Two' }, slides, 1);
  await wait();
  assert.deepEqual([seen1.at(-1).deck.id, seen2.at(-1).deck.id], ['one', 'two'], 'each notes window follows its own talk');
  assert.ok(seen1.every((m) => m.sid === t1.sid) && seen2.every((m) => m.sid === t2.sid));
  w1.postMessage(m1({ t: 'cmd', c: 'next' })); w2.postMessage(m2({ t: 'cmd', c: 'prev' })); w2.postMessage(m2({ t: 'cmd', c: 'go', i: 1 }));
  await wait();
  assert.deepEqual(got1, [{ c: 'next' }], 'Next in the first window moved the first talk only');
  assert.deepEqual(got2, [{ c: 'prev' }, { c: 'go', i: 1 }]);
  // A command put on the first talk's channel with the second talk's session id (or none) is dropped by the first.
  w1.postMessage(m2({ t: 'cmd', c: 'next' })); w1.postMessage({ t: 'cmd', c: 'next' }); w1.postMessage({ v: PROTOCOL, t: 'cmd', c: 'next' });
  await wait(); assert.equal(got1.length, 1);
  // The old fixed channel, and the old message shape, reach nobody.
  const old = new BroadcastChannel(CHANNEL); old.postMessage({ t: 'cmd', c: 'next' }); old.postMessage({ t: 'hello' });
  await wait(); assert.equal(got1.length, 1); assert.equal(got2.length, 2); old.close();
  // Ending one talk tells only its own window.
  const n2 = seen2.length; t1.end(); await wait(); assert.equal(seen1.at(-1).t, 'end'); assert.equal(seen2.length, n2);
  w1.close(); w2.close(); t1.close(); t2.close();
});

test('R06: the notes window is named for its talk and opened at an address that carries it', () => {
  const calls = [];
  const had = globalThis.window, hadLoc = globalThis.location;
  globalThis.location = { href: 'https://qaddodi.github.io/portal-pressure-simulator/preview/#s=abc' };
  globalThis.window = { open: (url, name, feat) => { calls.push({ url, name, feat }); return { closed: false, focus() {} }; } };
  try {
    const talk = createPresenterLink();
    assert.equal(talk.open(), true);
    assert.equal(calls[0].url, `https://qaddodi.github.io/portal-pressure-simulator/preview/?${VIEW_QUERY}=${talk.sid}`);
    assert.equal(calls[0].name, channelOf(talk.sid), 'the window name is the session\'s, not one shared by every talk');
    talk.close();
  } finally { globalThis.window = had; globalThis.location = hadLoc; }
});

test('R06: the heartbeat runs only while a notes window is open, and the window tells a stale link from a live one', async () => {
  assert.ok(STALE_MS > 2 * BEAT_MS, 'one missed beat is not a disconnect');
  const calls = [];
  const had = globalThis.window, hadLoc = globalThis.location;
  globalThis.location = { href: 'https://example.test/app/' };
  let closed = false;
  globalThis.window = { open: () => { calls.push(1); return { get closed() { return closed; }, focus() {} }; } };
  try {
    const B = 40, talk = createPresenterLink({ beatMs: B }), ch = new BroadcastChannel(channelOf(talk.sid)), seen = [];
    ch.onmessage = (e) => seen.push(e.data.t);
    await wait(3 * B); assert.ok(!seen.includes('beat'), 'no notes window, no beat');
    talk.open(); await wait(3 * B); assert.ok(seen.includes('beat'), 'a beat while the window is open');
    closed = true; await wait(3 * B); const n = seen.filter((t) => t === 'beat').length; await wait(3 * B);
    assert.equal(seen.filter((t) => t === 'beat').length, n, 'the beat stops when the window closes');
    ch.close(); talk.close();
  } finally { globalThis.window = had; globalThis.location = hadLoc; }
});

test('the notes window prints a slide\'s own numbers where the slide has {tokens}, never the token name (bible CRD-10, 19 Nov 2026)', async () => {
  const { lineText } = await import('../src/ui/handout.js');
  const s = { title: 'T', line: 'Her HVPG is {hvpg}, which is {>=10 mmHg}.', ask: ['Why is the PPG {ppg}?', 'Because of {hvpg}.'] };
  const fp = { hvpg: 12.4, ppg: 14.1 };
  const said = (t) => lineText(t, fp);
  const v = slideView(s, said);
  assert.ok(!/\bhvpg\b|\bppg\b/.test(`${v.line} ${v.ask.join(' ')}`), `no token names: ${v.line} / ${v.ask}`);
  assert.match(v.line, /12\.4/);
  assert.match(v.ask[0], /14\.1/);
  assert.match(slideView(s).line, /hvpg/, 'without the numbers the old text is what it was (the talk always passes them)');
});
