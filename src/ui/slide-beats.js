// Camera beats and a time-lapse's push: two opt-in ways for one slide to move the camera more than once. No DOM here: what a
// beat shows and what is wrong with a slide's fields (presenter.js makes the moves; tests/slide-beats.test.js checks every deck).
//
//   lapse: { seconds: 10, cam: 'varices' }     the camera pushes slowly to that framing while the days run (any anatomy cam)
//   beats: [{ cam: 'liver', glow: ['SIN_RR'] }] after the slide itself, up to two more views of the figure, one per Next
//
// A beat changes only the figure: where the camera is and what it calls out there (BEAT_KEYS). The words, the data card and the
// model stay as they are through the beats. A field a beat leaves out keeps the slide's (or null clears it: mark: null). Next goes
// through the beats before the next slide, Back the other way; a slide opened any other way (Back from the next one, a jump, a
// reload) shows its last beat, so it stands with its whole point made.

import { camProblems } from './cam-frame.js?v=3c321f5f7f';

export const BEAT_KEYS = ['cam', 'zoom', 'kMax', 'clear', 'labels', 'terms', 'mark', 'marks', 'sites', 'glow', 'glowSeq', 'steps', 'spot', 'callout'];
export const MAX_BEATS = 3;   // (the slide and two more)
const LOBULE = /^(lobule|sinusoid)/;

/** How many views of the figure a slide has: 1, or 1 + its beats. */
export const beatCount = (s) => (Array.isArray(s?.beats) && s.beats.length && !s.visual ? 1 + s.beats.length : 1);

/** The slide as beat `b` shows it (0: the slide itself); each beat builds on the one before. */
export function beatView(s, b) {
  const n = beatCount(s);
  if (!b || n === 1) return s;
  let v = { ...s };
  for (let i = 0; i < Math.min(b, n - 1); i++) v = { ...v, ...s.beats[i] };
  return v;
}

/** What is wrong with a slide's push (lapse.cam). */
export function lapseCamProblems(s, regions) {
  const pc = s?.lapse?.cam;
  if (pc === undefined) return [];
  const out = [];
  if (typeof pc === 'string' && LOBULE.test(pc)) out.push('lapse.cam frames the anatomy: no lobule or sinusoid');
  else out.push(...camProblems(pc, regions).map((p) => `lapse.cam: ${p}`));
  if (s.cath || s.procedure) out.push('lapse.cam: a catheter or procedure slide drives its own camera');
  if (s.view === 'circuit') out.push('lapse.cam: the circuit is always shown whole');
  if (typeof s.cam === 'string' && LOBULE.test(s.cam)) out.push('lapse.cam: the slide opens in the liver; a push is on the anatomy');
  return out;
}

/** What is wrong with a slide's beats. */
export function beatProblems(s, regions) {
  if (s?.beats === undefined) return [];
  if (!Array.isArray(s.beats) || !s.beats.length) return ['beats lists one view or more'];
  const out = [];
  if (s.beats.length > MAX_BEATS - 1) out.push(`at most ${MAX_BEATS} beats in all: the slide and ${MAX_BEATS - 1} more`);
  for (const [k, why] of [['lapse', 'a time-lapse'], ['cath', 'a catheter'], ['procedure', 'a procedure'], ['scales', 'a scale switch'], ['visual', 'a visual']]) {
    if (s[k]) out.push(`no beats on a slide with ${why}`);
  }
  if (s.view === 'circuit') out.push('no beats in the circuit');
  const side = (c) => (typeof c === 'string' && LOBULE.test(c) ? 'liver' : 'anatomy');
  const home = side(s.cam);
  s.beats.forEach((b, i) => {
    const at = `beat ${i + 2}`;
    if (!b || typeof b !== 'object' || Array.isArray(b)) { out.push(`${at} is not an object`); return; }
    for (const k of Object.keys(b)) if (!BEAT_KEYS.includes(k)) out.push(`${at}: a beat changes only the figure, not ${k}`);
    if (b.cam !== undefined) {
      if (side(b.cam) !== home) out.push(`${at}: every beat stays on one side, all on the anatomy or all in the liver`);
      else if (home === 'anatomy') out.push(...camProblems(b.cam, regions).map((p) => `${at}: ${p}`));
    }
  });
  return out;
}
