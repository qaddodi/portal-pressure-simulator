// How a card looks, judged by numbers (Mohammad, 19 Nov 2026: "there must be a way with like pure numbers"): contrast, crowding, spacing, palette, lettering
// and line length, from layout boxes and computed styles. No picture, no GPU. Two parts, like fit-rules.js and edge-rules.js: `readLook(io)` is ONE
// SELF-CONTAINED FUNCTION that runs in the page and returns plain JSON, `judgeLook(read, limits)` is a plain function of that JSON, so every threshold
// is a number in LIMITS that a test can show and a thread can tune.
//
// What each rule is, and what it cannot see:
//   contrast   the WCAG ratio of each text run's colour over what it sits on: the nearest box with a colour behind it, composited down to the page (the
//              teaching card's words sit on its glass, `.pz-shade`, which is read the same way). Needs 4.5 (3 for large lettering). A run over a
//              picture, a GPU-drawn glass or a gradient has no single colour behind it: it is left out and counted as `unresolved`, never guessed.
//   crowding   the share of a card its words take: the boxes of its lines added up over the card's own box, and the number of lines. A card past
//              either limit is too full to read at a glance.
//   spacing    the gaps between a card's blocks, one under the other: a gap that is a few px off its neighbours' (1 to 5 px, not a real change) is uneven,
//              and a padding or gap that is not on the spacing scale (--sp-1 to --sp-12) is off it.
//   align      blocks that stand 1 to 3 px off one another's left edge (a column) or top edge (a row): meant to line up, and do not.
//   palette    a text colour that is not one of the stylesheet's own colour tokens for the look on screen (so a stray hex written into a style shows).
//   lettering  a size outside the bounds (under 12 px is fit-rules.js's `small`; here: over the title's ceiling) and a body paragraph whose line is too long
//              or too short to read (characters per line, estimated from the box's width and the letter size).
// A card whose words are drawn by the GPU (chart ticks, GL words) has no DOM text for these to read: that is said, not skipped silently (`gl` in the read).

export const LIMITS = Object.freeze({
  contrast: 4.5,        // WCAG AA, normal lettering
  contrastLarge: 3,     // 24 px, or 18.66 px bold and over
  crowdShare: 0.55,     // the line boxes' area over the card's area
  crowdLines: 22,       // lines of words on one card
  gapJitter: 5,         // px: gaps between blocks that differ by more than 0 and no more than this are uneven
  alignJitter: 3,       // px: edges that differ by more than 0.5 and no more than this are misaligned
  titleMax: 44,         // px: the biggest lettering a card shows
  lineMin: 28,          // characters per line, a paragraph of three lines or more
  lineMax: 88,
  scale: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48],   // px: the spacing scale (--sp-1 to --sp-12 and the steps between that the stylesheet uses)
});

