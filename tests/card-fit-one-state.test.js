// CRD-1 (bible review, 19 Nov 2026): a card was fitted against a state that an earlier pass, or a later stage of the same pass, left on it. Three known instances, closed here:
// the Shuffle's flag is on the cards before they are fitted; the instrument's room is taken after the tile names, bars and head rows are decided; and a class the layout toggles after
// the fit is recorded (the zoom icon's) is not part of the fit's signature, so the next observer pass does not refit the card a second time (a snap, CRD-8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createShuffle } from '../src/ui/card-shuffle.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the layout puts the Shuffle\'s flag on the cards before it fits them, and sync puts the same flag again', () => {
  const l = src('src/ui/presenter-ladders.js');
  const mark = l.indexOf('live.shuffle?.mark(shuf);'), fit = l.indexOf('fitCards(live.ui.data, live.ui.panel);'), sync = l.indexOf('live.shuffle?.sync(shuf');
  assert.ok(mark > 0 && fit > mark && sync > fit, 'mark, then the fit, then sync');
  const cls = () => { const c = new Set(); return { classList: { toggle: (n, on) => (on ? c.add(n) : c.delete(n)), remove: (n) => c.delete(n), contains: (n) => c.has(n) }, has: (n) => c.has(n) }; };
  const root = cls(), shade = cls(), data = cls(), text = cls();
  const sh = createShuffle({ ui: { root, shade, data, text } });
  sh.mark(true);
  assert.ok(root.has('pz-shuf') && shade.has('pz-shuf') && data.has('pz-shuf'), 'on the page and the two cards the path card sits in');
  sh.mark(false);
  assert.ok(!root.has('pz-shuf') && !data.has('pz-shuf'));
  assert.equal(sh.active(), false, 'marking builds nothing and does not turn the Shuffle on');
});

test('the instrument\'s room and the flow-time card are measured after the tile names, bars and head rows, not before', () => {
  const z = src('src/ui/presenter-zoom.js');
  const room = z.indexOf('      toolRoom(el);'), heads = z.indexOf('      fitHeads(el);'), names = z.indexOf("k.classList.add('short')"), bars = z.indexOf("l.classList.add('lo')");
  assert.equal(z.split('      toolRoom(el);').length, 2, 'taken once per fit');
  assert.ok(names > 0 && bars > 0 && heads > bars && room > heads, 'the room is read last of the decisions that change the header');
  assert.ok(z.indexOf('      fitFlowTime(el);') > heads);
});

test('a class the layout writes after the fit is recorded (the zoom icon\'s) is left out of the fit\'s signature', () => {
  const z = src('src/ui/presenter-zoom.js');
  assert.match(z, /el\.className\.replace\(\/ \?\\b\(\?:tool-open\|pz-sliding\|pz-zoomable\)\\b\/g, ''\)/);
});
