// The figure part of the screen report: each vessel shown, its colour pair and what that colour means in the lens now, its width, flow direction,
// selection, stent and glow. No pixels: the rows are what the vessel painter (stage-tubes.js renderTubes) holds for the GPU row builder, read by the
// stage's `figureRows` accessor (sources.js); the model pressures are the frame's own (the ones the painter coloured from).
// THE ONE RULE: the colour a vessel should have is the painter's own colormap.js `pressureColor` over its own bin (qP, 0.5 mmHg). This file defines no colour ramp of its own. tests/screen-readers.test.js holds that.
import { edgeById } from '../../engine/topology.js';
import { pressureColor } from '../colormap.js';
import { COLOUR_BIN, qP } from '../colour-bin.js';

/** How many bins a held colour may stand from the bin its pressure is in now: the painter holds a bin until the pressure is 0.4 mmHg off it (stage-geohold.js qHold), and a frame's model pressure may be a beat ahead of the frame it coloured from. */
export const HOLD_BINS = 2;

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const nameOf = (id) => edgeById(id)?.label || id;

/** Whether `colour` is what the painter would give a vessel end at pressure `p` or a pressure up to HOLD_BINS bins either side of its bin (the hysteresis). */
export function pressureColourFits(colour, p, bins = HOLD_BINS) {
  if (!Number.isFinite(p)) return null;
  const q = qP(p);
  for (let i = -bins; i <= bins; i++) if (pressureColor(q + i * COLOUR_BIN) === colour) return true;
  return false;
}

/**
 * src: { lens: 'pressure' | 'drop' | 'flow' | 'velocity' | ..., morph: 0..1 (Anatomy to Circuit), view, glows: [[id, wide]], rows: [{ id, kind, art, from, to, w, col: [c0, c1] | null,
 *        opa, rev, sel, ghost, stent, p: [p0, p1] | null }] }
 * Returns JSON: { lens, morph, view, count, vessels: [...], glows }.
 */
export function readFigure(src) {
  const lens = src.lens || 'pressure';
  const vessels = (src.rows || []).map((r) => {
    const p = r.p ? [r2(r.p[0]), r2(r.p[1])] : null;
    const v = {
      id: r.id, name: nameOf(r.id), kind: r.kind, artery: !!r.art, from: r.from, to: r.to, width: r1(r.w ?? 0), colour: r.col ? [r.col[0], r.col[1]] : null,
      opacity: r2(r.opa ?? 1), reversed: !!r.rev, selected: !!r.sel, ghost: !!r.ghost, stent: !!r.stent, pressure: p, means: '', colourFits: null,
    };
    if (lens === 'pressure' && p && r.col) {
      v.means = `pressure ${p[0]} to ${p[1]} mmHg`;
      v.colourFits = pressureColourFits(r.col[0], p[0]) !== false && pressureColourFits(r.col[1], p[1]) !== false;
    } else v.means = lens === 'pressure' ? '' : `${lens} lens`;
    return v;
  });
  vessels.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    lens, morph: r2(src.morph ?? 0), view: src.view || null, count: vessels.length, vessels,
    glows: (src.glows || []).map(([id, wide]) => ({ id, wide: r2(wide) })),
  };
}

/** The part as sentences. */
export function figureLines(p, { detail = 'summary' } = {}) {
  const arts = p.vessels.filter((v) => v.artery).length, rev = p.vessels.filter((v) => v.reversed), sel = p.vessels.filter((v) => v.selected);
  const out = [`Figure: ${p.count} vessels shown (${arts} arteries), ${p.lens} lens, ${Math.round(p.morph * 100)}% of the way from Anatomy to Circuit.`];
  if (sel.length) out.push(`Selected: ${sel.map((v) => v.name).join(', ')}.`);
  if (rev.length) out.push(`Flow reversed in: ${rev.map((v) => v.name).join(', ')}.`);
  const off = p.vessels.filter((v) => v.colourFits === false);
  if (off.length) out.push(`Colour does not match its pressure: ${off.map((v) => `${v.name} (${v.means})`).join('; ')}.`);
  const st = p.vessels.filter((v) => v.stent);
  if (st.length) out.push(`Stent drawn in: ${st.map((v) => `${v.name} ${v.width} px wide`).join(', ')}.`);
  if (p.glows.length) out.push(`Glowing: ${p.glows.map((g) => g.id).join(', ')}.`);
  if (detail === 'full') for (const v of p.vessels) out.push(`${v.name} (${v.id}): ${v.width} px wide, ${v.colour ? v.colour.join(' to ') : 'no colour pair'}, ${v.means || p.lens}${v.opacity < 1 ? `, ${Math.round(v.opacity * 100)}% opaque` : ''}.`);
  return out;
}
/** The same as one block of text. */
export const figureText = (p, o) => figureLines(p, o).join('\n');
