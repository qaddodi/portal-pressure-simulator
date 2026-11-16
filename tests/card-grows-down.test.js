// A card that grows keeps its top still (7d, play-test 16 Nov 2026: "The portal circulation" 11/11, Show answer re-centred the card and everything jumped 26 px).
// Root cause: .pz-panel is centred (top 50%, translate -50% -50%), so any growth moves its top up by half the growth. A card that holds the quick check keeps its
// open height (--pz-open-h, measured while the fit has every answer open) and hangs its top where that height centres: an answer then only lengthens it downward.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCss } from './split-src.js';

const css = appCss();
const js = readFileSync(new URL('../src/ui/presenter-zoom.js', import.meta.url), 'utf8');

test('a centred card that grows is hung from its open height, top fixed', () => {
  assert.match(css, /\.pz-panel\.pz-grows \{ top: calc\(50% - var\(--pz-open-h\) \/ 2\); translate: -50% 0; \}/);
  assert.match(js, /el\.style\.setProperty\('--pz-open-h', `\$\{readMetric\(el, 'offsetHeight'\)\}px`\)/, 'measured with every answer open');
  assert.match(js, /el\.classList\.toggle\('pz-grows', !!all\)/);
  assert.ok(js.indexOf("'--pz-open-h'") < js.indexOf("all.classList.remove('pzc-all')"), 'read before the answers are shut');
});

test('no other card is centred by a transform that its own growth would move (the teaching card hangs from a fixed top)', () => {
  const card = css.match(/\.pz\.pz-card:not\(\.stack\) \.pz-text \{([^}]*)\}/)?.[1] ?? '';
  assert.match(card, /top: calc\(var\(--pz-cm\) \+ var\(--pz-cp\)\); bottom: auto;/);
});
