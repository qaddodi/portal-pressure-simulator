// Which slides carry the heart's rate and output on the heart's label (src/ui/heart-reading.js; the label layer draws the words).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, REGIONS } from '../src/ui/decks.js';
import { showsHeart, heartReadingOn } from '../src/ui/heart-reading.js';

test('a slide shows the heart when its camera has it in frame', () => {
  const yes = (s) => showsHeart(s, REGIONS);
  assert.ok(yes({}) && yes({ cam: 'fit' }), 'the whole figure');
  assert.ok(yes({ cam: 'route' }) && yes({ cam: 'heart' }) && yes({ cam: 'hepatic' }) && yes({ cam: 'varices' }), 'regions that hold it');
  assert.ok(!yes({ cam: 'portal' }) && !yes({ cam: 'spleen' }) && !yes({ cam: 'gut' }) && !yes({ cam: 'liver' }), 'regions that do not');
  assert.ok(!yes({ cam: 'lobule' }) && !yes({ cam: 'sinusoid' }), 'the liver\'s close-ups');
  assert.ok(yes({ cam: { on: ['PV_TRUNK'] } }) && !yes({ cam: { on: ['spleen'], near: 'spleen' } }), 'a by-name camera: its near region, or the route');
  assert.ok(yes({ view: 'circuit', cam: 'fit' }) && yes({ view: 'circuit', cam: 'heart' }) && !yes({ view: 'circuit', cam: 'portal' }), 'the circuit\'s regions');
  assert.ok(!yes({ visual: 'outline' }) && !yes({ cols: ['pv'] }), 'a whole-panel slide has no figure');
  let shown = 0;
  for (const d of DECKS) for (const s of d.slides) if (yes(s)) shown++;
  assert.ok(shown > 40, `most slides show it (${shown})`);
});

test('the heart label carries the reading unless the slide opts out or already holds the rate or output as a tile', () => {
  const on = (s) => heartReadingOn(s, REGIONS);
  assert.ok(on({ cam: 'fit' }));
  assert.ok(!on({ cam: 'fit', tiles: ['hr', 'pv'] }) && !on({ cam: 'fit', key: ['co'] }) && !on({ cam: 'fit', noHeartReading: true }) && !on({ cam: 'portal' }) && !on(null));
});
