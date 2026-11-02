// R16 (2 Nov 2026): a chart's still parts are kept as a GPU picture, and the Doppler's history is a bounded queue trimmed in chunks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tg = readFileSync(new URL('../src/ui/trace-gl.js', import.meta.url), 'utf8');
const dp = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');

test('the drawer keeps a still layer by its signature, drawn into its own texture, and ?chartkeep=0 draws it every frame', () => {
  assert.match(tg, /export const chartKeepOff = \(search\) => \/\[\?&\]chartkeep=0\\b\//);
  assert.match(tg, /keep\(name, sig, draw\) \{\n\s+if \(!KEEP \|\| !inFrame \|\| !P \|\| clipR \|\| clipOn \|\| outFb\) \{ draw\(\); return false; \}/);
  assert.match(tg, /if \(e\.sig !== sig\) \{\n\s+outFb = e\.fb;/);
  // (every return from a coverage pass goes back to the frame's own target, the canvas or the layer being drawn)
  assert.doesNotMatch(tg.slice(tg.indexOf('function outline('), tg.indexOf('function flush(')), /bindFramebuffer\(gl\.FRAMEBUFFER, null\)/);
});

test('the Doppler keeps its velocity scale as a layer and trims its history in chunks (?histring=0 off)', () => {
  assert.match(dp, /keepLayer\(ctx, 'scale', `\$\{w\}x\$\{hh\}\|\$\{scale\}\|\$\{baseY\}/);
  assert.equal(dp.split('if (cut && (!HIST_RING || cut >= 256 || cut * 4 >= buf.length)) buf.splice(0, cut);').length - 1, 2);
});
