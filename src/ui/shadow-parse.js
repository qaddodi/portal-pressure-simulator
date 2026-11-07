// A computed box-shadow read into its layers (plate-gl.js draws them): no DOM.

/** The box-shadows of a computed value, outermost last: [{ c: colour text, x, y, blur, spread, inset }]. */
export function shadowsOf(v) {
  if (!v || v === 'none') return [];
  const out = [];
  let depth = 0, from = 0;
  const parts = [];
  for (let i = 0; i <= v.length; i++) {
    const ch = v[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if ((ch === ',' && depth === 0) || i === v.length) { parts.push(v.slice(from, i).trim()); from = i + 1; }
  }
  for (const p of parts) {
    const col = /(rgba?\([^)]*\)|color\([^)]*\)|#[\da-f]{3,8})/i.exec(p)?.[1];
    if (!col) return null;
    const n = p.replace(col, '').replace(/\binset\b/, '').match(/-?[\d.]+(px)?/g)?.map(parseFloat) || [];
    out.push({ c: col, x: n[0] || 0, y: n[1] || 0, blur: n[2] || 0, spread: n[3] || 0, inset: /\binset\b/.test(p) });
  }
  return out;
}
