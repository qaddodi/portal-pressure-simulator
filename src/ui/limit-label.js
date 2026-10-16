// Where an HVPG cut-off's label starts on its dashed line. Each label sits on a 12 px plate at its own line's height; on a
// short lane two cut-offs (CSPH 10 and Can bleed 12) lie closer than that, and the second label went over the first. Its
// plate then starts 6 px past the right end of the one before, still on its own line, so both read in full.
export function limitLabelX(prev, y, x0) {
  if (prev && Math.abs(prev.y - y) < 12 + 2) return Math.max(x0, prev.x1 + 6);
  return x0;
}
