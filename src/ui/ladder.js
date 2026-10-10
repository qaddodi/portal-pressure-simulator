// The pressure ladder: one shared picture of where a block sits, used by the presenter tour, the
// "Where is the block?" drill, lessons, cases and the debrief. Three parts, each standalone:
//
//   createRoute({ site, onPick })   the route strip, pre-hepatic → cardiac.
//     → { el, select(id), reveal(site) }
//     site: a SITES id to mark as the block (null: none). onPick(id): makes the strip tap-to-answer;
//     each segment is a button, select() marks the student's pick, reveal(site) eases the block in
//     at the right segment and marks the pick right or wrong (the strip then stops taking taps).
//   ladder(f, { base, key, known, reveal })   the SVG ladder, portal vein → right atrium.
//     f: a fingerprint { pv, whvp, fhvp, ra, hvpg, asc, saag, tp } (mmHg, mL, g/dL), as the worker's
//     'metrics' / 'presetMetrics' or SNAPSHOTS[id].fp give it. base: the healthy fingerprint, drawn
//     dashed behind. key: rungs to highlight. known: the rungs measured so far (default all); the
//     rest show "?" and no number, and the biggest drop is only shaded between two known rungs.
//     reveal: the line draws in, the rungs follow and the drop shades last, all eased. HVPG and PPG brackets
//     sit in the right margin (PPG needs f.ivc and f.ppg).
//   tiles(f, { key, known })   HVPG, SAAG and ascites protein tiles, rated normal / raised / high.
//
// Also exported: SITES (the six levels), SITE_OF_GROUP (a preset's group → its site), RUNGS and
// rate(k, f) (the clinical cut-offs). Styles live in app.css under "Pressure ladder".

import { h, fmt } from './util.js?v=e803df99cd';

// Where along the route each level sits: [id, name, place, short name for a phone].
// The three middle levels are inside the liver.
export const SITES = [
  ['pre', 'Pre-hepatic', 'Portal vein', 'Pre-hep.'],
  ['presin', 'Pre­sinusoidal', 'Portal tracts', 'Pre-sin.'],
  ['sin', 'Sinusoidal', 'Sinusoids', 'Sinus.'],
  ['postsin', 'Post­sinusoidal', 'Central veins', 'Post-sin.'],
  ['post', 'Post-hepatic', 'Hepatic veins, IVC', 'Post-hep.'],
  ['cardiac', 'Cardiac', 'Heart', 'Heart'],
];
export const SITE_OF_GROUP = { Prehepatic: 'pre', Presinusoidal: 'presin', Sinusoidal: 'sin', Postsinusoidal: 'postsin', Posthepatic: 'post', Cardiac: 'cardiac' };
export const siteName = (id) => SITES.find(([s]) => s === id)?.[1].replace('­', '') || 'No block';

