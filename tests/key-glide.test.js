import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const tb = read('src/ui/topbar-motion.js'), morph = read('src/ui/legend-morph.js'), css = read('styles/app.css');

test('the lens pill glides its plate to a new key\'s width on the key\'s clock, hung from its right edge', () => {
  assert.doesNotMatch(tb, /KEYGLIDE|PLATEGLIDE|keyglide|plateglide/);
  // The glass moves onto a face of its own.
  assert.match(tb, /const row = bar\.querySelector\('\.sb-right'\);/);
  assert.match(tb, /row\.prepend\(f\); row\.classList\.add\('has-face'\);/);
  assert.match(tb, /\.sb-right > :not\(\.tb-face\)/, 'the face is not itself a glided item');
  // The plate changes width on the lens crossfade's own D_SURFACE / EASE_MOVE, from the old width, starting dw in when it hangs right.
  // (by plate pieces since the off-GPU gate: no width animates)
  assert.match(tb, /if \(face\) plateGlide\(face, hang \? t\.dw : 0, s\.w, n\.w, \{ duration: D_SURFACE, easing: EASE_MOVE \}\);/);
  assert.doesNotMatch(tb, /width: `\$\{s\.w\}px`/);
  assert.match(tb, /inRow\(el\) \? ROW_MOVE : BAR_MOVE/, 'the chips beside the key move with the plate');
  // The pill and the key move by how far their right edges moved.
  assert.match(tb, /t\.x \+= \(s\.x \+ s\.w - n\.x - n\.w\) - \(s\.x - n\.x\);/);
  assert.match(css, /\.topbar \.sb-right\.has-face \{ position: relative; isolation: isolate; background: transparent; box-shadow: none; overflow: visible; \}/);
  assert.match(css, /\.sb-right > \.tb-face \{ position: absolute; z-index: -1; left: 0; top: 0; bottom: 0; width: 100%; border-radius: inherit; background: var\(--glass\); box-shadow: var\(--shadow-pill\);/);
});

test('the old key stands where it stood when the pill hangs from its right edge', () => {
  assert.match(morph, /btn\.closest\?\.\('\.sb-right\.has-face'\) && Math\.abs\(r1\.right - r0\.right\) \+ \.5 < Math\.abs\(r1\.left - r0\.left\) \? r1\.width - r0\.width : 0/);
  assert.match(morph, /box0\.x \+= hung; if \(bar0\) bar0\.x \+= hung;/);
  assert.match(morph, /for \(const it of before\[kind\]\) if \(it\.r\) it\.r\.x \+= hung;/);
});
