import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The timeline bar (the event track) is gone: History is the one list of what happened. The row keeps
// play, the clock, jumps, History and Compare, so none of the track's pieces may come back by accident.
test('the timeline row has no event track', () => {
  const js = readFileSync(new URL('../src/ui/timeline.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  for (const cls of ['tl-track', 'tl-rail', 'tl-marks', 'tl-core', 'tl-tags']) {
    assert.ok(!js.includes(cls), `timeline.js still builds ${cls}`);
    assert.ok(!css.includes(`.${cls}`), `app.css still styles ${cls}`);
  }
  for (const cls of ['tl-time', 'tl-hist', 'tl-split']) assert.ok(js.includes(cls), `the row lost ${cls}`);
});
