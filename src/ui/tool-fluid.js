// Deck visuals, package G, V27: the fluid balance on a slide's data card, tool { kind: 'fluid' } (forces: true adds the forces
// across the sinusoid wall; caveat: true always shows the line that the model has no kidneys).
// Two flat bars on one scale: the lymph made (the liver's and the gut's, stacked) against what is drained (what the
// lymphatics carry away plus what the belly takes back). What is made beyond what is drained, in the ascites colour, is the
// day's build-up; a dashed outline past the lymphatics' share is the room they still have. These are the model's own terms
// (engine.js starling), read from the slide's fingerprint at rest and from the live model while a time-lapse, a what-if or a
// compare button moves it.

import { h, fmt, clamp } from './util.js?v=8813192ea2';
import { NODES } from '../engine/topology.js?v=4044766e96';
import { store } from './store.js?v=31ee79b6ab';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const num = (x) => (Number.isFinite(+x) ? +x : null);

/** The fluid balance (mL/min) from a fingerprint (worker-core.js: hepLymph, splLymph, lymphCap, lymphOver, lymphBack, lymphNet)
 *  or from a live frame's metrics (metrics.ascites: hepLymph, splLymph, lymphCap, ratePerDay), or null when it has none.
 *  made = liver + gut; carried = what the lymphatics carry (made, up to their capacity); back = what the belly takes back;
 *  drained = carried + back; net = made − drained, the ascites made (negative while it shrinks). */
export function fluidOf(src) {
  if (!src) return null;
  let hep, spl, cap, over, back, net;
  if (src.ascites) {
    const a = src.ascites;
    hep = num(a.hepLymph); spl = num(a.splLymph); cap = num(a.lymphCap);
    if (hep == null || spl == null || cap == null || num(a.ratePerDay) == null) return null;
    over = Math.max(0, hep + spl - cap); net = a.ratePerDay / 1440; back = over - net;
  } else {
    hep = num(src.hepLymph); spl = num(src.splLymph); cap = num(src.lymphCap); over = num(src.lymphOver); back = num(src.lymphBack); net = num(src.lymphNet);
    if ([hep, spl, cap, over, back, net].some((x) => x == null)) return null;
  }
  const made = hep + spl, carried = Math.min(made, cap), drained = carried + back;
  return { hep, spl, made, cap, carried, spare: Math.max(0, cap - made), over, back, drained, net, perDay: net * 1440 };
}

/** The forces across the sinusoid wall (mmHg), as the engine's Starling step weighs them (engine.js starling): the pressure
 *  pushing fluid out (the sinusoids' pressure, a mix of the two lobes' sinusoids and central veins, less the pressure in the
 *  belly) against the blood's protein pulling it back in (the oncotic gap across the wall, times its reflection coefficient).
 *  The liver's lymph is 0.5 + 0.45 × the push beyond the pull and 0.75 (tests/deck-instruments.test.js checks it against the engine). */
export function sinusoidForces(P, params, iap) {
  if (!P || !params) return null;
  const at = (id) => P[NI[id]];
  const out = 0.6 * (0.7 * at('SIN_R') + 0.3 * at('CV_R')) + 0.4 * (0.7 * at('SIN_L') + 0.3 * at('CV_L')) - (iap ?? 5);
  const pic = 25 * ((params.albumin ?? 4) / 4), sig = 0.1 + 0.5 * (params.cirrhosis ?? 0), pull = sig * (pic - pic * (1 - sig) * 0.9);
  return Number.isFinite(out) && Number.isFinite(pull) ? { out, pull } : null;
}

/** The forces at a slide's state, from its fingerprint (worker-core.js: the liver's lymph and the albumin; the cirrhosis from
 *  the slide's params): the push read back from the engine's own liver lymph, which it sets (0.5 + 0.45 × the push beyond the
 *  pull and 0.75), so every screen shows the same number for the same slide, whatever the breath at the moment. null where
 *  the push is below that threshold (the lymph is at its floor and does not tell the push); the live frames show it then. */
export function pinnedForces(fp, params) {
  if (!fp || !params || !Number.isFinite(fp.hepLymph) || fp.hepLymph <= 0.5 + 1e-9) return null;
  const pic = 25 * ((fp.salb ?? params.albumin ?? 4) / 4), sig = 0.1 + 0.5 * (params.cirrhosis ?? 0), pull = sig * (pic - pic * (1 - sig) * 0.9);
  return { out: (fp.hepLymph - 0.5) / 0.45 + pull + 0.75, pull };
}

/** The bars' segments, as fractions of the scale they share (the largest of made, drained and the lymphatics' capacity). */
export function fluidBars(f) {
  const top = Math.max(f.made, f.drained, f.cap, 0.1) * 1.04, w = (x) => clamp(x / top, 0, 1);
  return { liver: w(f.hep), gut: w(f.spl), carried: w(f.carried), back: w(f.back), build: w(Math.max(0, f.net)), spare: w(f.spare) };
}

/** The line under the bars. */
export function fluidWords(f) {
  const d = Math.round(Math.abs(f.perDay) / 10) * 10;
  if (f.net > 0 && d >= 10) return `Ascites builds by about ${d} mL a day.`;
  if (f.net < 0 && d >= 10) return `Ascites shrinks by about ${d} mL a day.`;
  return f.over > 0.005 ? 'Ascites holds steady: the belly takes back the overflow.' : 'No ascites builds: the lymphatics carry it all.';
}

const mlMin = (x) => fmt(Math.max(0, x), x < 10 ? 1 : 0);

