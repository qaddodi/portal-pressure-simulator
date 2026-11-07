// A label label-gl draws holds only its name (review L3 P10). Its group keeps one hidden <text> whose aria-label is its words and a clear
// rect over its box for the pointer; its pieces' places, sizes and words are numbers on its record (b.geo, which label-gl.js describeBlock
// reads), and their styles are read from one sample per look id: a hidden group of the same pieces, with no words, kept under the labels
// and made between frames the first time a look is wanted. The full SVG build (stage-label-layer.js blockKids) makes the same pieces from
// the same list (kidSpec), so the GPU's picture of a label is the one its full build would give.
import { restPass } from './rest-pass.js';
import { s } from './util.js';

/** Where a label's lines start, across its box. */
export const textX = (it) => (it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : it.swatch ? 7 : 0);
/** A label's pieces as they are made: each one's tag and attributes, in the order they stand in the label (its swatch, pill, hit area,
 *  then a text per line, a tspan per run). */
export function kidSpec(it, LINE_H, fontPx, labelK) {   // alloc-rare: between frames, as a label's pieces are made
  const out = [];
  // (A label's pill has 6 px corners, the cards' tile family; only a numbered marker, a round chip, takes its full height: it.chip.)
  if (it.bg) out.push({ tag: 'rect', at: { class: 'lb-bg', x: -it.padX, y: -it.padY, width: it.w + 2 * it.padX, height: it.h + 2 * it.padY, rx: it.chip ? (it.h + 2 * it.padY) / 2 : 6 } });
  // A clickable caption is a larger target than its small letters.
  if (it.hit) out.push({ tag: 'rect', at: { class: 'lb-hit', x: -10, y: -8, width: it.w + 20, height: it.h + 16, rx: 8 } });
  let y = 0;
  for (const line of it.lines) {
    const lh = LINE_H(line);
    out.push({ tag: 'text', at: { x: textX(it), y: y + lh * 0.78, 'text-anchor': it.align === 'end' ? 'end' : it.align === 'middle' ? 'middle' : 'start' },
      runs: line.map((r, i) => { const a = { class: r.cls || '', 'font-size': +fontPx(r.size).toFixed(2), 'font-weight': r.weight || 500 }; if (i) a.dx = +((r.gap ?? 3) * labelK).toFixed(2); if (r.track) a['letter-spacing'] = `${r.track}em`; return a; }) });
    y += lh;
  }
  if (it.swatch) out.unshift({ tag: 'rect', at: { class: 'lb-sw', x: it.align === 'end' ? it.w - 3 : 0, y: 1, width: 3, height: Math.max(8, it.h - 2), rx: 1.5 } });
  return out;
}
export const kidEl = (k) => { const el = s(k.tag, k.at); if (k.runs) for (const a of k.runs) el.append(s('tspan', a)); return el; };
/** Its accessible name: its words, run after run, one space between. */
export function wordsOf(it) {
  let o = '';
  for (const line of it.lines) for (const r of line) { const t = r.t == null ? '' : String(r.t).replace(/\s+/g, ' ').trim(); if (t) o = o ? o + ' ' + t : t; }
  return o;
}
/** Its name and pointer target, for its group, and its pieces as numbers on b (b.geo, b.pick, b.ax). */
export function leanKids(b, spec, it) {
  const parts = [];
  let t0 = -1, ib = -1, isw = -1;
  for (const k of spec) {
    const a = k.at;
    if (k.tag === 'rect') { if (a.class === 'lb-bg') ib = parts.length; else if (a.class === 'lb-sw') isw = parts.length; parts.push({ x: a.x, y: a.y, w: a.width, h: a.height, rx: a.rx }); continue; }
    if (t0 < 0) t0 = parts.length;
    parts.push({ x: a.x, y: a.y, t: k.runs.map(() => ''), dx: k.runs.map((r) => r.dx || 0) });
  }
  b.geo = { parts, box: { x: 0, y: 0, width: 0, height: 0 }, t0, ib, isw };
  b.pick = s('rect', { class: 'lb-pick' });
  b.ax = s('text', { class: 'lb-ax', 'aria-label': wordsOf(it) });
  return [b.pick, b.ax];
}
// (A number on its record: written, and the change said, only when it differs.)
const putN = (o, k, v) => { if (o[k] === v) return false; o[k] = v; return true; };
/** Its words onto its record, and its name when they changed; true when they did. */
export function leanWords(b, it, setA) {
  const parts = b.geo.parts;
  let li = b.geo.t0, said = false;
  for (const line of it.lines) {
    const q = parts[li++];
    for (let j = 0; j < line.length; j++) { const v = line[j].t, t = typeof v === 'string' ? v : v == null ? '' : String(v); if (q.t[j] !== t) { q.t[j] = t; said = true; } }   // alloc-rare: String only for a value that is not text
  }
  if (said) setA(b.ax, 'aria-label', wordsOf(it));
  return said;
}
/** The numbers the full build's blockRest writes (its lines' start, its pill's size, its swatch's place) onto its record, its box (a focus
 *  ring's) and its pointer's rect, over its laid-out box with its padding and its hit area if it has one; true when a drawn one changed. */
