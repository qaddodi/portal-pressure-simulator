// The glass's blur targets on a real GPU (Apple's Metal included): each is checked once as it is made or resized (its size within
// MAX_TEXTURE_SIZE, its framebuffer complete), and a blur whose target is not drawable is refused, so no card is drawn from an empty
// blur (the bare tint over nothing). Mohammad, 2 Nov 2026: "Fix by code."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
const body = (name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\n  }\n', i)); };

test('every blur target is checked as it is made: its size within the GPU\'s limit and its framebuffer complete', () => {
  assert.match(src, /glCap\(G, G\.MAX_TEXTURE_SIZE\)/, 'its limit from the context\'s record');
  assert.match(src, /fbComplete\(G, G\.FRAMEBUFFER, key, w, h\)/, 'completeness through the per-generation verdict (gl-state.js)');
  const st = body('step');
  assert.match(st, /st\.ok = fits\(G, st\.w, st\.h\) && complete\(G, `glass-step\$\{i\}`, st\.w, st\.h\)/);
  assert.match(st, /if \(!st\.ok\) \{ st\.w = 0; st\.h = 0; \}/, 'a target that failed is made again at the next ask');
});

test('a blur whose targets are not drawable is refused, never drawn from', () => {
  const hb = body('hostBlur'), pb = body('partBlur');
  assert.match(hb, /if \(!fits\(G, bw, bh\)\) \{ B\.size = ''; return false; \}/);
  assert.match(hb, /ok = ok && complete\(G, 'glass-blur', bw, bh\)/);
  assert.match(hb, /if \(!ok\) \{ B\.size = '';/);
  assert.match(hb, /if \(!st\.ok\) \{[^}]*return false; \}/);
  assert.match(pb, /if \(!st\.ok\) \{[^}]*return false; \}/);
});

test('the status is read only where a target is made or resized, never in a frame that reuses one', () => {
  const st = body('step');
  const grow = st.indexOf('if (w > st.w || h > st.h)'), check = st.indexOf('complete(G, ');
  assert.ok(grow >= 0 && check > grow, 'checked inside the resize');
  const hb = body('hostBlur');
  assert.ok(hb.indexOf('complete(G, ') > hb.indexOf('if (B.size !== '), 'checked inside the resize');
});
