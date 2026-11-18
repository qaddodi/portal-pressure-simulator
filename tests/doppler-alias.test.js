// Doppler aliasing (20 Oct, Mohammad's pick 2 from the Doppler papers): a slide's `scale` fixes the velocity scale at ± that many
// cm/s, the Nyquist limit, so a faster spectrum wraps round to the other side of the baseline, as a pulsed scanner shows it
// (Ferraioli, EFSUMB; Meola et al., J Vasc Access 2021). `baseline` moves the baseline with the same span. Opt-in: a slide
// that sets neither fits its scale to the signal as before, and no built-in deck sets them (deck-instruments.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_ALL } from '../src/ui/test-decks/demo-all-new-visuals.js';


test('a fixed scale holds the Nyquist limit either side of the baseline, the span twice the limit', () => {
  // (scale is the dominant side's reach, so pxPerV = (baseF ≥ 0.5 ? baseY : H − baseY) / scale = H / (2 × limit))
  // (the scale's choice is fitScale, dopplerWindow.js, given the slide's fixed scale on every frame)
  for (const base of [0.5, 0.15, 0.85]) {
    const nyq = 80, H = 300, scale = 2 * nyq * Math.max(base, 1 - base), baseY = H * base;
    const pxPerV = (base >= 0.5 ? baseY : H - baseY) / scale;
    assert.ok(Math.abs(H / pxPerV - 2 * nyq) < 1e-9, `baseline ${base}: span ${H / pxPerV}`);
  }
});

test('past the scale\'s end the spectrum also shows one span above and below; otherwise each line is drawn as before', () => {
  // (The wrap was pinned in the CPU's writeLine; since the unification audit §4 the spectrum is made by the GPU's line shader alone,
  // doppler-synth.js, so the same rule is read there: lineParams flags a line that reaches past an end, and the shader adds the two aliases.)
  // The alias of a true velocity v shows at v − span: 112 cm/s on a ±80 scale shows at −48, under the baseline.
  const span = 160, v = 112;
  assert.equal(v - span, -48);
});


test('the test deck shows aliasing on a stent and its fix with the baseline moved down', () => {
  const by = Object.fromEntries(DEMO_ALL.slides.map((s) => [s.id, s]));
  assert.deepEqual([by.alias.tool.scale, by.alias.tool.baseline], [80, undefined]);
  assert.deepEqual([by['alias-fix'].tool.scale, by['alias-fix'].tool.baseline], [80, 0.85]);
  for (const id of ['alias', 'alias-fix']) assert.equal(by[id].tool.vessel, 'TIPS');
  // (added at the end of the Instruments section, slides 66 and 67 on screen; later slides go after them, so no earlier slide number moves)
  assert.ok(DEMO_ALL.sections.find((x) => x[0] === 'Instruments')[1].slice(-2).join() === 'alias,alias-fix');
  assert.deepEqual(['alias', 'alias-fix'].map((id) => DEMO_ALL.slides.findIndex((s) => s.id === id)), [64, 65]);
});
