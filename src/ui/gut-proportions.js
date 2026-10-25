// Extend the lower gut by 8%, keeping its upper attachments (y <= 600) in place.
// Shared by the artwork generator and the stage's outlines, covers and captions.
export const gutY = (y) => Math.round((y + Math.max(0, y - 600) * 0.08) * 10) / 10;

// The gut artwork uses absolute M/L/C/Q/Z paths: every coordinate is an x/y pair.
export function gutPath(d) {
  let axis = 0;
  return d.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, (v) => (++axis % 2 ? v : String(gutY(Number(v)))));
}
