// src/ui/flags.js: the one place the page's address is read (DBG-4, bible review 19 Nov 2026).
//  1. one spelling per flag: ?offgpu is ?offgpu=1, =0 is off; ?perf=0 is off; ?fps needs digits; the table has the flags the old hand reads had;
//  2. a gate: the recorder (?watch), the gallery and the Phone check work on the preview copy and a local run, the measuring flags everywhere;
//  3. the old spelling ?rate is read next to ?testclock and does not start the test clock at boot;
//  4. no other file reads location.search: the allowance is 0, so a new flag goes through this module.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagOn, flagValue, flagNumber, gateOf, knownFlags, FLAGS, EXTRA, ALIASES } from '../src/ui/flags.js';
import { parseCheckAddress } from '../src/ui/gallery/phone-check-panel.js';

const at = (search, where = 'live') => ({ search, pathname: where === 'preview' ? '/portal-pressure-simulator/preview/' : '/portal-pressure-simulator/', hostname: where === 'local' ? 'localhost' : 'qaddodi.github.io' });

test('one spelling per flag', () => {
  assert.equal(flagOn('offgpu', '?offgpu'), true);
  assert.equal(flagOn('offgpu', '?offgpu=1'), true);
  assert.equal(flagOn('offgpu', '?offgpu=0'), false);
  assert.equal(flagOn('budget', '?budget'), true);
  assert.equal(flagOn('perf', '?perf'), true);
  assert.equal(flagOn('perf', '?x=1&perf&y'), true);
  assert.equal(flagOn('perf', '?perf=0'), false);
  assert.equal(flagOn('perf', '?performance=1'), false, 'a longer name is not the flag');
  assert.equal(flagOn('fps', '?fps=120'), true);
  assert.equal(flagOn('fps', '?fps=fast'), false);
  assert.equal(flagNumber('fps', '?fps=90'), 90);
  assert.equal(flagOn('rest', '?rest=off'), true);
  assert.equal(flagOn('rest', '?rest=on'), false);
  assert.equal(flagOn('lumen', '?lumen=off'), true);
  assert.equal(flagNumber('lumenscale', '?a&lumenscale=0.5#h'), 0.5);
  assert.equal(flagValue('script', '?script=hvpg&slide=3'), 'hvpg');
  assert.equal(flagValue('script', '?slide=3'), null);
  assert.equal(flagValue('back', '?back'), '');
  assert.equal(flagOn('scene', '?scene=dom'), true);
  assert.equal(flagOn('scenecheck', '?scenecheck'), true);
});

test('every flag has a gate and a meaning, and a flag is known once', () => {
  const ids = [...FLAGS, ...EXTRA].map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'an id is in the table twice');
  for (const f of knownFlags()) { assert.ok(['live', 'preview', 'local'].includes(f.gate), f.id); assert.ok(f.meaning, `${f.id} has no meaning`); }
  for (const id of ['perf', 'fps', 'offgpu', 'watch', 'budget', 'lap', 'inputs', 'testclock', 'gallery', 'check', 'rate', 'only', 'steps', 'fresh', 'sweep', 'testframe', 'presenter-view']) assert.ok(ids.includes(id), `${id} is not in the table`);
  assert.deepEqual(ALIASES, { rate: 'testclock' });
});

test('gates: the recorder and the debug pages open on the preview copy and a local run only; measuring flags work on the live site', () => {
  assert.equal(flagOn('perf', at('?perf', 'live')), true);
  assert.equal(flagOn('offgpu', at('?offgpu', 'live')), true);
  assert.equal(gateOf('watch'), 'local');
  assert.equal(flagOn('watch', at('?watch', 'live')), false);
  assert.equal(flagOn('watch', at('?watch', 'preview')), true);
  assert.equal(flagOn('watch', at('?watch', 'local')), true);
  assert.equal(flagValue('gallery', at('?gallery', 'live')), null);
  assert.equal(flagValue('gallery', at('?gallery=frame', 'preview')), 'frame');
  assert.equal(flagValue('check', at('?check=full', 'local')), 'full');
  assert.equal(flagOn('gallery', at('?gallery', 'live')), false);
});

test('?rate is the Phone check\'s old spelling of ?testclock: read as the rate, and not a flag that starts the clock at boot', () => {
  assert.equal(parseCheckAddress('?check&rate=8').rate, 8);
  assert.equal(parseCheckAddress('?check&testclock=8').rate, 8);
  assert.equal(parseCheckAddress('?check&testclock=8&rate=3').rate, 8, 'testclock is the one name and wins');
  assert.equal(parseCheckAddress('?check').rate, 6);
  assert.equal(parseCheckAddress('?check=full&only=views,panes&fresh=1&steps=0').only.join(), 'views,panes');
  assert.equal(parseCheckAddress('?gallery'), null);
  assert.equal(flagOn('testclock', '?check&rate=8'), false);
});

test('?debug is the one name of the debug page: it opens the gallery, the Phone check and its long walk and the frame, and the old names still do', () => {
  assert.equal(flagValue('gallery', at('?debug', 'preview')), '');
  assert.equal(flagValue('gallery', at('?debug=gallery', 'preview')), '');
  assert.equal(flagValue('gallery', at('?debug=frame', 'preview')), 'frame');
  assert.equal(flagValue('check', at('?debug=check', 'local')), '');
  assert.equal(flagValue('check', at('?debug=full', 'local')), 'full');
  assert.equal(flagValue('check', at('?debug', 'local')), null, 'the page alone is not the walk');
  assert.equal(flagValue('gallery', at('?debug=check', 'local')), null, 'the walk is not the page');
  assert.equal(flagOn('gallery', at('?debug', 'local')), true);
  assert.equal(flagValue('debug', at('?debug=check', 'local')), 'check');
  // (the same gate as the old names: the live site never reads it)
  for (const q of ['?debug', '?debug=check', '?debug=frame']) { assert.equal(flagValue('gallery', at(q, 'live')), null); assert.equal(flagValue('check', at(q, 'live')), null); }
  assert.equal(flagValue('gallery', at('?gallery', 'preview')), '', 'the old spelling still works');
  assert.equal(gateOf('debug'), 'local');
  assert.ok(knownFlags().some((f) => f.id === 'debug'));
});
