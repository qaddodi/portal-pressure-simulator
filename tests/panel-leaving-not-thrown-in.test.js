// Outline to the first slide (Mohammad's recording, 19 Nov 2026: "cards appear randomly"): the outline's panel leaves for a words slide with pz-leave and is not hidden until its
// fade is done (textIn, panelGoTok). cardsIn read pz-leave as "waiting to come in" and, when it ran before that timer, threw the old outline back in beside the new words for a
// few frames. A panel that is going away is never brought in; only a visual slide's panel (which clears panelGoTok) is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { presenterSource } from './split-src.js';

const P = presenterSource();

test('cardsIn does not bring in a panel that is leaving for a words slide', () => {
  const i = P.indexOf('function cardsIn(at)');
  const body = P.slice(i, P.indexOf('// (A data card or panel coming in', i));
  assert.match(body, /if \(!panelGoTok\) cardIn\(ui\.panel, 'pz-leave'\);/);
  assert.doesNotMatch(body, /(?<!if \(!panelGoTok\) )cardIn\(ui\.panel/);
});

test('the leaving panel\'s token is set when it leaves for a words slide and cleared when a visual slide takes it back or its fade ends', () => {
  const q = presenterSource();
  assert.match(q, /const tok = live\.panelGoTok = \{\};/);
  assert.match(q, /live\.panelGoTok = null;\s*\/\/ \(a panel still fading out/);
  assert.match(q, /if \(live\.panelGoTok !== tok\) return; live\.panelGoTok = null;/);
});
