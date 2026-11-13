// A small preprocessor for the lint (glsl-lint.js follows no directives): resolves `#define NAME value`, `#if NAME`, `#if NAME == n`, `#if NAME != n`,
// `#else` and `#endif`, then replaces each defined name by its value. Enough for the vessel shader's builds (veins-gl.js vesselFS), which use nothing else.
export function preprocess(src) {
  const defs = new Map(), stack = [];
  const live = () => stack.every((s) => s.on);
  const val = (e) => {
    const m = e.trim().match(/^(\w+)\s*(==|!=)?\s*(\w+)?$/);
    if (!m) throw new Error(`#if ${e}: not a form the preprocessor follows`);
    const a = String(defs.get(m[1]) ?? m[1]);
    if (!m[2]) return Number(a) !== 0;
    const b = String(defs.get(m[3]) ?? m[3]);
    return m[2] === '==' ? a === b : a !== b;
  };
  const out = [];
  for (const line of src.split('\n')) {
    const d = line.match(/^\s*#\s*(\w+)\s*(.*)$/);
    if (d && d[1] !== 'version') {
      const [, k, rest] = d;
      if (k === 'if') { const outer = live(), v = outer ? val(rest) : false; stack.push({ on: v, was: v, outer }); }
      else if (k === 'else') { const t = stack[stack.length - 1]; t.on = t.outer && !t.was; }
      else if (k === 'endif') stack.pop();
      else if (k === 'define') { if (live()) { const m = rest.match(/^(\w+)\s+(\S+)/); defs.set(m[1], m[2]); } }
      else throw new Error(`#${k}: not a directive the preprocessor follows`);
      out.push('');
      continue;
    }
    out.push(live() ? line : '');
  }
  let text = out.join('\n');
  for (const [k, v] of defs) text = text.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
  return text;
}
