import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('a selected vessel glows as a hovered one does, with no solid ring', () => {
  assert.doesNotMatch(stage, /\? F_SEL : 0/, 'the GPU ring with hard round ends is not drawn');
  assert.match(stage, /setGlowSrc\('sel', ids\.map\(/, 'every selected vessel takes the glow, not only the sinusoids');
  const sel = stage.match(/\{ id, col: null, amt: ([\d.]+), wide: ([\d.]+), dur: SEL_FADE \* 1000 \}/), hov = stage.match(/setGlowSrc\('hover'[^\n]*amt: ([\d.]+), wide: ([\d.]+)/);
  assert.ok(sel && hov);
  assert.ok(+sel[1] >= +hov[1] && +sel[2] > +hov[2] && +sel[2] <= 1.3, 'a little stronger and wider than the hover, within the band the shader allows');
  assert.match(stage, /const want = new Set\(\[\.\.\.\(vh\.id \? vhEdges\(vh\.id\) : \[\]\), \.\.\.vh\.sel\]\);/, 'its lumen brightens as a hovered one does, eased');
});

test('selecting and deselecting ease the vessel in and out of the dimmed network', () => {
  assert.match(stage, /if \(x\.back \|\| tier >= TIER_LIFT\) alpha \*= netA \+ \(1 - netA\) \* easeInOut\(/);
  assert.match(stage, /const on = \(x\.g\.classList\.contains\('hl'\) \|\| \(IVC_EDGES\.has\(x\.e\.id\) && /, 'only the cava is lifted when selected');
  assert.match(stage, /m\.selK !== selAKey\(\)/, 'the glow-only sync gives way while the selection eases (it does not write alpha)');
  assert.match(stage, /glowMemo\.selK = selAKey\(\);/);
});

test('the selected vessel eases back into the dimmed network toward its ends, with no hard round end', () => {
  const vg = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(vg, /export const TUBE_TEXELS = 13;/);
  assert.match(vg, /ssel\[s\] \*= \(t12\.y > 0\.5 \? smoothstep\(0\.0, fs, sv\[s\] \* Ls\) : 1\.0\) \* \(t12\.z > 0\.5 \? smoothstep\(0\.0, fs, \(1\.0 - sv\[s\]\) \* Ls\) : 1\.0\);/);
  assert.match(vg, /else if \(grp == 1\) \{ accN = over\(c, accN\); if \(wsel > 0\.0\) accT = over\(c \* wsel, accT\); \}/, 'its own share laid over the dimmed network');
  assert.match(vg, /grp == 1 \? mix\(netAlpha, 1\.0, wsel\)/, 'its blood stands out with it');
  assert.match(stage, /tubeData\.set\(kind === 'v' \? \[easeInOut\(sa\), selEnd\(id, x\.e\.from\), selEnd\(id, x\.e\.to\), 0\] : \[easeInOut\(sa\), 0, 0, 0\], o \+ 48\);/);
});