export function createFluid() {
  const seg = (cls, label) => h('i', { class: `gf-seg ${cls}`, title: label });
  const S = { liver: seg('gf-liver', 'Liver lymph'), gut: seg('gf-gut', 'Gut lymph'), carried: seg('gf-carried', 'Carried by the lymphatics'),
    back: seg('gf-back', 'Taken back by the belly'), build: seg('gf-build', 'Builds up as ascites'), spare: seg('gf-spare', 'Room the lymphatics still have') };
  const val = () => h('b', { class: 'gf-v' });
  const vMade = val(), vDrain = val();
  const row = (name, v, ...segs) => h('div', { class: 'gf-row' }, h('span', { class: 'gf-name' }, name), h('span', { class: 'gf-bar' }, ...segs), v);
  const unit = h('span', { class: 'gf-unit' }, 'mL/min');
  const words = h('p', { class: 'gf-words' });
  const key = h('div', { class: 'gf-key', 'aria-hidden': 'true' },
    ...[['gf-liver', 'Liver'], ['gf-gut', 'Gut'], ['gf-carried', 'Lymphatics'], ['gf-back', 'Taken back'], ['gf-build', 'Ascites']].map(([c, t]) => h('span', {}, h('i', { class: `gf-sw ${c}` }), t)));
  // The forces across the sinusoid wall, a thin row each (forces: true).
  const fOut = h('i', { class: 'gf-seg gf-push' }), fIn = h('i', { class: 'gf-seg gf-pull' }), vOut = val(), vIn = val();
  const forces = h('div', { class: 'gf-forces' },
    h('div', { class: 'gf-row gf-thin' }, h('span', { class: 'gf-name' }, 'Pushing out'), h('span', { class: 'gf-bar' }, fOut), vOut),
    h('div', { class: 'gf-row gf-thin' }, h('span', { class: 'gf-name' }, 'Pulling in'), h('span', { class: 'gf-bar' }, fIn), vIn),
    h('span', { class: 'gf-unit' }, 'mmHg, across the sinusoid wall'));
  const caveat = h('p', { class: 'gf-caveat' }, 'The model has no kidneys: diuretics act here only on the fluid the belly takes back, and its rates are the model\u2019s own, not clinical figures.');
  const el = h('div', { class: 'gf', role: 'img' },
    h('div', { class: 'gf-bars' }, row('Made', vMade, S.liver, S.gut), row('Drained', vDrain, S.carried, S.back, S.build, S.spare), unit),
    key, words, forces, caveat);
  const set = (n, t) => { if (n.textContent !== t) n.textContent = t; };
  const width = (n, x) => { const v = `${(x * 100).toFixed(2)}%`; if (n.style.width !== v) n.style.width = v; };
  let opts = {}, pinned = null;
  function paint(f) {
    if (!f) return;
    const b = fluidBars(f);
    for (const k of Object.keys(S)) width(S[k], b[k]);
    const room = b.spare > 0.004 ? '' : 'hidden';   // (no room left: its dashed outline goes, not a sliver of it)
    if (S.spare.style.visibility !== room) S.spare.style.visibility = room;
    // (the build-up fills the drained bar out to the made bar's end: what is made and not drained)
    set(vMade, mlMin(f.made)); set(vDrain, mlMin(f.drained));
    set(words, fluidWords(f));
    el.setAttribute('aria-label', `Fluid balance: ${mlMin(f.made)} mL/min of lymph made (liver ${mlMin(f.hep)}, gut ${mlMin(f.spl)}), ${mlMin(f.drained)} drained. ${fluidWords(f)}`);
  }
  // (Live, the push swings with each breath, as the belly's pressure does: eased over a few seconds, so it reads the
  // breath's middle, not its moment. At rest the slide's own state sets both.)
  let fAvg = null, fAt = 0, fPin = null;
  function paintForces(fr) {
    if (!opts.forces) return;
    let fo = fPin;
    if (!fo) {
      const raw = sinusoidForces(fr?.Pf || fr?.P, store.get().params, fr?.metrics?.ascites?.iap);
      if (!raw) return;
      const now = performance.now(), a = fAvg ? 1 - Math.exp(-Math.min(1, (now - fAt) / 1000) / 3) : 1;
      fAt = now; fAvg = fAvg ? { out: fAvg.out + a * (raw.out - fAvg.out), pull: fAvg.pull + a * (raw.pull - fAvg.pull) } : raw;
      fo = fAvg;
    }
    const top = Math.max(fo.out, fo.pull, 1) * 1.04;
    width(fOut, clamp(fo.out / top, 0, 1)); width(fIn, clamp(fo.pull / top, 0, 1));
    set(vOut, fmt(Math.max(0, fo.out), 1)); set(vIn, fmt(fo.pull, 1));
  }
  return {
    el,
    // The slide's own state at rest (a fingerprint with the fluid terms); a live one without them (a time-lapse or a what-if,
    // presenter liveFp) hands the bars to the live model's frames until the slide's state is pinned again.
    pin(fp) { const f = fluidOf(fp); pinned = f; if (f) paint(f); fPin = f ? pinnedForces(fp, store.get().params) : null; if (fPin) paintForces(null); },
    update(fr) {
      if (!pinned) paint(fluidOf(fr?.metrics));
      paintForces(fr);
    },
    // (The caveat shows on a slide whose patient is on diuretics, or whose compare buttons give them, or that asks for it:
    // set once for the slide, so the card keeps its size while a button is pressed.)
    configure(t, ctx) {
      opts = t || {};
      forces.hidden = !opts.forces;
      caveat.hidden = !(opts.caveat || ctx?.params?.diuretics || ctx?.slide?.compare?.some?.((c) => c?.params?.diuretics));
    },
  };
}