export function leanRest(b, it, setA) {
  const G = b.geo, P = G.parts, tx = textX(it);
  let ch = false;
  for (let i = G.t0; i >= 0 && i < P.length; i++) if (putN(P[i], 'x', tx)) ch = true;
  if (G.ib >= 0) { if (putN(P[G.ib], 'w', it.w + 2 * it.padX)) ch = true; if (putN(P[G.ib], 'h', it.h + 2 * it.padY)) ch = true; }
  if (G.isw >= 0 && putN(P[G.isw], 'x', it.align === 'end' ? it.w - 3 : 0)) ch = true;
  let x0 = 0, y0 = 0, x1 = it.w, y1 = it.h;
  for (let i = 0; i < P.length; i++) { const q = P[i]; if (q.t) continue; if (q.x < x0) x0 = q.x; if (q.y < y0) y0 = q.y; if (q.x + q.w > x1) x1 = q.x + q.w; if (q.y + q.h > y1) y1 = q.y + q.h; }
  const B = G.box;
  if (putN(B, 'x', x0) | putN(B, 'y', y0) | putN(B, 'width', x1 - x0) | putN(B, 'height', y1 - y0)) ch = true;
  const px0 = Math.min(x0, -it.padX), py0 = Math.min(y0, -it.padY);
  setA(b.pick, 'x', px0); setA(b.pick, 'y', py0); setA(b.pick, 'width', Math.max(x1, it.w + it.padX) - px0); setA(b.pick, 'height', Math.max(y1, it.h + it.padY) - py0);
  return ch;
}
/** The samples, one per look id: get(look, it, b) gives the look's sample, or asks for it between frames (b's writer told once it is in). */
export function createSamples({ late, lateQueue, pool, told, spec, max = 400 }) {
  const samples = new Map(), want = new Map(), wait = new Set();
  let root = null, ask = 0;
  function sampleOf(it) {
    const k = it.key, i0 = k.indexOf(':'), i1 = i0 < 0 ? -1 : k.indexOf(':', i0 + 1);
    // (Its key's family only, which the stylesheet selects some by, app.css [data-key^="n:TIPS:"]: label-gl.js copies the label's own classes and style over it as it reads.)
    const g = s('g', { class: 'lb ' + it.cls, 'data-key': k.slice(0, i1 >= 0 ? i1 + 1 : i0 + 1) });
    const kids = spec(it).map(kidEl);
    let n = 0;
    for (const el of kids) {
      if (el.getAttribute('class') === 'lb-sw') el.setAttribute('fill', it.swatch);
      if (el.tagName !== 'text') continue;
      const line = it.lines[n++];
      for (let j = 0; j < el.children.length; j++) if (line[j]?.fill) el.children[j].style.fill = line[j].fill;
    }
    g.append(...kids);
    return g;
  }
  function build() {
    ask = 0;
    if (!root) { root = s('g', { class: 'lb-samples', display: 'none', 'aria-hidden': 'true' }); late('label', root); }
    if (samples.size + want.size > max) {   // (too many looks kept: all made again, as they are wanted)
      for (const g of samples.values()) g.remove();
      samples.clear();
      for (const b of pool.values()) if (b.lean && b.pos && b.it) { want.set(b.pos.look, b.it); wait.add(b); }
    }
    for (const [look, it] of want) if (!samples.has(look)) { const g = sampleOf(it); root.append(g); samples.set(look, g); }
    want.clear();
    lateQueue.now();
    for (const b of wait) if (b.lean && b.pos) { b.pos.sample = samples.get(b.pos.look) || null; told(b.g); }
    wait.clear();
  }
  return {
    get(look, it, b) {
      const g = samples.get(look);
      if (g) return g;
      if (!want.has(look)) want.set(look, it);
      wait.add(b);
      if (!ask) ask = restPass(build);
      return null;
    },
  };
}
