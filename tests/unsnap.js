// The page's layout reads go through src/ui/layout-snap.js (plan 3.4): readBox(el) is el.getBoundingClientRect(), readMetric(el, 'offsetHeight')
// is el.offsetHeight, and so on, one for one. Tests that pin what a module reads, and when, read its source through unsnap(), which writes
// each read back as the browser call it stands for, so a pin keeps saying what is read (and a function lifted out of the source runs as is).
const CALL = {
  readBox: (a) => `${a[0]}.getBoundingClientRect()`, readRects: (a) => `${a[0]}.getClientRects()`, readCTM: (a) => `${a[0]}.getScreenCTM()`,
  readLocalCTM: (a) => `${a[0]}.getCTM()`, readBBox: (a) => `${a[0]}.getBBox(${a.slice(1).join(', ')})`, readLength: (a) => `${a[0]}.getTotalLength()`,
  readPoint: (a) => `${a[0]}.getPointAtLength(${a.slice(1).join(', ')})`, readAnims: (a) => `${a[0]}.getAnimations(${a.slice(1).join(', ')})`,
  readTiming: (a) => `${a[0]}.getComputedTiming()`, readVisible: (a) => `${a[0]}.checkVisibility(${a.slice(1).join(', ')})`,
  readInStroke: (a) => `${a[0]}.isPointInStroke(${a.slice(1).join(', ')})`, readInFill: (a) => `${a[0]}.isPointInFill(${a.slice(1).join(', ')})`,
  scrollInto: (a) => `${a[0]}.scrollIntoView(${a.slice(1).join(', ')})`, readStyle: (a) => `getComputedStyle(${a.join(', ')})`,
  readElAt: (a) => `document.elementFromPoint(${a.join(', ')})`, readElsAt: (a) => `document.elementsFromPoint(${a.join(', ')})`,
  readMetric: (a) => `${a[0]}.${a[1].slice(1, -1)}`,
};
const NAMES = new RegExp(`(?<![\\w.$])(${Object.keys(CALL).join('|')})\\(`, 'g');
// The arguments of the call whose '(' is at i: split at the top level's commas; returns [args, index after ')'].
function argsAt(s, i) {
  const out = []; let depth = 0, start = i + 1, q = null;
  for (let k = i + 1; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) { const last = s.slice(start, k).trim(); if (last || out.length) out.push(last); return [out, k + 1]; }
      depth--;
    } else if (c === ',' && depth === 0) { out.push(s.slice(start, k).trim()); start = k + 1; }
  }
  return null;
}
// (An argument made only of names, dots, calls and indexes needs no brackets round it.)
const bare = (a) => { let t = a, was; do { was = t; t = t.replace(/\([^()]*\)|\[[^[\]]*\]|'[^']*'|"[^"]*"/g, ''); } while (t !== was); return /^[\w$.]+$/.test(t); };
const wrap = (a) => (bare(a) ? a : `(${a})`);
export function unsnap(src) {
  let out = src;
  {
    out = out.replace(/^import \{[^}]*\} from '\.\/layout-snap\.js[^']*';\n/m, '');
    NAMES.lastIndex = 0;
    let m, res = '', at = 0;
    while ((m = NAMES.exec(out))) {
      const got = argsAt(out, m.index + m[1].length);
      if (!got) continue;
      const [a, end] = got;
      const inner = a.map((x) => unsnap(x));
      res += out.slice(at, m.index) + CALL[m[1]]([wrap(inner[0] ?? ''), ...inner.slice(1)]);
      at = end; NAMES.lastIndex = end;
    }
    out = res + out.slice(at);
  }
  return out;
}
