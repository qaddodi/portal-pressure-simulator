// Doppler aliasing (20 Oct, Mohammad's pick 2 from the Doppler papers): a slide's `scale` fixes the velocity scale at ± that many
// cm/s, the Nyquist limit, so a faster spectrum wraps round to the other side of the baseline, as a pulsed scanner shows it
// (Ferraioli, EFSUMB; Meola et al., J Vasc Access 2021). `baseline` moves the baseline with the same span. Opt-in: a slide
// that sets neither fits its scale to the signal as before, and no built-in deck sets them (deck-instruments.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMO_ALL } from '../src/ui/test-decks/demo-all-new-visuals.js';

const doppler = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');

test('a fixed scale holds the Nyquist limit either side of the baseline, the span twice the limit', () => {
  // (scale is the dominant side's reach, so pxPerV = (baseF ≥ 0.5 ? baseY : H − baseY) / scale = H / (2 × limit))
  assert.match(doppler, /if \(fixed\) \{ baseF = fixed\.base; scale = 2 \* fixed\.nyq \* Math\.max\(baseF, 1 - baseF\); settleAt = tNow; \}/);
  for (const base of [0.5, 0.15, 0.85]) {
    const nyq = 80, H = 300, scale = 2 * nyq * Math.max(base, 1 - base), baseY = H * base;
    const pxPerV = (base >= 0.5 ? baseY : H - baseY) / scale;
    assert.ok(Math.abs(H / pxPerV - 2 * nyq) < 1e-9, `baseline ${base}: span ${H / pxPerV}`);
  }
  assert.match(doppler, /span: fixed \? H \/ pxPerV : 0, topV: baseY \/ pxPerV, botV: \(H - baseY\) \/ pxPerV/);
});

test('past the scale\'s end the spectrum also shows one span above and below; otherwise each line is drawn as before', () => {
  assert.match(doppler, /wraps = span > 0 && P > \(s > 0 \? g\.topV : g\.botV\);/);
  assert.match(doppler, /let S = power\(vel \* s\);[^\n]*\n\s+if \(wraps\) S \+= power\(\(vel \+ span\) \* s\) \+ power\(\(vel - span\) \* s\);/);
  // The alias of a true velocity v shows at v − span: 112 cm/s on a ±80 scale shows at −48, under the baseline.
  const span = 160, v = 112;
  assert.equal(v - span, -48);
});

test('the slide option is read once per slide, clamped, and cleared on a slide without it', () => {
  assert.match(doppler, /const next = nyq > 0 \? \{ nyq: clamp\(nyq, 5, 400\), base: Math\.round\(clamp\(Number\.isFinite\(b\) \? b : 0\.5, 0\.15, 0\.85\) \* 100\) \/ 100 \} : null;/);
  assert.match(doppler, /if \(next\?\.nyq !== fixed\?\.nyq \|\| next\?\.base !== fixed\?\.base\) \{ fixed = next; scale = null; baseF = null; \}/);
});

test('the test deck shows aliasing on a stent and its fix with the baseline moved down', () => {
  const by = Object.fromEntries(DEMO_ALL.slides.map((s) => [s.id, s]));
  assert.deepEqual([by.alias.tool.scale, by.alias.tool.baseline], [80, undefined]);
  assert.deepEqual([by['alias-fix'].tool.scale, by['alias-fix'].tool.baseline], [80, 0.85]);
  for (const id of ['alias', 'alias-fix']) assert.equal(by[id].tool.vessel, 'TIPS');
  assert.ok(DEMO_ALL.sections.at(-1)[1].slice(-2).join() === 'alias,alias-fix', 'added at the end, so no earlier slide number moves');
  assert.equal(DEMO_ALL.slides.at(-1).id, 'alias-fix');
});
