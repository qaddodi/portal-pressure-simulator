// How a stent opens and closes in the model: through its width, never by a switch (16 Nov 2026, Mohammad: "the TIPS comes in and out of
// existence, pops"). Shared by the engine (a live change, easeParams), the worker's change of patient (morphAt) and the figure, which
// draws the mesh over the shunt only while the shunt is open.

export const STENT_CLOSED_D = 0.05;   // (mm: how narrow a stent eases to, or from; a width of nothing would divide by zero in stentConductance)
/** A stent's record (tips, dips: { on, d }) a share k of the way from a to b in an eased change of patient: its width eases, from or to
 *  nothing when one side has no stent, so its flow, its drawn width and its mesh come and go together, never at the halfway step. */
export function stentMix(a, b, k) {
  const x = a?.on ? a.d : 0, y = b?.on ? b.d : 0;
  if (!a || !b || !(x || y) || k <= 0) return k < 0.5 ? a : b;
  if (k >= 1) return b;
  return { ...(b.on ? b : a), d: Math.max(STENT_CLOSED_D, x + (y - x) * k), on: true };
}
/** The width (mm) under which a stent no longer reads as one: half the narrowest the stent tool offers (6 mm). The mesh drawn over the shunt goes while the shunt is narrower. */
export const STENT_OPEN_D = 3;
/** Whether the shunt `k` (an edge's index) of frame `F` is open as a stent: the mesh is wanted only then, so it never outlasts the shunt, or stands on one that is shut. */
export const stentOpen = (F, k) => (F?.D?.[k] ?? 0) >= STENT_OPEN_D;