// Normal or not, by the clinical cut-offs the app uses elsewhere. 'hi' is abnormal, 'mid' is borderline.
const ASCITES_ML = 200;
const RATE = {
  pv: (v) => (v > 10 ? ['hi', 'High'] : ['ok', 'Normal']),
  whvp: (v) => (v > 10 ? ['hi', 'High'] : ['ok', 'Normal']),
  fhvp: (v) => (v > 8 ? ['hi', 'High'] : ['ok', 'Normal']),
  ra: (v) => (v > 8 ? ['hi', 'High'] : ['ok', 'Normal']),
  hvpg: (v) => (v >= 10 ? ['hi', '≥ 10'] : v >= 5 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  saag: (v, f) => (f.asc < ASCITES_ML ? [null, 'No ascites'] : v >= 1.1 ? ['hi', '≥ 1.1'] : ['ok', '< 1.1']),
  tp: (v, f) => (f.asc < ASCITES_ML ? [null, 'No ascites'] : v >= 2.5 ? ['hi', 'High'] : ['lo', 'Low']),
};
export const rate = (k, f) => (RATE[k] ? RATE[k](f[k], f) : [null, '']);
export const RUNGS = [['pv', 'Portal', 'vein'], ['whvp', 'Wedged', 'WHVP'], ['fhvp', 'Free HV', 'FHVP'], ['ra', 'Right', 'atrium']];
const TILES = [['hvpg', 'HVPG', 'mmHg', 'Wedged − free'], ['saag', 'SAAG', 'g/dL', 'Serum − ascites albumin'], ['tp', 'Ascites protein', 'g/dL', 'Total protein']];

const SVGNS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
let uid = 0;

/** The biggest fall between two neighbouring known rungs, over 4 mmHg: [index, mmHg], or [-1, 0]. */
export function biggestDrop(f, known = RUNGS.map(([k]) => k)) {
  let at = -1, big = 4;
  for (let i = 0; i < 3; i++) {
    if (!known.includes(RUNGS[i][0]) || !known.includes(RUNGS[i + 1][0])) continue;
    const d = f[RUNGS[i][0]] - f[RUNGS[i + 1][0]];
    if (d > big) { big = d; at = i; }
  }
  return at < 0 ? [-1, 0] : [at, big];
}

/** The pressure ladder: four stations from the portal vein to the right atrium, the healthy line
 *  dashed behind, the biggest drop shaded as the block. */
export function ladder(f, { base = null, key = [], known = null, reveal = false } = {}) {
  const W = 320, H = 172, x = (i) => 28 + i * 70, y = (v) => 128 - Math.min(30, Math.max(0, v)) * 3.5;
  const kn = known || RUNGS.map(([k]) => k), has = (i) => kn.includes(RUNGS[i][0]);
  const pts = RUNGS.map(([k], i) => [x(i), has(i) ? y(f[k]) : y(0), f[k]]);
  const [drop, big] = biggestDrop(f, kn);
  const grid = [0, 10, 20, 30].map((v) => s('g', { class: 'tl-grid' }, s('line', { x1: 18, x2: W - 6, y1: y(v), y2: y(v) }), s('text', { x: 12, y: y(v) + 3.5, 'text-anchor': 'end' }, String(v))));
  // The line only joins neighbouring rungs that are both known.
  let d = '';
  pts.forEach(([px, py], i) => { if (has(i)) d += (i && has(i - 1) ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1); });
  const band = drop >= 0 ? s('g', { class: 'tl-drop' },
    s('rect', { x: pts[drop][0] + 8, y: y(30) - 4, width: 54, height: y(0) - y(30) + 4, rx: 8 }),
    s('text', { x: (pts[drop][0] + pts[drop + 1][0]) / 2, y: y(30) - 9, 'text-anchor': 'middle' }, `−${fmt(big, 0)} mmHg`)) : null;
  // The gradients as spans of the same scale in the right margin: HVPG (wedged − free) and PPG (portal vein − IVC),
  // coloured by their cut-offs (amber 5 / red 10 and 6 / 12). PPG needs the IVC pressure, so snapshots without it skip it.
  const span = (name, bx, hi, lo, v, rate, x0, tag) => {
    if (![hi, lo, v].every(Number.isFinite)) return null;
    const y1 = y(hi), y2 = y(lo);
    return s('g', { class: 'tl-bg', 'data-rate': rate },
      s('path', { class: 'tl-lead', d: `M${x0 + 8} ${y1.toFixed(1)}H${bx - 8}` + (name === 'HVPG' ? `M${x(2) + 8} ${y2.toFixed(1)}H${bx - 8}` : '') }),
      s('path', { class: 'tl-br', d: `M${bx - 6} ${y1.toFixed(1)}H${bx}V${y2.toFixed(1)}H${bx - 6}` }),
      s('text', { class: 'tl-bk', x: bx, y: 12, 'text-anchor': 'middle' }, name),
      s('text', { class: 'tl-bv', x: bx, y: 27, 'text-anchor': 'middle' }, fmt(v, 1)),
      tag ? s('text', { class: 'tl-bt', x: bx - 9, y: y2 + 3, 'text-anchor': 'end' }, tag) : null);
  };
  const hvpgBr = has(1) && has(2) ? span('HVPG', 270, f.whvp, f.fhvp, f.hvpg, f.hvpg >= 10 ? 'hi' : f.hvpg >= 5 ? 'mid' : 'ok', x(1)) : null;
  const ppgBr = has(0) && has(3) ? span('PPG', 302, f.pv, f.ivc, f.ppg, f.ppg >= 12 ? 'hi' : f.ppg >= 6 ? 'mid' : 'ok', x(0), 'IVC') : null;
  const gid = 'tlGrad' + ++uid;
  const label = 'Pressure ladder: ' + RUNGS.map(([, a, b], i) => `${a} ${b} ${has(i) ? fmt(pts[i][2], 1) : 'not measured'}`).join(', ') + ' mmHg'
    + (hvpgBr ? `. HVPG ${fmt(f.hvpg, 1)}` : '') + (ppgBr ? `${hvpgBr ? ', ' : '. '}PPG ${fmt(f.ppg, 1)}` : '') + (hvpgBr || ppgBr ? ' mmHg' : '');
  return s('svg', { class: 'tl-ladder' + (reveal ? ' reveal' : ''), viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label },
    s('defs', {}, s('linearGradient', { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 }, s('stop', { offset: 0, 'stop-color': 'var(--tour-portal)' }), s('stop', { offset: 1, 'stop-color': 'var(--tour-sys)' }))),
    grid, band, hvpgBr, ppgBr,
    base ? s('path', { class: 'tl-base', d: RUNGS.map(([k], i) => (i ? 'L' : 'M') + x(i) + ' ' + y(base[k]).toFixed(1)).join(' ') }) : null,
    d ? s('path', { class: 'tl-line', d, stroke: `url(#${gid})`, pathLength: 1 }) : null,
    pts.map(([px, py, v], i) => s('g', { class: 'tl-pt' + (key.includes(RUNGS[i][0]) ? ' key' : '') + (has(i) ? '' : ' unk'), style: `--i:${i}` },
      s('circle', { cx: px, cy: py, r: 5.5 }),
      s('text', { class: 'tl-v', x: px, y: py - 11, 'text-anchor': 'middle' }, has(i) ? fmt(v, 0) : '?'),
      s('text', { class: 'tl-k', x: px, y: H - 18, 'text-anchor': 'middle' }, RUNGS[i][1]),
      s('text', { class: 'tl-k2', x: px, y: H - 4, 'text-anchor': 'middle' }, RUNGS[i][2]))));
}

/** HVPG, SAAG and ascites protein, each rated. Tiles not in `known` read "?". */
export function tiles(f, { key = [], known = null } = {}) {
  return h('div', { class: 'tour-tiles' }, TILES.map(([k, label, unit, sub]) => {
    const unk = known && !known.includes(k);
    const [cls, word] = unk ? [null, 'Not measured'] : rate(k, f), none = unk || (cls == null && k !== 'hvpg');
    return h('div', { class: 'tour-tile' + (key.includes(k) ? ' key' : ''), 'data-rate': cls || 'none' },
      h('span', { class: 'tt-k' }, label, key.includes(k) ? h('i', { class: 'tt-key' }, 'Key') : null),
      h('span', { class: 'tt-v' }, unk ? '?' : none ? '—' : fmt(f[k], 1), none ? null : h('small', {}, unit)),
      h('span', { class: 'tt-r' }, word),
      h('span', { class: 'tt-s' }, sub));
  }));
}

/** The route strip from the portal vein to the heart, with the liver bracket over the middle three. */
export function createRoute({ site = null, onPick = null } = {}) {
  const pickable = typeof onPick === 'function';
  const at = SITES.findIndex(([id]) => id === site);
  const el = h('div', { class: 'tour-route' + (pickable ? ' pickable' : ''), role: pickable ? 'group' : 'img',
    'aria-label': pickable ? 'Where is the block? Tap a level' : at >= 0 ? `Block: ${SITES[at][1]}, at the ${SITES[at][2].toLowerCase()}` : 'No block' });
  const segs = SITES.map(([id, label, place, short], i) => {
    const kids = [h('i', { class: 'tr-bar' }, i === at ? h('b', { class: 'tr-x' }) : null), h('span', { class: 'tr-l' }, label), h('span', { class: 'tr-s', 'aria-hidden': 'true' }, short)];
    return pickable
      ? h('button', { type: 'button', class: 'tr-seg', 'data-site': id, 'aria-pressed': 'false', 'aria-label': `${label.replace('­', '')}: ${place}`, onclick: () => { select(id); onPick(id); } }, kids)
      : h('div', { class: 'tr-seg' + (i === at ? ' on' : ''), 'data-site': id }, kids);
  });
  el.append(h('div', { class: 'tr-liver' }, h('span', {}, 'Liver')), h('div', { class: 'tr-track' }, segs));
  function select(id) {
    segs.forEach((b) => { const on = b.dataset.site === id; b.classList.toggle('pick', on); if (pickable) b.setAttribute('aria-pressed', String(on)); });
  }
  function reveal(answer) {
    const pick = segs.find((b) => b.classList.contains('pick'))?.dataset.site;
    el.classList.add('answered');
    segs.forEach((b) => {
      const id = b.dataset.site, bar = b.querySelector('.tr-bar');
      if (pickable) b.disabled = true;
      b.classList.toggle('on', id === answer);
      b.classList.toggle('right', id === answer && id === pick);
      b.classList.toggle('wrong', id === pick && id !== answer);
      if (id === answer && !bar.firstChild) bar.append(h('b', { class: 'tr-x' }));
    });
  }
  return { el, select, reveal };
}
