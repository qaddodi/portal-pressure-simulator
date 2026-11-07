import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();

test('a selected vessel glows as a hovered one does, with no solid ring', () => {
  assert.doesNotMatch(stage, /\? F_SEL : 0/, 'the GPU ring with hard round ends is not drawn');
  assert.match(stage, /selGlowList\.push\(SEL_ENTRY\[ids\[i\]\]\);[^\n]*\n\s+setGlowSrc\('sel', selGlowList\);/, 'every selected vessel takes the glow, not only the sinusoids');
  assert.match(stage, /for \(const x of EV\) \{ const id = x\.e\.id; SEL_ENTRY\[id\] = SIN_EDGES\.has\(id\) \?/, 'one entry per vessel, made once');
  const sel = stage.match(/\{ id, col: null, amt: ([\d.]+), wide: ([\d.]+), dur: SEL_FADE \* 1000 \}/), hov = stage.match(/setGlowSrc\('hover'[^\n]*amt: ([\d.]+), wide: ([\d.]+)/);
  assert.ok(sel && hov);
  assert.ok(+sel[1] >= +hov[1] && +sel[2] > +hov[2] && +sel[2] <= 1.3, 'a little stronger and wider than the hover, within the band the shader allows');
  assert.match(stage, /const want = vhWant; want\.clear\(\);\n\s+if \(vh\.id\) vhAdd\(want, vh\.id\);\n\s+for \(const id of vh\.sel\) want\.add\(id\);/, 'its lumen brightens as a hovered one does, eased');
});

test('selecting and deselecting ease the vessel in and out of the dimmed network', () => {
  assert.match(stage, /if \(x\.back \|\| tier >= TIER_LIFT\) alpha \*= (?:live\.)?(?:live\.)?netA \+ \(1 - (?:live\.)?(?:live\.)?netA\) \* (?:live\.)?(?:live\.)?easeInOut\(/);
  assert.match(stage, /const on = IVC_EDGES\.has\(x\.e\.id\) && \(x\.sel \|\| vh\.selA\.get\(x\.e\.id\) > 0\) && !SIN_EDGES\.has\(x\.e\.id\);/, 'only the cava is lifted when selected');
  assert.match(stage, /m\.selK !== selAKey\(\)/, 'the glow-only sync gives way while the selection eases (it does not write alpha)');
  assert.match(stage, /gm\.selK = selAKey\(\);/);
});

test('the selected vessel eases back into the dimmed network toward its ends, with no hard round end', () => {
  const vg = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(vg, /export const TUBE_TEXELS = 13;/);
  assert.match(vg, /ssel\[s\] \*= \(t12\.y > 0\.5 \? smoothstep\(0\.0, fs, sv\[s\] \* Ls\) : 1\.0\) \* \(t12\.z > 0\.5 \? smoothstep\(0\.0, fs, \(1\.0 - sv\[s\]\) \* Ls\) : 1\.0\);/);
  assert.match(vg, /else if \(grp == 1\) \{ accN = over\(c, accN\); if \(wsel > 0\.0\) accT = over\(c \* wsel, accT\); \}/, 'its own share laid over the dimmed network');
  assert.match(vg, /grp == 1 \? mix\(netAlpha, 1\.0, wsel\)/, 'its blood stands out with it');
  // (Written texel by texel since 2 Nov 2026, colPass: no array per vessel per frame.)
  assert.match(stage, /tubeData\[o \+ 48\] = easeInOut\(sa\);\s*\/\/[^\n]*\n\s*if \(kind === 'v'\) \{ tubeData\[o \+ 49\] = selEnd\(id, x\.e\.from, false\); tubeData\[o \+ 50\] = selEnd\(id, x\.e\.to, true\); \} else \{ tubeData\[o \+ 49\] = 0; tubeData\[o \+ 50\] = 0; \}/);
});
