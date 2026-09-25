// Figure view: the stage as a self-explanatory plate (title, scenario and key values, legend,
// notation key and caption) that can be presented, printed or exported as SVG / PNG. The
// exported file is built from the live SVG layers with every style resolved inline, so it opens
// the same in a vector editor, a slide or a manuscript.

import { store } from './store.js?v=59e4c262de';
import { h, fmt, icon, toast } from './util.js?v=61d6f9c200';
import { pressureColor } from './colormap.js?v=884435083d';

const SVGNS = 'http://www.w3.org/2000/svg';
const PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor', 'paint-order', 'stop-color', 'stop-opacity', 'visibility'];
const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

export function createFigure({ app, stage, onClose }) {
  const head = document.getElementById('figHead');
  const foot = document.getElementById('figFoot');
  const wrap = document.getElementById('stageWrap');
  let subEl, kEl, titleEl;

  const scenario = () => { const st = store.get(); return st.presetList?.find((p) => p.id === st.presetId)?.label || 'Custom scenario'; };
  const viewName = () => (store.get().view === 'circuit' ? 'Circuit view' : 'Anatomic view');

  function titleText() {
    const st = store.get();
    const A = st.mode === 'compare' && st.compareSnap;
    if (A && st.compareView === 'A') return `Portal circulation · ${A.label} (state A)`;
    if (A && st.compareView === 'D') return `Portal circulation · change from state A`;
    return `Portal circulation · ${scenario()}`;
  }
  function subRuns(f) {
    const st = store.get();
    const A = st.mode === 'compare' && st.compareSnap && st.compareView === 'A';
    const m = A ? st.compareSnap.metrics : f.metrics;
    const fr = A ? st.compareSnap.frame : f;
    const when = fr.day > 0 ? `day ${fr.day}` : `${fmt(fr.t, 0)} s`;
    if (st.imaging) return [['Anatomy only: pressures unmeasured in this case. ', false], [`Model time ${when}.`, false]];
    const rev = m.pvFlow < -0.02;
    return [[`Model time ${when}. `, false], ['HVPG ', false], [`${fmt(m.hvpg, 1)} mmHg`, true], [' · portal vein ', false], [`${fmt(m.pv, 1)} mmHg`, true],
      [' · portal flow ', false], [`${fmt(m.pvFlow, 2)} L/min${rev ? ' (hepatofugal)' : ''}`, true], [' · varix wall tension ', false], [`${fmt(m.varix.ratio * 100, 0)} %`, true], [' of the rupture threshold', false]];
  }
  function captionText() {
    const circuit = store.get().view === 'circuit';
    return (circuit
      ? 'Transit-map schematic of the same model. Mean pressure falls from left to right across the main series circuit (gut, portal vein, liver, hepatic veins, inferior vena cava, right atrium); collaterals and shunts run in separate lanes as bypasses. Values at each station in mmHg; resistances across the liver in Wood units (mmHg·min/L).'
      : 'Frontal view, patient’s right on the viewer’s left. Vessel color gives mean venous pressure; labels give values in mmHg with the change from healthy. Line width follows vessel diameter (∝ d⁰·⁷²). Chevrons in each lumen point in the direction of mean flow. Vessels that only close the systemic loop are part of the model but not drawn.')
      + ' Output of a lumped-parameter hemodynamic model for teaching; values are illustrative and not for clinical decisions.';
  }

  function legendBlock() {
    const st = store.get();
    const imaging = st.imaging;
    const mode = imaging ? 'neutral' : st.mode === 'compare' && st.compareSnap && st.compareView === 'D' ? 'delta' : st.colorMode;
    const blk = h('div', { class: 'fig-key lg-full' });
    if (mode === 'pressure') {
      const at = (p) => (p / 30) * 100;
      blk.append(h('span', { class: 'fk-t' }, 'Venous pressure (mmHg)'),
        h('div', { class: 'lg-scale' }, h('div', { class: 'lg-bar', style: { background: `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => `${pressureColor(i * 2.5)} ${(i * 2.5 / 30) * 100}%`).join(',')})` } }),
          [5, 10, 12, 20].map((p) => h('span', { class: 'lg-tick', style: { left: at(p) + '%' } })),
          [[0, '0'], [5, '5'], [10, '10'], [12, '12'], [20, '20'], [30, '30']].map(([p, t]) => h('span', { class: 'lg-num', style: { left: at(p) + '%', transform: p === 10 ? 'translateX(-85%)' : p === 12 ? 'translateX(-15%)' : '' } }, t))),
        h('span', { class: 'fig-cap', style: { maxWidth: '260px' } }, 'Breaks at 5, 10, 12, 20 mirror the HVPG thresholds (normal, CSPH, bleeding, high risk).'));
    } else if (mode === 'delta') {
      blk.append(h('span', { class: 'fk-t' }, `Change from ${st.mode === 'compare' ? 'state A' : 'healthy'} (mmHg)`),
        h('div', { class: 'lg-scale' }, h('div', { class: 'lg-bar', style: { background: 'linear-gradient(to right, #2D6CDF, #9696A0, #D22846)' } }), h('span', { class: 'lg-tick', style: { left: '50%' } }),
          [[0, '−12'], [50, '0'], [100, '+12']].map(([p, t]) => h('span', { class: 'lg-num', style: { left: p + '%' } }, t))));
    } else if (mode === 'neutral') {
      blk.append(h('span', { class: 'fk-t' }, 'Vessels'), h('span', { class: 'fk-row' }, glyph('line', 'var(--vein-portal)'), 'Portal venous system'), h('span', { class: 'fk-row' }, glyph('line', 'var(--vein-systemic)'), 'Systemic veins'));
    } else if (mode === 'direction') {
      blk.append(h('span', { class: 'fk-t' }, 'Flow direction'), h('span', { class: 'fk-row' }, glyph('line', 'var(--flow-normal)'), 'Physiological'), h('span', { class: 'fk-row' }, glyph('line', 'var(--flow-reversed)'), 'Reversed'));
    } else {
      blk.append(h('span', { class: 'fk-t' }, 'Pressure drop across each vessel (mmHg)'), h('div', { class: 'lg-scale' }, h('div', { class: 'lg-bar', style: { background: `linear-gradient(to right, ${pressureColor(0)}, ${pressureColor(15)}, ${pressureColor(30)})` } }), [[0, '0'], [100, '12+']].map(([p, t]) => h('span', { class: 'lg-num', style: { left: p + '%' } }, t))));
    }
    return blk;
  }
  function glyph(kind, color) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 26 12');
    if (kind === 'line') s.innerHTML = `<path d="M2 6h22" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
    if (kind === 'flow') s.innerHTML = '<path d="M2 6h22" stroke="var(--vessel-casing)" stroke-width="9" stroke-linecap="round"/><path d="M2 6h22" stroke="#B0306E" stroke-width="7" stroke-linecap="round"/><path d="M7 3.6 9.4 6 7 8.4M14 3.6 16.4 6 14 8.4M21 3.6 23.4 6 21 8.4" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>';
    if (kind === 'thin') s.innerHTML = '<path d="M2 6h22" stroke="var(--vessel-casing)" stroke-width="4.4" stroke-linecap="round"/><path d="M2 6h22" stroke="#7E6BC4" stroke-width="3" stroke-linecap="round"/><path d="M15.6 6 10.4 3.3v5.4z" fill="rgba(34,28,46,.86)" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" paint-order="stroke"/>';
    if (kind === 'ghost') s.innerHTML = '<path d="M2 6h22" stroke="var(--vein-systemic)" stroke-width="5" stroke-linecap="round" opacity=".34"/>';
    if (kind === 'dot') s.innerHTML = '<path d="M2 6h22" stroke="var(--vein-portal)" stroke-width="3" stroke-linecap="round" stroke-dasharray="1.5 4.5" opacity=".7"/>';
    return s;
  }
  function keyBlock() {
    const st = store.get();
    const rows = [];
    if (!st.imaging) rows.push([glyph('flow'), 'Blood flow: chevrons point downstream'], [glyph('thin'), 'Flow in a small vessel']);
    rows.push([glyph('ghost'), 'Vein passing behind an organ']);
    rows.push([glyph('dot'), 'Closed potential collateral']);
    if (!st.imaging) rows.push([h('span', { style: { width: '26px', fontSize: '10.5px', fontWeight: 700, color: 'color-mix(in srgb, var(--danger) 88%, var(--text))' } }, '▲ 3'), `Change from ${st.mode === 'compare' && st.compareSnap ? 'state A' : 'healthy'}, mmHg`]);
    return h('div', { class: 'fig-key' }, h('span', { class: 'fk-t' }, 'Notation'), rows.map(([g, t]) => h('span', { class: 'fk-row' }, g, t)));
  }

  function build() {
    const actions = [
      ['download', 'SVG', () => exportFile('svg')], ['download', 'PNG', () => exportFile('png')], ['print', 'Print', () => window.print()],
    ].map(([ic, l, fn]) => { const b = h('button', { class: 'btn sm' }, icon(ic), l); b.addEventListener('click', fn); return b; });
    const close = h('button', { class: 'btn sm primary' }, icon('close'), 'Close');
    close.addEventListener('click', onClose);
    kEl = h('div', { class: 'fh-k' }); titleEl = h('h1'); subEl = h('div', { class: 'fh-sub' });
    head.replaceChildren(h('div', { class: 'fh-text' }, kEl, titleEl, subEl), h('div', { class: 'fh-actions' }, ...actions, close));
    foot.replaceChildren(legendBlock(), keyBlock(), h('p', { class: 'fig-cap', style: { margin: 0 } }, captionText()));
  }
  function update(f) {
    if (!subEl || !f) return;
    kEl.textContent = `Figure · ${viewName()}`;
    titleEl.textContent = titleText();
    subEl.replaceChildren(...subRuns(f).map(([t, b]) => (b ? h('b', {}, t) : t)));
  }
  let unsub = [];
  function open() {
    build(); update(store.get().frame);
    unsub = ['view', 'colorMode', 'compareView', 'presetId', 'compareSnap'].map((k) => store.on(k, () => { build(); update(store.get().frame); }));
    head.querySelector('.btn.primary')?.focus({ preventScroll: true });
  }
  function close() { unsub.forEach((u) => u()); unsub = []; }

  // ── Export ────────────────────────────────────────
  function inlineStyles(src, dst) {
    const cs = getComputedStyle(src);
    if (cs.display === 'none') return false;
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (v && v !== 'normal' && !(p === 'visibility' && v === 'visible')) dst.setAttribute(p, v);
    }
    dst.removeAttribute('class'); dst.removeAttribute('style'); dst.removeAttribute('tabindex'); dst.removeAttribute('role');
    const sk = [...src.children], dk = [...dst.children];
    for (let i = sk.length - 1; i >= 0; i--) if (inlineStyles(sk[i], dk[i]) === false) dk[i].remove();
    return true;
  }
  function wrapText(text, width, size, weight) {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${weight} ${size}px ${FONT}`;
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > width && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function textFromEl(el, base, opts = {}) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize), weight = cs.fontWeight, color = cs.color;
    const lines = wrapText(opts.text ?? el.textContent, r.width + 2, size, weight);
    const lh = parseFloat(cs.lineHeight) || size * 1.4;
    return lines.map((l, i) => `<text x="${(r.left - base.left).toFixed(1)}" y="${(r.top - base.top + lh * (i + 0.78)).toFixed(1)}" font-family='${FONT}' font-size="${size}" font-weight="${weight}" fill="${color}"${cs.textTransform === 'uppercase' ? ` letter-spacing="${cs.letterSpacing}"` : ''}>${esc(cs.textTransform === 'uppercase' ? l.toUpperCase() : l)}</text>`).join('');
  }

  function buildSVG() {
    const base = wrap.getBoundingClientRect();
    const W = Math.round(base.width), H = Math.round(base.height);
    const viewEl = document.getElementById('stageView');
    const vr = viewEl.getBoundingClientRect();
    const src = stage.svg;
    const clone = src.cloneNode(true);
    inlineStyles(src, clone);
    // The live flow layer is a canvas; the export carries the same chevrons as vector paths.
    clone.querySelector('#world')?.insertAdjacentHTML('beforeend', stage.flowSVG());
    clone.setAttribute('x', (vr.left - base.left).toFixed(1)); clone.setAttribute('y', (vr.top - base.top).toFixed(1));
    clone.setAttribute('width', vr.width.toFixed(1)); clone.setAttribute('height', vr.height.toFixed(1));
    clone.removeAttribute('aria-label');
    const lsrc = stage.labelLayer();
    const lab = lsrc.cloneNode(true);
    inlineStyles(lsrc, lab);
    lab.setAttribute('x', (vr.left - base.left).toFixed(1)); lab.setAttribute('y', (vr.top - base.top).toFixed(1));
    lab.setAttribute('width', vr.width.toFixed(1)); lab.setAttribute('height', vr.height.toFixed(1)); lab.setAttribute('overflow', 'visible');
    const ser = new XMLSerializer();
    // header and footer text, legend bar and key glyphs
    let text = '';
    for (const el of head.querySelectorAll('.fh-k, h1, .fh-sub')) text += textFromEl(el, base);
    for (const el of foot.querySelectorAll('.fk-t, .fig-cap')) text += textFromEl(el, base);
    for (const el of foot.querySelectorAll('.fk-row')) {
      const g = el.querySelector('svg');
      const label = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
      if (g) { const gr = g.getBoundingClientRect(); const gc = g.cloneNode(true); inlineStyles(g, gc); gc.setAttribute('x', gr.left - base.left); gc.setAttribute('y', gr.top - base.top); gc.setAttribute('width', gr.width); gc.setAttribute('height', gr.height); text += ser.serializeToString(gc); }
      else { const sp = el.querySelector('span'); if (sp) text += textFromEl(sp, base); }
      const lr = el.getBoundingClientRect(), cs = getComputedStyle(el);
      text += `<text x="${(lr.left - base.left + 34).toFixed(1)}" y="${(lr.top - base.top + lr.height * 0.7).toFixed(1)}" font-family='${FONT}' font-size="${cs.fontSize}" fill="${cs.color}">${esc(label)}</text>`;
    }
    let defs = '';
    foot.querySelectorAll('.lg-scale').forEach((sc, i) => {
      const bar = sc.querySelector('.lg-bar'), br = bar.getBoundingClientRect();
      const stops = (getComputedStyle(bar).backgroundImage.match(/rgba?\([^)]+\)(\s+[\d.]+%)?/g) || []).map((m, k, arr) => {
        const [c, off] = m.split(/\s+(?=[\d.]+%$)/);
        return `<stop offset="${off || `${(k / Math.max(1, arr.length - 1)) * 100}%`}" stop-color="${c}"/>`;
      }).join('');
      defs += `<linearGradient id="figLg${i}" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient>`;
      text += `<rect x="${(br.left - base.left).toFixed(1)}" y="${(br.top - base.top).toFixed(1)}" width="${br.width.toFixed(1)}" height="${br.height.toFixed(1)}" rx="2" fill="url(#figLg${i})"/>`;
      sc.querySelectorAll('.lg-tick').forEach((t) => { const r = t.getBoundingClientRect(); text += `<rect x="${(r.left - base.left).toFixed(1)}" y="${(r.top - base.top).toFixed(1)}" width="1" height="${r.height.toFixed(1)}" fill="${getComputedStyle(t).backgroundColor}" opacity="${getComputedStyle(t).opacity}"/>`; });
      sc.querySelectorAll('.lg-num').forEach((t) => { const r = t.getBoundingClientRect(), cs = getComputedStyle(t); text += `<text x="${(r.left - base.left + r.width / 2).toFixed(1)}" y="${(r.top - base.top + r.height * 0.8).toFixed(1)}" text-anchor="middle" font-family='${FONT}' font-size="${cs.fontSize}" font-weight="${cs.fontWeight}" fill="${cs.color}">${esc(t.textContent)}</text>`; });
    });
    const fr = foot.getBoundingClientRect();
    const svg = `<svg xmlns="${SVGNS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT}'>`
      + `<defs>${defs}</defs><rect width="${W}" height="${H}" fill="${cssv('--stage-bg')}"/>`
      + ser.serializeToString(clone) + ser.serializeToString(lab)
      + `<rect x="0" y="${(fr.top - base.top).toFixed(1)}" width="${W}" height="1" fill="${cssv('--border')}"/>` + text + '</svg>';
    return { svg, W, H };
  }
  function fileName(ext) {
    const st = store.get();
    return `portal-circulation-${(st.presetId || 'custom')}-${st.view === 'circuit' ? 'circuit' : 'anatomy'}.${ext}`;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function exportFile(kind) {
    const { svg, W, H } = buildSVG();
    if (kind === 'svg') { download(new Blob([svg], { type: 'image/svg+xml' }), fileName('svg')); toast('Figure saved as SVG.'); return; }
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const k = 2;
    const c = document.createElement('canvas'); c.width = W * k; c.height = H * k;
    const ctx = c.getContext('2d'); ctx.scale(k, k); ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    c.toBlob((b) => { download(b, fileName('png')); toast('Figure saved as PNG (2×).'); }, 'image/png');
  }

  return { open, close, update, buildSVG, exportFile };
}
