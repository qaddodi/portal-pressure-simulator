// The fundal varices as drawn. Their channels (the short gastric feeder C2 and the gastrorenal shunt C5 that drains them) are
// sized by weeks of remodeling, but the varix itself follows the pressure now (the model's gastricVarix.d, 2 mm at rest up to
// about 8.5 mm in the gastric presets), so a fall in pressure left the drawing as it was while the Fundal varices card read
// "none" (carvedilol 8.5 → 5.5 mm and a TIPS 8.5 → 2.1 mm moved the drawn channel only 5 %). The drawing now follows the varix:
// the channels narrow, the feeder's strands fan out less and the whole plexus fades toward the faintest stack level. The two
// gastric presets (8.0 and 8.5 mm) are drawn exactly as before.

export const GV_CHANNELS = new Set(['C2', 'C5']);
export const GV_REST_MM = 2;       // a resting vein: the model's floor (radius 1 mm)
export const GV_FULL_MM = 8;       // the gastric presets' varices (8.0 and 8.5 mm): drawn as the channels are sized
export const GV_HOLD_MM = 0.5;     // the held step (as stage.js holds the overlays' varix size): a pulse across a rounding boundary moves nothing

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** How big the varix is, 0 (a resting vein) … 1 (8 mm and up). No reading (no frame yet): 1, drawn as before. */
export const gvSize = (d) => (Number.isFinite(d) ? clamp01((d - GV_REST_MM) / (GV_FULL_MM - GV_REST_MM)) : 1);

/**
 * The varix diameter held in steps: `held` ({ d }) keeps the last step and only moves once the input has clearly left it
 * (a quarter of a step beyond the middle), so a varix whose diameter pulses with the beat or the breath does not redraw
 * the plexus every frame. Returns the held diameter.
 */
export function gvHold(held, d) {
  if (!Number.isFinite(d)) return d;
  if (held.d == null || Math.abs(d - held.d) > GV_HOLD_MM * 0.75) held.d = Math.round(d / GV_HOLD_MM) * GV_HOLD_MM;
  return held.d;
}

/** The drawn width of a channel against the one its caliber gives (vesselPx of the channels' resting and full diameters: 3.5 to 9.4 px). */
export const gvWidthK = (size) => 0.4 + 0.6 * size;
/** How far the feeder's strands fan out from the vessel's line against their full spread. */
export const gvSpreadK = (size) => 0.55 + 0.45 * size;
/** The most opaque a channel may be (the stack levels run from 0.3 to 1). */
export const gvOpacity = (size) => 0.3 + 0.7 * size;