/** The page reader. io = { box(el), style(el), metric(el, key), lines?(el) }. */
export function readLook(io) {
  const vw = io.metric(window, 'innerWidth'), vh = io.metric(window, 'innerHeight');
  const memo = new Map();
  const st = (el) => { let s = memo.get(el); if (!s) { s = io.style(el); memo.set(el, s); } return s; };
  const shown = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = st(n); if (cs.display === 'none' || (n === el && cs.visibility === 'hidden') || +cs.opacity <= 0.05 || n.hidden) return false; }
    return st(el).visibility !== 'hidden';
  };
  const r1 = (v) => Math.round(v * 10) / 10;
  // (rgb(r, g, b), rgba(r, g, b, a) and color(srgb r g b [/ a]) as [r, g, b, a] in 0..255; anything else is null)
  const parse = (s) => {
    if (!s) return null;
    let m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)$/.exec(s);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
    if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    return null;
  };
  const over = (top, under) => { const a = top[3] + under[3] * (1 - top[3]); return a ? [(top[0] * top[3] + under[0] * under[3] * (1 - top[3])) / a, (top[1] * top[3] + under[1] * under[3] * (1 - top[3])) / a, (top[2] * top[3] + under[2] * under[3] * (1 - top[3])) / a, a] : [0, 0, 0, 0]; };
  // (What is behind an element: the colours of the boxes it sits in, nearest first, until they add up to solid; the page's own colour last.)
  const behind = (el) => {
    let acc = [0, 0, 0, 0];
    for (let n = el; n && acc[3] < 0.995; n = n.parentElement) {
      const bg = parse(st(n).backgroundColor);
      if (bg && bg[3] > 0) acc = over(acc.length && acc[3] ? acc : [0, 0, 0, 0], [0, 0, 0, 0]) && acc[3] ? [...acc] : acc;
      if (bg && bg[3] > 0) acc = acc[3] ? ((u) => [(acc[0] * acc[3] + bg[0] * bg[3] * (1 - acc[3])) / u, (acc[1] * acc[3] + bg[1] * bg[3] * (1 - acc[3])) / u, (acc[2] * acc[3] + bg[2] * bg[3] * (1 - acc[3])) / u, u])(acc[3] + bg[3] * (1 - acc[3])) : bg;
      if (n === document.documentElement) break;
    }
    return acc;
  };
  const lum = (c) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const nameOf = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ').slice(0, 2).join('.')}`;

  // The stylesheet's colour tokens, as the colours they come to on this look: each custom property is set as a colour on a probe and read back.
  const names = new Set();
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) { if (r.style) for (let i = 0; i < r.style.length; i++) if (r.style[i].startsWith('--')) names.add(r.style[i]); }
  }
  const probe = document.createElement('i');
  probe.style.cssText = 'position:fixed;left:-9px;top:-9px;width:0;height:0;pointer-events:none';
  document.documentElement.append(probe);
  const palette = new Set();
  for (const n of names) { probe.style.color = ''; probe.style.color = `var(${n})`; const c = parse(st2(probe)); if (c && c[3] > 0) palette.add(c.map((v) => Math.round(v)).slice(0, 3).join(',')); }
  function st2(el) { memo.delete(el); return io.style(el).color; }
  probe.remove();

  const shadeEl = document.querySelector('.pz-shade');
  const cards = [];
  let gl = 0;
  for (const q of ['.pz-text', '.pz-data', '.pz-panel']) {
    const card = document.querySelector(q);
    if (!card || !shown(card)) continue;
    const cb = io.box(card);
    if (!(cb.width > 0 && cb.height > 0)) continue;
    const rec = { q, box: [r1(cb.left), r1(cb.top), r1(cb.right), r1(cb.bottom)], lines: 0, ink: 0, leaves: [], blocks: [], canvases: 0 };
    rec.canvases = card.querySelectorAll('canvas').length;
    const surface = q === '.pz-text' && shadeEl ? shadeEl : card;
    for (const el of card.querySelectorAll('*')) {
      if (el.tagName === 'CANVAS' || el.classList.contains('sr-only') || !shown(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (!own && el.childElementCount) continue;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const b = io.box(el);
      if (!(b.width > 0 && b.height > 0)) continue;
      const s = st(el);
      const fs = parseFloat(s.fontSize), lh = parseFloat(s.lineHeight) || fs * 1.3;
      const fg = parse(s.color);
      let back = behind(el);
      if (back[3] < 0.99 && surface !== card) back = (() => { const sb = behind(surface); return back[3] ? over(back, sb) : sb; })();
      const ls = (io.lines || io.rects)(el);
      let n = 0, ink = 0;
      for (let k = 0; k < ls.length && k < 40; k++) { const w = ls[k].width, h = ls[k].height; if (w > 1 && h > 1) { n++; ink += w * h; } }
      rec.lines += n; rec.ink += ink;
      const leaf = { t: text.slice(0, 40), n: nameOf(el), fs: r1(fs), bold: +s.fontWeight >= 600, w: r1(b.width), h: r1(b.height), l: r1(b.left), tp: r1(b.top), nl: n, ch: text.length };
      if (fg) {
        leaf.fg = fg.map((v) => Math.round(v * 100) / 100);
        leaf.tok = palette.has(fg.slice(0, 3).map((v) => Math.round(v)).join(','));
        if (back[3] >= 0.99) { const c = fg[3] < 1 ? over(fg, back) : fg; leaf.cr = r1(ratio(c, back)); } else leaf.unresolved = true;
      }
      rec.leaves.push(leaf);
    }
    // (The card's blocks, one under the other: the visible children of the first box that holds more than one, with their gaps and edges.)
    let host = card;
    for (let k = 0; k < 4; k++) { const kids = [...host.children].filter((c) => c.tagName !== 'CANVAS' && shown(c) && io.box(c).height > 0); if (kids.length === 1) host = kids[0]; else break; }
    const ks = [...host.children].filter((c) => c.tagName !== 'CANVAS' && shown(c) && io.box(c).height > 0 && st(c).position !== 'absolute' && st(c).position !== 'fixed');
    for (const c of ks) { const b = io.box(c); rec.blocks.push({ n: nameOf(c), l: r1(b.left), t: r1(b.top), r: r1(b.right), b: r1(b.bottom) }); }
    const hs = st(host);
    rec.pad = [hs.paddingTop, hs.paddingRight, hs.paddingBottom, hs.paddingLeft].map((v) => parseFloat(v) || 0);
    rec.gap = parseFloat(hs.rowGap) || 0;
    rec.flow = hs.display;
    gl += rec.canvases;
    cards.push(rec);
  }
  return { vw, vh, cards, gl, palette: palette.size };
}

const near = (a, b, d) => Math.abs(a - b) <= d;

/** What does not look right, as ['kind: words'] (kinds as in the header). `read` is readLook's result; `limits` overrides LIMITS. */
export function judgeLook(read, limits = {}) {
  const L = { ...LIMITS, ...limits };
  const out = [];
  if (!read) return out;
  for (const c of read.cards) {
    const name = c.q.slice(1);
    const area = Math.max(1, (c.box[2] - c.box[0]) * (c.box[3] - c.box[1]));
    const share = c.ink / area;
    if (share > L.crowdShare) out.push(`crowded: ${name}: its words take ${Math.round(share * 100)}% of the card (at most ${Math.round(L.crowdShare * 100)}%)`);
    if (c.lines > L.crowdLines) out.push(`crowded: ${name}: ${c.lines} lines of words (at most ${L.crowdLines})`);
    for (const f of c.leaves) {
      const large = f.fs >= 24 || (f.bold && f.fs >= 18.66);
      const need = large ? L.contrastLarge : L.contrast;
      if (f.cr !== undefined && f.cr < need) out.push(`contrast: ${name}: "${f.t}" is ${f.cr}:1 on its backing (needs ${need}:1 at ${f.fs} px)`);
      if (f.fg && f.tok === false && f.fg[3] >= 0.5) out.push(`palette: ${name}: "${f.t}" is coloured rgb(${f.fg.slice(0, 3).map(Math.round).join(', ')}), which is none of the stylesheet's colours`);
      if (f.fs > L.titleMax) out.push(`lettering: ${name}: "${f.t}" is ${f.fs} px, over the ${L.titleMax} px ceiling`);
      if (f.nl >= 3 && f.ch >= 90) {
        const per = f.ch / f.nl;
        if (per > L.lineMax) out.push(`lettering: ${name}: "${f.t}" runs ${Math.round(per)} characters a line (at most ${L.lineMax})`);
        else if (per < L.lineMin) out.push(`lettering: ${name}: "${f.t}" has only ${Math.round(per)} characters a line (at least ${L.lineMin})`);
      }
    }
    // spacing: the vertical gaps between the blocks, and the edges they line up on
    const bs = [...c.blocks].sort((a, b) => a.t - b.t);
    const gaps = [];
    for (let i = 1; i < bs.length; i++) { const g = bs[i].t - bs[i - 1].b; if (g >= 0 && g < 80 && bs[i].l < bs[i - 1].r) gaps.push([Math.round(g * 10) / 10, bs[i - 1].n, bs[i].n]); }
    for (let i = 0; i < gaps.length; i++) for (let j = i + 1; j < gaps.length; j++) {
      const d = Math.abs(gaps[i][0] - gaps[j][0]);
      if (d > 0.5 && d <= L.gapJitter && gaps[i][1] === gaps[j][1] && gaps[i][2] === gaps[j][2]) out.push(`spacing: ${name}: two gaps between ${gaps[i][1]} and ${gaps[i][2]} are ${gaps[i][0]} and ${gaps[j][0]} px`);
    }
    for (let i = 1; i < bs.length; i++) {
      const dl = Math.abs(bs[i].l - bs[i - 1].l);
      if (dl > 0.5 && dl <= L.alignJitter && bs[i].t >= bs[i - 1].b - 1) out.push(`align: ${name}: ${bs[i].n} stands ${Math.round(dl * 10) / 10} px off ${bs[i - 1].n}'s left edge`);
    }
    const off = (v) => !L.scale.some((s) => near(v, s, 0.5));
    const bad = [...c.pad, c.gap].filter((v) => v > 0 && off(v));
    if (bad.length) out.push(`spacing: ${name}: padding or gap of ${[...new Set(bad.map((v) => Math.round(v * 10) / 10))].join(', ')} px is off the spacing scale`);
  }
  return [...new Set(out)];
}
