// The before / after scrub (N9, Mohammad 3 Nov 2026): on a slide that counts its change from the slide before (delta, or lens 'since'), a slider in
// the data card eases the patient between the slide's earlier state (0) and its own (1), so the room sees exactly what moved. Letting go keeps the
// place; Next puts the slide's own state back (a slide's cards are built afresh, so the dot starts at 1).
//
// Nothing here draws: the slider is the one every card uses (slider-gl.js paints the track, fill and dot on the GPU), the figure follows the live
// model (the worker's 'scrub' blends the two precomputed snapshots; no easing clock, the dot is the blend), and the card's numbers and charts
// are painted from that model as a what-if slider's are (presenter.js scrubMove, scrubFollow).
import { h, paintRange, clamp } from './util.js';
import { liveText } from './live-text.js';
import { scrubWords } from './scrub-plan.js';

/** The slider's element. on(k, first): the dot moved (an input: every move of a drag, a key, a tap on the track); rest(k): it was let go. */
export function scrubEl(sp, on, rest) {
  const input = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 1, 'data-def': 1, 'aria-label': `Scrub from ${sp.from} to ${sp.to}` });
  const track = h('div', { class: 'range-wrap', style: { '--s': '1' } }, input);
  const where = liveText('output', 'pzi-v pz-scrub-v', [sp.from, sp.to, scrubWords(0.55, sp)], sp.to);
  let first = true;
  const paint = () => { const k = clamp(+input.value, 0, 1); paintRange(input, k); where.set(scrubWords(k, sp)); return k; };
  input.addEventListener('input', () => { const k = paint(); on(k, first); first = false; });
  input.addEventListener('change', () => rest(clamp(+input.value, 0, 1)));
  input.addEventListener('pointerup', () => input.blur());   // (a finished drag hands the arrow keys back to the slides)
  const el = h('div', { class: 'pz-wi pz-scrub', role: 'group', 'aria-label': 'Before and after' },
    h('span', { class: 'pzi-l' }, h('span', { class: 'pzi-k' }, 'Scrub'), where.el),
    h('div', { class: 'pzi-t' }, h('span', { class: 'pzi-e' }, sp.from), track, h('span', { class: 'pzi-e' }, sp.to)));
  return { el, input, where };
}
