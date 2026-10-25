// A marker label wider than its room on the Over time chart is never cut with an ellipsis: it wraps between words onto
// the rows below, the lines evened out ("Caudate lobe" over "carries the outflow" rather than a lone last word). width(t)
// measures a string. Returns the lines and the widest line's width, or null when a single word is wider than maxW.
export function wrapLabel(lab, maxW, width) {
  const words = lab.split(' ');
  if (words.some((wd) => width(wd) > maxW)) return null;
  const fill = (w) => {
    const out = [];
    for (const wd of words) {
      const tail = out.length ? `${out[out.length - 1]} ${wd}` : '';
      if (tail && width(tail) <= w) out[out.length - 1] = tail; else out.push(wd);
    }
    return out;
  };
  let lines = fill(maxW);
  if (lines.length > 1) for (let w = maxW - 4; w > 0; w -= 4) { const ev = fill(w); if (ev.length > lines.length || ev.some((l) => width(l) > w)) break; lines = ev; }
  return { lines, w: Math.max(...lines.map(width)) };
}
