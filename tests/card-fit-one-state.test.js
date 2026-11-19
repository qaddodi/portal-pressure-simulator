// The card fit has one state and one room rule (CRD-1 and CRD-2 of the 19 Nov 2026 review). NCPH 8 and Carvedilol 12 on an iPhone on its side were cut, and
// Stiffness 8's map stood 20 to 25 px past its room, because the fit measured through what an earlier slide or a later step of the same layout left on the card:
//   - the path card read the Shuffle flag the layout wrote last, so it had the last slide's;
//   - the instrument's room was measured before the tile names, the head and the tight steps changed the rows above it;
//   - the corner icon's class was written after the fit was recorded, so a second fit followed in view;
//   - an instrument that could not shrink to its room told nobody.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createShuffle } from '../src/ui/card-shuffle.js';
import { toolDemandOf, toolRoomOf } from '../src/ui/tool-room.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const cls = () => { const s = new Set(); return { classList: { toggle: (c, on) => (on ? s.add(c) : s.delete(c)), contains: (c) => s.has(c), remove: (c) => s.delete(c) }, s }; };

test('mark() writes the Shuffle classes alone, on the page, the glass and the data card, and sync() after it changes nothing', () => {
  const root = cls(), shade = cls(), data = cls(), text = cls();
  const sh = createShuffle({ ui: { root, shade, data, text } });
  sh.mark(true);
  for (const e of [root, shade, data]) assert.ok(e.s.has('pz-shuf'), 'flag on');
  assert.equal(sh.active(), false, 'mark builds nothing and moves nothing: the shuffle is not on until sync');
  sh.mark(false);
  for (const e of [root, shade, data]) assert.ok(!e.s.has('pz-shuf'), 'flag off again, whatever the last slide left');
  sh.mark(true); sh.mark(true);
  for (const e of [root, shade, data]) assert.equal(e.s.size, 1, 'the same call twice leaves the same state');
});

test('the layout decides the Shuffle before the cards are fitted, and sync only builds it after', () => {
  const l = src('src/ui/presenter-ladders.js');
  const mark = l.indexOf('live.shuffle?.mark(shuf)'), fit = l.indexOf('fitCards(live.ui.data, live.ui.panel)'), sync = l.indexOf('live.shuffle?.sync(shuf');
  assert.ok(mark > 0 && fit > mark && sync > fit, 'mark, then the fit, then sync');
});

test('the instrument\'s room is measured after the tile names, the bars, the head and the tight steps, and again when the tight steps changed the rows', () => {
  const z = src('src/ui/presenter-zoom.js');
  const body = z.slice(z.indexOf('function fitEach'));
  const at = (re) => { const m = body.search(re); assert.ok(m > 0, String(re)); return m; };
  const reset = at(/el\.classList\.remove\('pz-lt', 'pz-lt2'\);\s*\n/), names = at(/k\.classList\.remove\('wrap'\)/), heads = at(/fitHeads\(el\);/), room = at(/roomNow\(\);\s*\n\s*\/\/ \(A quick check/), tight = at(/const lowFloor =/), again = at(/if \(shortFloor \|\| lowFloor\) roomNow\(\)/);
  assert.ok(reset < names && names < heads && heads < room && room < tight && tight < again, 'reset, names, head, room, tight steps, room again');
  assert.doesNotMatch(body.slice(0, names), /fitFlowTime\(el\);\s*\n\s*toolRoom\(el\);/, 'not before the tile names, as it was');
});

test('the corner icon\'s class is decided in the layout and a flip is fitted at once, never left to the next observer pass', () => {
  const l = src('src/ui/presenter-ladders.js');
  assert.doesNotMatch(l, /live\.ui\.data\.classList\.toggle\('pz-zoomable', wide/, 'no bare toggle after the fit was recorded');
  assert.match(l, /classList\.contains\('pz-zoomable'\) !== zoomOn\) \{\s*live\.ui\.data\.classList\.toggle\('pz-zoomable', zoomOn\); fitDone\.delete\(live\.ui\.data\); fitCards\(live\.ui\.data\);/);
});

test('an instrument past its room is a demand on the pair: read back from the fitted card, answered by rising into the top margin', () => {
  assert.equal(toolDemandOf(300, 280), 20, 'the Rule of five map, 20 px over');
  assert.equal(toolDemandOf(280.4, 280), 0, 'a fraction of a px is not a demand');
  assert.equal(toolDemandOf(300, 0), 0, 'no room given (a phone sheet): none');
  assert.equal(toolDemandOf(0, 280), 0);
  // (the room it is held to is the card's cap less everything else: the same number the instrument was drawn for)
  assert.equal(toolDemandOf(toolRoomOf({ cap: 400, pad: 40, parts: [60], gap: 8 }) + 25, toolRoomOf({ cap: 400, pad: 40, parts: [60], gap: 8 })), 25);
  const z = src('src/ui/presenter-zoom.js'), l = src('src/ui/presenter-ladders.js');
  assert.match(z, /function toolDemand\(el\)/);
  assert.match(l, /const need = toolDemand\(dd\) \* k; if \(need > 0\.5\) rise = Math\.max\(rise, pairRise\(need, top0, 4 \* k\)\)/);
  assert.match(src('src/ui/presenter.js'), /tabUp, throwCards, toolDemand, underU/, 'handed to the layout');
});

test('the files this change touches parse (the source-shape tests above cannot see a broken string)', () => {
  for (const f of ['presenter-ladders', 'presenter-zoom', 'presenter', 'card-shuffle', 'tool-room']) {
    const r = spawnSync(process.execPath, ['--check', new URL(`../src/ui/${f}.js`, import.meta.url).pathname], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}.js: ${r.stderr}`);
  }
});
