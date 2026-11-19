// The scene store's rules made again when a sheet comes or grows (18 Nov 2026, the play-tester: liveRead 735 to 821 ms on the first switches after load: some 6,000
// rules and about 40 CSSOM property reads each). A rule's declarations are read from the CSSOM once, ever; the menus' twin sheet, which holds nothing a figure
// element matches, is no new sheet; and the signature of the sheets is taken once for a reading, not for each element's style.
import test from 'node:test';
import assert from 'node:assert/strict';

let reads = 0;
const rule = (sel, props) => ({
  selectorText: sel,
  style: { length: 0, getPropertyValue: (p) => { reads++; return props[p] || ''; }, getPropertyPriority: () => '' },
});
const mkSheet = (rules, ownerAttr = null) => ({ cssRules: rules, ownerNode: { hasAttribute: (a) => a === ownerAttr } });
const sheets = [];
globalThis.document = { styleSheets: sheets, documentElement: { className: '' } };
globalThis.matchMedia ??= () => ({ matches: false });
const { rulesFromSheets, sceneBegin, sceneStyle } = await import('../src/ui/scene-store.js');

test('a rule is read from the CSSOM once, however often the rules are made again', () => {
  const one = mkSheet([rule('.a', { fill: 'red' }), rule('.b', { stroke: 'blue' }), rule('g .c', { opacity: '0.5' })]);
  reads = 0;
  const first = rulesFromSheets([one]);
  const cost = reads;
  assert.ok(cost > 0);
  assert.equal(first.list.length, 3);
  reads = 0;
  const again = rulesFromSheets([one]);
  assert.equal(reads, 0, 'the second making reads nothing from the CSSOM');
  assert.equal(again.list.length, 3);
  assert.deepEqual(again.list.map((r) => r.sel), first.list.map((r) => r.sel));
});

test('the menus\' twin sheet makes no new engine, and a reading takes the sheets\' signature once', () => {
  const base = mkSheet([rule('.a', { fill: 'red' })]);
  sheets.length = 0; sheets.push(base);
  const el = { localName: 'g', id: '', classList: ['a'], parentElement: null, parentNode: null, getAttribute: () => null, matches: () => true, style: { length: 0, getPropertyValue: () => '' } };
  sceneBegin();
  sceneStyle(el);
  reads = 0;
  sheets.push(mkSheet([rule('.bp-menu', { opacity: '1' })], 'data-plate-twins'));
  sceneBegin();
  sceneStyle(el);
  assert.equal(reads, 0, 'the twin sheet is not read, and the rules stand as they were');
  // A real new sheet is read (once) and a reading's every element asks no more.
  sheets.push(mkSheet([rule('.z', { fill: 'green' })]));
  reads = 0;
  sceneBegin();
  sceneStyle(el);
  const made = reads;
  assert.ok(made > 0, 'a new sheet is read');
  sceneStyle(el); sceneStyle(el);
  assert.equal(reads, made, 'the same reading asks the sheets nothing more');
});
