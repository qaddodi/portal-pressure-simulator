// Presenter: projector-first presentations on the live model (decks.js), the instructor's own scripts
// and "Present a case".
//
// A slide is one idea: a big headline, one line, a few causes, and a figure that explains it. Every
// slide's model state is computed off screen first (a second engine in its own worker, worker-core.js
// 'sequence'), each from the slide before, so the live figure only ever shows finished states and
// forward, back and jump always agree. Between slides the words fade over; a change of patient dims the
// figure (never to blank) and brings it back; then the camera travels: to a region of the plate, or down into the lobule and
// on to a portal tract, the sinusoids or a central vein. The pressure ladder and the tiles count to their
// new values.
//
// Keys (clickers send the same): → Page Down Space Enter next, ← Page Up back, a number then Enter
// jumps, Home End, B or . black screen, F full screen, N notes, S speaker window, Q quiz, L laser, Esc.

import { store, replaceParams } from './store.js?v=25cbe77a76';
import { h, toast, svgIcon, icon, fmt, clamp } from './util.js?v=e803df99cd';
import { download } from './records.js?v=50fb9dd463';
import { SITES } from './ladder.js?v=819db1deff';
import { sinusoidSupported } from './sinusoid-view.js?v=b68c9ab562';
import { pressureColor } from './colormap.js?v=6d64a94345';
import { NODES } from '../engine/topology.js?v=dc393aabea';
import { DECKS, REGIONS, LEVELS } from './decks.js?v=7e4ff1383c';

const KEY = 'pps.scripts';
const readMine = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const writeMine = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
// Old links and bookmarks: the self-running tour became the Sites presentation, the bleeding lecture the treatment one.
const ALIAS = { 'where-block': 'sites', bleed: 'treatment' };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
/** Poll (not frames: a hidden tab runs none) until fn() holds or ms pass. */
async function until(fn, ms = 3000) { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await wait(40); }
const LOBULE_CAM = /^(lobule|sinusoid)/;

// ── Numbers ────────────────────────────────────────
const RUNGS = [['pv', 'Portal', 'vein'], ['whvp', 'Wedged', 'WHVP'], ['fhvp', 'Free HV', 'FHVP'], ['ra', 'Right', 'atrium']];
const NO_ASC = 150;   // mL: below it there is no ascites to tap (ultrasound grade 1 starts here)
const vSize = (v) => (v < 2.5 ? ['ok', 'None'] : v < 5 ? ['mid', 'Small'] : ['hi', 'Large']);
// A name joined by an en dash (Budd–Chiari) never breaks at the dash.
const nb = (t) => (t || '').replace(/(\p{L})–(\p{L})/gu, '$1–\u2060$2');
const RATE = {
  hvpg: (v) => (v >= 10 ? ['hi', 'Clinically significant'] : v >= 5 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  ppg: (v) => (v >= 12 ? ['hi', 'High'] : v >= 6 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  pv: (v) => (v > 10 ? ['hi', 'High'] : ['ok', 'Normal']),
  sin: (v) => (v >= 12 ? ['hi', 'High'] : v >= 9 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  saag: (v, f) => (f.asc < NO_ASC ? [null, 'No ascites'] : v >= 1.1 ? ['hi', 'Portal hypertension'] : ['ok', 'Not portal']),
  // (Protein is neither good nor bad, except that below 1.5 g/dL it no longer guards against infection.)
  tp: (v, f) => (f.asc < NO_ASC ? [null, 'No ascites'] : v >= 2.5 ? ['info', 'High'] : v < 1.5 ? ['mid', 'Low: SBP risk'] : ['info', 'Low']),
  asc: (v) => (v < NO_ASC ? ['ok', 'None'] : v < 1500 ? ['mid', 'Grade 1, ultrasound only'] : v < 5000 ? ['hi', 'Grade 2, moderate'] : ['hi', 'Grade 3, tense']),
  varix: vSize, gv: vSize,
  spleen: (v) => (v > 13 ? ['hi', 'Enlarged'] : ['ok', 'Normal']),
  plt: (v) => (v < 100 ? ['hi', 'Low'] : v < 150 ? ['mid', 'Low'] : ['ok', 'Normal']),
  pvFlow: (v) => (v < 0 ? ['hi', 'Reversed, away from the liver'] : [null, 'Toward the liver']),
  liver: (v) => (v < 50 ? ['hi', 'Low'] : v < 80 ? ['mid', 'Reduced'] : ['ok', 'Normal']),
  shunt: (v) => (v >= 0.5 ? ['hi', 'Most of it'] : v >= 0.2 ? ['mid', 'Some'] : ['ok', 'Little']),
  map: (v) => (v < 65 ? ['hi', 'Low'] : ['ok', 'Normal']),
  hr: (v) => [null, v < 60 ? 'Slow' : v > 100 ? 'Fast' : 'Normal'],
};
// Each tile: its name, what it is, the unit, the decimals (1 unless d), a scale (x) and which way is better
// (−1 lower, 1 higher) for the colour of a change.
const TILE = {
  hvpg: { t: 'HVPG', s: 'Wedged − free', u: 'mmHg', better: -1 },
  ppg: { t: 'PPG', s: 'Portal − IVC', u: 'mmHg', better: -1 },
  pv: { t: 'Portal vein', s: 'Pressure', u: 'mmHg', better: -1 },
  sin: { t: 'Sinusoids', s: 'Pressure', u: 'mmHg', better: -1 },
  saag: { t: 'SAAG', s: 'Serum − ascites albumin', u: 'g/dL' },
  tp: { t: 'Ascites protein', s: 'Total protein', u: 'g/dL' },
  asc: { t: 'Ascites', s: 'Volume', u: 'L', x: 0.001, better: -1 },
  varix: { t: 'Esophageal varix', s: 'Diameter', u: 'mm', better: -1 },
  gv: { t: 'Gastric varix', s: 'Fundal, diameter', u: 'mm', better: -1 },
  spleen: { t: 'Spleen', s: 'Length', u: 'cm', better: -1 },
  plt: { t: 'Platelets', s: '× 10⁹ per litre', u: '', d: 0, better: 1 },
  pvFlow: { t: 'Portal vein flow', s: 'Mean', u: 'L/min' },
  liver: { t: 'Liver blood flow', s: 'Through the sinusoids, of normal', u: '%', d: 0, better: 1 },
  shunt: { t: 'Shunted', s: 'Portal blood bypassing the liver', u: '%', x: 100, d: 0, better: -1 },
  map: { t: 'Blood pressure', s: 'Mean arterial', u: 'mmHg', d: 0 },
  hr: { t: 'Heart rate', s: 'Beats a minute', u: '/min', d: 0 },
};
const rateOf = (k, f) => (RATE[k] && f && f[k] != null ? RATE[k](f[k], f) : [null, '']);
const tileVal = (k, v) => (v == null ? '—' : fmt(v * (TILE[k]?.x ?? 1), TILE[k]?.d ?? 1));
// The live model's numbers in the fingerprint's terms (a time-lapse plays on the live figure).
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
function liveFp(fr) {
  const m = fr.metrics, a = m.ascites, P = fr.Pf || fr.P;
  return { pv: m.pv, whvp: m.whvp, fhvp: m.fhvp, hvpg: m.hvpg, ra: m.ra, ivc: m.ivc, ppg: m.ppg, asc: a.volume, saag: a.saag, tp: a.totalProtein,
    sin: P?.[NI.SIN_R], int: P?.[NI.INT], varix: m.varix.d, gv: m.gastricVarix.d, spleen: m.spleen.length, plt: m.spleen.platelets,
    pvFlow: m.pvFlowMean, shunt: m.shuntFraction, liver: m.liverPerfPct, map: m.map, hr: m.hr };
}

// A value counts from where it was to where it goes (eased, about a second); reduced motion jumps.
function tweener(draw) {
  let cur = null, raf = 0;
  return (to, ms = 950) => {
    cancelAnimationFrame(raf);
    if (!cur || reduce.matches) { cur = { ...to }; draw(cur); return; }
    const from = { ...cur }, t0 = performance.now();
    const step = (now) => {
      const u = ease(clamp((now - t0) / ms, 0, 1));
      for (const k of Object.keys(to)) cur[k] = from[k] == null || to[k] == null ? to[k] : from[k] + (to[k] - from[k]) * u;
      draw(cur);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
let uid = 0;

/** The pressure ladder at projector size: four stations, the healthy line dashed behind, every fall of
 *  more than 4 mmHg shaded as a block. Under the axis, as on the app's own pressure chart, two spans run
 *  along the stations with the number written in them: HVPG (wedged to free hepatic vein) and PPG (portal
 *  vein to the IVC, at the right-atrium column), coloured by their cut-offs, with faint leaders up to the
 *  stations they join. set(f, { key }) glides the line and counts the numbers. */
function bigLadder() {
  const W = 500, H = 382, X = (i) => 74 + i * 116, Y = (v) => 252 - clamp(v, 0, 30) * 6.6;
  const SPAN_Y = { hvpg: 278, ppg: 316 };
  const gid = 'pzGrad' + ++uid;
  const base = sv('path', { class: 'pzl-base' });
  const line = sv('path', { class: 'pzl-line', stroke: `url(#${gid})` });
  const bands = [0, 1, 2].map((i) => {
    const r = sv('rect', { x: X(i) + 16, y: Y(30) - 6, width: 116 - 32, height: Y(0) - Y(30) + 6, rx: 12 });
    const t = sv('text', { x: (X(i) + X(i + 1)) / 2, y: 26, 'text-anchor': 'middle' });
    return { g: sv('g', { class: 'pzl-drop', opacity: 0 }, r, t), t };
  });
  const pts = RUNGS.map(([, a, b], i) => {
    const c = sv('circle', { cx: X(i), r: 8.5 }), v = sv('text', { class: 'pzl-v', x: X(i), 'text-anchor': 'middle' });
    return { g: sv('g', { class: 'pzl-pt' }, c, v, sv('text', { class: 'pzl-k', x: X(i), y: H - 34, 'text-anchor': 'middle' }, a), sv('text', { class: 'pzl-k2', x: X(i), y: H - 10, 'text-anchor': 'middle' }, b)), c, v };
  });
  // A gradient span: a bar with end caps from one station's column to another's, dotted leaders up to the two
  // station points, and a pill in the middle with its name and number.
  const span = (name, row, i0, i1) => {
    const x0 = X(i0), x1 = X(i1), w = name === 'HVPG' ? 112 : 100, mid = (x0 + x1) / 2;
    const lead = sv('path', { class: 'pzl-lead' }), bar = sv('path', { class: 'pzl-br', d: `M${x0} ${row - 5}V${row + 5}M${x1} ${row - 5}V${row + 5}M${x0} ${row}H${x1}` });
    const k = sv('text', { class: 'pzl-bk', x: mid - w / 2 + 11, y: row + 5 }, name), v = sv('text', { class: 'pzl-bv', x: mid + w / 2 - 11, y: row + 6.5, 'text-anchor': 'end' });
    return { x0, x1, row, lead, v, g: sv('g', { class: 'pzl-bg', opacity: 0 }, lead, bar, sv('rect', { class: 'pzl-pill', x: mid - w / 2, y: row - 13, width: w, height: 26, rx: 13 }), k, v) };
  };
  const hv = span('HVPG', SPAN_Y.hvpg, 1, 2), pp = span('PPG', SPAN_Y.ppg, 0, 3);
  const el = sv('svg', { class: 'pz-ladder', viewBox: `0 0 ${W} ${H}`, role: 'img' },
    sv('defs', {}, sv('linearGradient', { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 }, sv('stop', { offset: 0, 'stop-color': 'var(--tour-portal)' }), sv('stop', { offset: 1, 'stop-color': 'var(--tour-sys)' }))),
    [0, 10, 20, 30].map((v) => sv('g', { class: 'pzl-grid' }, sv('line', { x1: 44, x2: W - 10, y1: Y(v), y2: Y(v) }), sv('text', { x: 34, y: Y(v) + 5, 'text-anchor': 'end' }, String(v)))),
    bands.map((b) => b.g), hv.g, pp.g, base, line, pts.map((p) => p.g));
  const draw = tweener((f) => {
    const y = RUNGS.map(([k]) => Y(f[k]));
    line.setAttribute('d', y.map((yy, i) => `${i ? 'L' : 'M'}${X(i)} ${yy.toFixed(1)}`).join(' '));
    pts.forEach((p, i) => { p.c.setAttribute('cy', y[i].toFixed(1)); p.v.setAttribute('y', (y[i] - 18).toFixed(1)); p.v.textContent = fmt(f[RUNGS[i][0]], 0); });
    bands.forEach((b, i) => {
      const d = f[RUNGS[i][0]] - f[RUNGS[i + 1][0]];
      b.g.setAttribute('opacity', clamp((d - 4) / 3, 0, 1).toFixed(3));
      b.t.textContent = `−${fmt(Math.max(0, d), 0)} mmHg`;
    });
    // Each span fades out when a level is not measurable (Budd-Chiari has no wedge). Its leaders end on the points.
    const put = (b, hi, lo, v, rate) => {
      const ok = Number.isFinite(hi) && Number.isFinite(lo) && Number.isFinite(v);
      b.g.setAttribute('opacity', ok ? 1 : 0);
      if (!ok) return;
      b.lead.setAttribute('d', `M${b.x0} ${b.row - 9}V${(Y(hi) + 12).toFixed(1)}M${b.x1} ${b.row - 9}V${(Y(lo) + 12).toFixed(1)}`);
      b.v.textContent = fmt(v, 1);
      b.g.dataset.rate = rate;
    };
    put(hv, f.whvp, f.fhvp, f.hvpg, rateOf('hvpg', f)[0] || 'ok');
    put(pp, f.pv, f.ra, f.ppg, rateOf('ppg', f)[0] || 'ok');
    el.setAttribute('aria-label', 'Pressure ladder: ' + RUNGS.map(([k, a, b]) => `${a} ${b} ${fmt(f[k], 0)}`).join(', ') + ' mmHg. '
      + `HVPG ${fmt(f.hvpg, 1)}, PPG ${fmt(f.ppg, 1)} mmHg.`);
  });
  return {
    el,
    setBase(b) { base.setAttribute('d', b ? RUNGS.map(([k], i) => `${i ? 'L' : 'M'}${X(i)} ${Y(b[k]).toFixed(1)}`).join(' ') : ''); },
    set(f, { key = [], ms } = {}) {
      pts.forEach((p, i) => p.g.classList.toggle('key', key.includes(RUNGS[i][0])));
      draw({ pv: f.pv, whvp: f.whvp, fhvp: f.fhvp, ra: f.ra, ivc: f.ivc, hvpg: f.hvpg, ppg: f.ppg }, ms);
    },
  };
}

/** Big number tiles, each rated; set() counts to the new values. Given ref (an earlier state's numbers), each
 *  tile also says how far it moved from there, green when it went the better way (and plain within normal). */
function bigTiles() {
  const el = h('div', { class: 'pz-tiles' });
  let sig = '', parts = [], draw = null;
  function build(ks, withRef) {
    parts = ks.map((k) => {
      const T = TILE[k] || { t: k, s: '', u: '' };
      const v = h('span', { class: 'pzt-v' }), u = h('small', {}, T.u), r = h('span', { class: 'pzt-r' }), d = h('span', { class: 'pzt-d' });
      const tile = h('div', { class: 'pz-tile' }, h('span', { class: 'pzt-k' }, T.t), h('span', { class: 'pzt-vu' }, v, u), r, withRef ? d : h('span', { class: 'pzt-s' }, T.s));
      return { k, T, tile, v, u, r, d };
    });
    el.replaceChildren(...parts.map((p) => p.tile));
    el.dataset.n = String(parts.length);
    draw = tweener((f) => parts.forEach((p) => {
      const [cls, word] = rateOf(p.k, f), none = cls == null && (p.k === 'saag' || p.k === 'tp');
      p.v.textContent = none ? '—' : tileVal(p.k, f[p.k]);
      p.u.hidden = none || !p.T.u;
      p.r.textContent = word;
      p.tile.dataset.rate = cls || 'none';
      const r0 = f['ref_' + p.k];
      if (r0 == null || f[p.k] == null) return;
      const x = p.T.x ?? 1, dg = p.T.d ?? 1, dd = (f[p.k] - r0) * x, same = Math.abs(dd) < 0.5 * 10 ** -dg;
      p.d.textContent = same ? 'No change' : `${dd < 0 ? '▼' : '▲'} ${fmt(Math.abs(dd), dg)} from ${fmt(r0 * x, dg)}`;
      const calm = cls === 'ok' && rateOf(p.k, { ...f, [p.k]: r0 })[0] === 'ok';   // (a change within normal is neither)
      p.d.dataset.way = same || calm || !p.T.better ? '' : Math.sign(dd) === p.T.better ? 'good' : 'bad';
    }));
  }
  return {
    el,
    set(f, ks, key = [], ref = null, ms) {
      const sg = ks.join() + (ref ? '|ref' : '');
      if (sg !== sig) { sig = sg; build(ks, !!ref); }
      parts.forEach((p) => p.tile.classList.toggle('key', key.includes(p.k)));
      const to = Object.fromEntries([...ks, 'asc'].map((k) => [k, f[k]]));
      if (ref) for (const k of ks) to['ref_' + k] = ref[k];
      draw(to, ms);
    },
  };
}

/** The six levels, portal vein to heart, the liver's three bracketed; mode: 'all' names each level and
 *  its place, a level id marks that one as the block, null shows the levels unmarked (a quiz). */
function rail(mode) {
  const at = SITES.findIndex(([id]) => id === mode);
  return h('div', { class: 'pz-rail' + (mode === 'all' ? ' all' : at >= 0 ? ' one' : ''), role: 'img', 'aria-label': at >= 0 ? `Block: ${SITES[at][1].replace('­', '')}` : 'Six levels: pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac' },
    h('div', { class: 'pz-rail-liver' }, h('span', {}, 'Liver')),
    h('ol', {}, SITES.map(([id, name, place], i) => h('li', { 'data-site': id, class: i === at ? 'on' : null },
      h('i', {}, i === at ? h('b') : null), h('span', { class: 'n' }, name), mode === 'all' ? h('span', { class: 'p' }, place) : null))));
}

// ── Visuals over the dimmed figure ─────────────────
/** One number on a scale with its thresholds, each patient a pin that glides from zero to its value.
 *  sc: { key, max, low, marks: [[value, words]] }: each zone is named under its middle (low names the
 *  first), a name too wide for its zone on two lines; rows: [{ name, f, site }]. */
function scaleVisual(sc, rows) {
  const W = 1400, H = 440, x0 = 70, x1 = W - 60, max = sc.max || 20, X = (v) => x0 + (x1 - x0) * clamp(v, 0, max) / max, Y = 268;
  const cuts = [0, ...sc.marks.map(([v]) => v), max];
  const zones = cuts.slice(0, -1).map((a, i) => [a, cuts[i + 1], ['ok', 'mid', 'hi', 'top'][Math.min(i, 3)], i ? sc.marks[i - 1][1] : sc.low]);
  const words = (t, x, room) => {
    const sp = [...t.matchAll(/ /g)].map((m) => m.index), at = sp.sort((a, b) => Math.abs(a - t.length / 2) - Math.abs(b - t.length / 2))[0];
    const lines = t.length * 13.5 > room - 20 && at != null ? [t.slice(0, at), t.slice(at + 1)] : [t];
    return sv('text', { class: 'pzs-mw', x, y: Y + 116, 'text-anchor': 'middle' }, lines.map((l, i) => sv('tspan', { x, dy: i ? 34 : 0 }, l)));
  };
  const pins = [...rows].filter((r) => r.f).sort((a, b) => a.f[sc.key] - b.f[sc.key]);
  const svg = sv('svg', { class: 'pz-scale', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': pins.map((r) => `${r.name} ${fmt(r.f[sc.key], 1)}`).join(', ') },
    zones.map(([a, b, c]) => sv('rect', { class: 'pzs-zone', 'data-rate': c, x: X(a), y: Y - 22, width: X(b) - X(a), height: 44 })),
    sc.marks.map(([v]) => sv('g', { class: 'pzs-mark' },
      sv('line', { x1: X(v), x2: X(v), y1: Y - 34, y2: Y + 34 }),
      sv('text', { class: 'pzs-mv', x: X(v), y: Y + 78, 'text-anchor': 'middle' }, String(v)))),
    zones.map(([a, b, , t]) => t ? words(t, (X(a) + X(b)) / 2, X(b) - X(a)) : null),
    sv('text', { class: 'pzs-mv', x: x0, y: Y + 78, 'text-anchor': 'middle' }, '0'),
    sv('text', { class: 'pzs-unit', x: x1, y: Y + 78, 'text-anchor': 'end' }, `${max}+ ${TILE[sc.key]?.u || ''}`),
    pins.map((r, i) => {
      const v = r.f[sc.key], up = i % 2 ? 150 : 72, [rate] = rateOf(sc.key, r.f);
      const g = sv('g', { class: 'pzs-pin', 'data-rate': rate || 'none', style: `--x:${(X(v) - x0).toFixed(1)}px; --i:${i}` },
        sv('line', { x1: x0, x2: x0, y1: Y - up + 12, y2: Y - 14 }),
        sv('circle', { cx: x0, cy: Y, r: 15 }),
        sv('text', { class: 'pzs-pv', x: x0, y: Y - up - 14, 'text-anchor': 'middle' }, fmt(v, 1)),
        sv('text', { class: 'pzs-pn', x: x0, y: Y - up + 4 - 54, 'text-anchor': 'middle' }, r.name));
      return g;
    }));
  requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('in')));
  return h('div', { class: 'pz-visual' }, svg);
}

/** SAAG against ascites protein: the four quadrants numbered on the plot and named beside it, the model's
 *  patients as points (two at one place share a point). */
const QUADS = [
  { n: 1, x: 1, y: 0, t: 'Portal hypertension, sealed sinusoids', c: 'Cirrhosis · late Budd–Chiari · massive liver metastases' },
  { n: 2, x: 1, y: 1, t: 'Portal hypertension, open sinusoids', c: 'Heart failure · constrictive pericarditis · early Budd–Chiari' },
  { n: 3, x: 0, y: 1, t: 'Not portal: the peritoneum leaks', c: 'Peritoneal cancer · tuberculosis · pancreatic ascites' },
  { n: 4, x: 0, y: 0, t: 'Not portal, protein-poor', c: 'Nephrotic syndrome · protein-losing enteropathy' },
];
function quadrantVisual(rows) {
  const W = 760, H = 640, L = 96, R = W - 24, T = 24, B = H - 92, X = (v) => L + (R - L) * clamp(v, 0, 3) / 3, Y = (v) => B - (B - T) * clamp(v, 0, 5) / 5;
  const xs = X(1.1), ys = Y(2.5);
  const pts = [];
  for (const r of rows) {
    if (!r.f || r.f.asc < NO_ASC) continue;
    const near = pts.find((p) => Math.abs(p.saag - r.f.saag) < 0.12 && Math.abs(p.tp - r.f.tp) < 0.2);
    if (near) near.names.push(r.name); else pts.push({ saag: r.f.saag, tp: r.f.tp, names: [r.name], site: r.site });
  }
  const box = [[L, T, xs, ys], [xs, T, R, ys], [L, ys, xs, B], [xs, ys, R, B]];
  const quadOf = (q) => box[(q.y ? 0 : 2) + q.x];
  const svg = sv('svg', { class: 'pz-quad', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'SAAG against ascites protein: ' + pts.map((p) => `${p.names.join(' and ')}, SAAG ${fmt(p.saag, 1)}, protein ${fmt(p.tp, 1)}`).join('; ') },
    QUADS.map((q) => { const [a, b, c, d] = quadOf(q); return sv('g', { class: 'pzq-q', 'data-portal': q.x ? 'y' : 'n' }, sv('rect', { x: a, y: b, width: c - a, height: d - b }), sv('text', { class: 'pzq-n', x: q.x ? c - 16 : a + 16, y: q.y ? b + 46 : d - 18, 'text-anchor': q.x ? 'end' : 'start' }, String(q.n))); }),
    sv('line', { class: 'pzq-cut', x1: xs, x2: xs, y1: T, y2: B }), sv('line', { class: 'pzq-cut', x1: L, x2: R, y1: ys, y2: ys }),
    sv('line', { class: 'pzq-axis', x1: L, x2: R, y1: B, y2: B }), sv('line', { class: 'pzq-axis', x1: L, x2: L, y1: T, y2: B }),
    [[0, '0'], [1.1, '1.1'], [2, '2'], [3, '3']].map(([v, t]) => sv('text', { class: 'pzq-t' + (v === 1.1 ? ' on' : ''), x: X(v), y: B + 34, 'text-anchor': 'middle' }, t)),
    [[0, '0'], [2.5, '2.5'], [5, '5']].map(([v, t]) => sv('text', { class: 'pzq-t' + (v === 2.5 ? ' on' : ''), x: L - 14, y: Y(v) + 9, 'text-anchor': 'end' }, t)),
    sv('text', { class: 'pzq-ax', x: (L + R) / 2, y: B + 76, 'text-anchor': 'middle' }, 'SAAG, g/dL'),
    sv('text', { class: 'pzq-ax', x: 0, y: 0, 'text-anchor': 'middle', transform: `translate(26 ${(T + B) / 2}) rotate(-90)` }, 'Ascites protein, g/dL'),
    pts.map((p, i) => {
      const x = X(p.saag), y = Y(p.tp), left = x > (L + R) / 2 + 120;
      return sv('g', { class: 'pzq-pt', 'data-site': p.site || 'none', style: `--i:${i}` },
        sv('circle', { cx: x, cy: y, r: 15 }),
        p.names.map((nm, j) => sv('text', { x: x + (left ? -26 : 26), y: y + 10 + (j - (p.names.length - 1) / 2) * 34, 'text-anchor': left ? 'end' : 'start' }, nm)));
    }));
  return h('div', { class: 'pz-visual pz-quadwrap' }, svg,
    h('ol', { class: 'pz-quads' }, QUADS.map((q) => h('li', { 'data-portal': q.x ? 'y' : 'n' },
      h('span', { class: 'qn' }, String(q.n)), h('span', { class: 'qt' }, q.t), h('span', { class: 'qc' }, q.c)))));
}

/** Why a clot before the liver leaves the abdomen dry: the gut's capillary wall holds protein back, so its
 *  oncotic pull holds the fluid in; the sinusoid's wall lets protein through, so pressure becomes lymph. */
function wallsVisual() {
  const W = 1400, H = 470;
  const panel = (ox, sin) => {
    const yW = 236, lumen = [yW + 16, yW + 132], dots = [];
    for (let i = 0; i < 8; i++) dots.push(sv('circle', { class: 'pzw-alb', cx: ox + 70 + i * 66, cy: lumen[0] + 30 + (i % 3) * 30, r: 8 }));   // (their drift stays in the lumen)
    const cross = [];
    // The sinusoid's wall: six plates with a pore between each; albumin rises through three of them.
    const pores = [104, 202, 300, 398, 496].map((x) => ox + x);
    if (sin) for (const x of [pores[0], pores[2], pores[4]]) cross.push(sv('circle', { class: 'pzw-alb pzw-cross', cx: x, cy: yW + 6, r: 8, style: `--d:${((x - ox) / 400).toFixed(2)}s` }));
    // (The flow ends below each band's name.)
    const arrows = (sin ? pores : [ox + 170, ox + 430]).map((x) => sv('path', { class: 'pzw-flow' + (sin ? ' big' : ''), d: `M${x} ${yW + 40} V${yW - (sin ? 22 : 26)}`, 'marker-end': 'url(#pzwArrow)' }));
    const wall = sin
      ? [0, 1, 2, 3, 4, 5].map((k) => sv('rect', { class: 'pzw-wall', x: ox + 20 + k * 98, y: yW, width: 70, height: 14, rx: 7 }))
      : [sv('rect', { class: 'pzw-wall', x: ox + 20, y: yW, width: 560, height: 14, rx: 7 }), sv('rect', { class: 'pzw-bm', x: ox + 20, y: yW - 9, width: 560, height: 6, rx: 3 })];
    return sv('g', { class: 'pzw-panel' + (sin ? ' sin' : '') },
      sv('text', { class: 'pzw-t', x: ox + 20, y: 44 }, sin ? 'Liver sinusoid' : 'Gut capillary'),
      sv('text', { class: 'pzw-s', x: ox + 20, y: 84 }, sin ? 'Open pores, no basement membrane' : 'Continuous wall, basement membrane'),
      sin ? [sv('rect', { class: 'pzw-hep', x: ox + 20, y: 108, width: 560, height: 42, rx: 12 }), sv('text', { class: 'pzw-l', x: ox + 34, y: 137 }, 'Liver cells'),
        sv('rect', { class: 'pzw-disse', x: ox + 20, y: 154, width: 560, height: 74, rx: 8 }), sv('text', { class: 'pzw-l', x: ox + 34, y: 180 }, 'Space of Disse: lymph')]
        : [sv('rect', { class: 'pzw-tissue', x: ox + 20, y: 108, width: 560, height: 120, rx: 12 }), sv('text', { class: 'pzw-l', x: ox + 34, y: 148 }, 'Tissue fluid: little')],
      sv('rect', { class: 'pzw-lumen', x: ox + 20, y: lumen[0], width: 560, height: lumen[1] - lumen[0], rx: 10 }),
      sv('g', { class: 'pzw-dots' }, dots), cross, wall, arrows,
      sv('text', { class: 'pzw-c', x: ox + 20, y: lumen[1] + 58 }, sin ? 'Protein crosses: nothing holds the fluid back' : 'Protein stays in: its pull holds the fluid back'),
      sv('text', { class: 'pzw-c2', x: ox + 20, y: lumen[1] + 96 }, sin ? 'A rise in pressure becomes lymph at once' : 'A rise in pressure makes little fluid'));
  };
  const svg = sv('svg', { class: 'pz-walls', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'The gut capillary wall holds protein back; the liver sinusoid lets it through' },
    sv('defs', {}, sv('marker', { id: 'pzwArrow', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, sv('path', { d: 'M0 0 L10 5 L0 10 z', class: 'pzw-head' }))),
    panel(0, false), panel(760, true));
  return h('div', { class: 'pz-visual' }, svg);
}

// ── The off-screen engine ──────────────────────────
// A second engine in its own worker (the main thread when workers are unavailable) computes the slides'
// states, so the live figure keeps running while a presentation is prepared.
function makeCalc() {
  const pending = new Map();
  let seq = 1, post = null, kill = () => {};
  const onMsg = (m) => {
    const p = pending.get(m.reqId);
    if (!p) return;
    if (m.type === 'seqStep') { p.step?.(m); return; }
    pending.delete(m.reqId); p.done(m);
  };
  const ready = (async () => {
    try {
      const w = new Worker(new URL('../worker.js?v=a52e51a150', import.meta.url), { type: 'module' });
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('worker timeout')), 6000);
        w.onmessage = (e) => { if (e.data?.type === 'presets') { clearTimeout(t); res(); } };
        w.onerror = (e) => { clearTimeout(t); rej(e); };
        w.postMessage({ type: 'visibility', visible: false });
        w.postMessage({ type: 'run', running: false });
        w.postMessage({ type: 'presets', reqId: 0 });
      });
      w.onmessage = (e) => onMsg(e.data); w.onerror = null;
      post = (m) => w.postMessage(m); kill = () => w.terminate();
    } catch {
      const { createCore } = await import('../worker-core.js?v=b3f3992766');
      const core = createCore((m) => setTimeout(() => onMsg(m), 0));
      core.handle({ type: 'visibility', visible: false }); core.handle({ type: 'run', running: false });
      post = (m) => core.handle(structuredClone(m)); kill = () => core.dispose();
    }
  })();
  const send = async (msg, entry) => { await ready; pending.set(msg.reqId, entry); post(msg); };
  return {
    request: (type, payload = {}) => new Promise((done) => send({ type, reqId: seq++, ...payload }, { done })),
    sequence: (steps, base, step) => new Promise((done) => send({ type: 'sequence', reqId: seq++, steps, base }, { done, step })),
    kill: () => kill(),
  };
}

export function createPresenter({ startCase, cases = [], host, stage, projectorOn, projectorOff, closeHome, homeTab, reopenHome, rerenderHome }) {
  const app = document.getElementById('app'), view = document.getElementById('stageView'), wrap = document.getElementById('stageWrap');
  let calc = null;
  const getCalc = () => (calc ||= makeCalc());
  const cache = new Map();   // deck id → computed states, reused the next time it is presented
  let deck = null, slides = [], states = [], waiters = [], stateOf = [], base = null, extraOf = new Map();
  // `gen` counts redraws asked of the slide in place (quiz on or off): a transition under way for an older one starts over.
  let want = 0, wantRev = false, shown = null, shownState = -1, busy = false, quiz = false, gen = 0;
  let ui = null, notesOpen = false, laser = null, black = false, speakerWin = null, speakerT = 0, startedAt = 0, digits = '', digitT = 0;
  let saved = null;

  const all = () => [...DECKS, ...readMine().map(fromScript)];
  // An instructor's script (captured model states) as slides: its own titles and notes, the ladder beside.
  function fromScript(s) {
    return { ...s, level: 'yours', mine: true, slides: (s.steps || []).map((st) => ({
      preset: st.preset, presetDays: st.presetDays, params: st.params, action: st.action, days: st.days, view: st.view, cam: st.view === 'circuit' ? 'fit' : st.cam || 'fit',
      kicker: st.kicker || s.title, title: st.title || 'Step', line: st.line || '', causes: st.causes, site: st.site, notes: st.notes || st.tell || '', ask: st.ask, data: 'ladder', key: st.key || [],
    })) };
  }

  // ── Slide states ──
  // stateOf[i]: the slide whose model state slide i shows (itself, or the last one before it that changed the model).
  const changes = (s) => !!(s.preset || s.params || s.action || s.days);
  function prepare() {
    const key = deck.mine ? null : deck.id;
    stateOf = []; let last = 0;
    slides.forEach((s, i) => { if (changes(s) || i === 0) last = i; stateOf[i] = last; });
    // Patients a visual compares that no slide shows ({ preset } rows): computed after the slides, each fresh.
    const extra = [...new Set(slides.flatMap((s) => (s.of || []).filter((o) => typeof o === 'object' && o.preset && !o.id).map((o) => o.preset)))];
    extraOf = new Map(extra.map((id, k) => [id, slides.length + k]));
    const hit = key && cache.get(key);
    if (hit) { states = hit.states; waiters = []; return; }
    const mine = []; states = mine; waiters = [];
    const c = getCalc(), steps = [...slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse } : {})), ...extra.map((id) => ({ preset: id }))];
    const presetAt = []; let pid = store.get().presetId;
    slides.forEach((s, i) => { if (s.preset) pid = s.preset; presetAt[i] = pid; });
    extra.forEach((id, k) => { presetAt[slides.length + k] = id; });
    const deckNow = deck;
    (async () => {
      const first = slides[0]?.preset ? null : (await host.request('snapshot')).snap;
      if (!base) c.request('presetMetrics', { ids: ['healthy'] }).then((m) => { base = m.result?.healthy || null; if (deck === deckNow) ui?.ladder.setBase(base); });
      await c.sequence(steps, first, (m) => {
        const st = { snap: m.snap, params: m.params, fp: m.fp, presetId: presetAt[m.i] };
        mine[m.i] = st;
        if (states !== mine) return;   // a newer presentation has started
        for (const w of waiters.filter((x) => x.i === m.i)) w.res(st);
        waiters = waiters.filter((x) => x.i !== m.i);
      });
      if (key) cache.set(key, { states: mine });
    })();
  }
  const stateReady = (i) => (states[i] ? Promise.resolve(states[i]) : new Promise((res) => waiters.push({ i, res })));

  function applyState(st) {
    host.send({ type: 'restore', snap: st.snap });
    replaceParams(structuredClone(st.params));
    store.set({ presetId: st.presetId, presetLoading: false, historyTick: (store.get().historyTick || 0) + 1 });
    host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
  }
  // The live engine has sent a frame of the new state (its portal pressure is the slide's), and two more frames have painted it.
  let frames = 0;
  store.on('frame', () => { frames++; });
  async function drawn(st) {
    const n0 = frames;
    await until(() => frames > n0 && Math.abs((store.get().frame?.metrics?.pv ?? -99) - st.fp.pv) < 0.6, 900);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  // ── The figure's moves ──
  const fadeMs = () => (reduce.matches ? 0 : 420);
  // A quiet arc over the figure's free space while a new patient settles (it fades in and out with the dim, never pops).
  const loading = (on) => ui?.load.classList.toggle('on', on);
  async function figureOut() { loading(true); view.classList.add('pz-out'); await wait(fadeMs()); }
  function figureIn() { view.classList.remove('pz-out'); loading(false); }
  async function toAnatomy() {
    if (store.get().sinusoid) { store.set({ sinusoid: false }); await wait(reduce.matches ? 300 : 1000); }
    if (store.get().lobule) { store.set({ lobule: false }); await until(() => stage.lobuleSettled(), 2600); await wait(80); }
  }
  // Glide the camera to a slide's framing; resolves when it has landed (cut(): a newer slide was asked for).
  async function camera(cam, s, cut) {
    const ms = reduce.matches ? 0 : 1500;
    if (LOBULE_CAM.test(cam)) {
      if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await wait(700); }
      if (!store.get().lobule) {
        // Whole figure → the liver → into it: the dive starts from the liver, filling the screen.
        stage.frameBox(REGIONS.liver, ms ? 1100 : 0, 2.4);
        await wait(ms ? 1150 : 0);
        if (cut()) return;
        store.set({ lobule: true });
        // (A first dive also loads the lobule, which a slow tablet can take several seconds over.)
        await until(() => cut() || (stage.lobuleSettled() && stage.lobuleOpen()), 9000);
        if (cut()) return;
        await wait(120);
      } else await until(() => cut() || stage.lobuleOpen(), 9000);
      if (cut()) return;
      const sin = cam === 'sinusoid' && sinusoidSupported() && stage.lobuleOpen();
      if (sin) { if (!store.get().sinusoid) { store.set({ sinusoid: true }); await wait(ms ? 1250 : 0); } return; }
      if (store.get().sinusoid) { store.set({ sinusoid: false }); await wait(ms ? 1000 : 0); }
      stage.lobuleFocus(cam === 'sinusoid' ? 'sinusoid' : cam.split(':')[1] || 'fit', { zoom: s.zoom ?? 2.3, ms });
      await wait(ms);
      return;
    }
    await toAnatomy();
    if (cut()) return;
    const v = s.view || 'anatomic';
    if (store.get().view !== v) { store.set({ view: v }); await wait(700); }
    if (cam === 'fit' || v === 'circuit') stage.fitSlow(ms);
    else stage.frameBox(Array.isArray(cam) ? cam : REGIONS[cam] || REGIONS.route, ms, s.kMax || 3.2);
    await wait(ms);
  }

  // ── The HVPG catheter (stage.setCatheter, as Measure › HVPG draws it), choreographed slide by slide: in along
  // the jugular route with the camera following, the tip close up, the balloon up and the still column, the
  // readings; each step eases on from wherever the last one left it, and it slides out with its slides.
  const CC = { free: '#5CA4F2', wedge: '#A68CF2', bad: '#FF7A85' };   // the procedure's own colours
  const cath = { on: false, raf: 0, t0: 0, v: { u: 0, balloon: 0, column: 0, opacity: 1 }, tr: {}, show: [], ring: null, ostium: false, probeT0: 0, follow: false, cam: null, fp: null };
  function cathTrack(k, to, ms, delay = 0) { cath.tr[k] = { from: cath.v[k], to, t0: performance.now() + delay, ms: reduce.matches ? 0 : ms }; }
  function cathLabels() {
    const f = cath.fp, v = cath.v;
    if (!f) return [];
    const sev = f.hvpg >= 10 ? 'danger' : f.hvpg >= 5 ? 'caution' : 'ok';
    const free = { key: 'f', at: 'tip', kicker: 'FHVP', text: fmt(f.fhvp, 1), unit: 'mmHg', cls: 'free' };
    const wedge = { key: 'w', at: 'ahead', kicker: 'WHVP', text: fmt(f.fhvp + (f.whvp - f.fhvp) * v.column, 1), unit: 'mmHg', cls: 'wedge' };
    const L = { f: free, w: wedge,
      sum: { key: 's', at: 'sum', rows: [{ ...wedge, text: fmt(f.whvp, 1) }, free], calc: { kicker: 'HVPG', text: fmt(f.hvpg, 1), unit: 'mmHg', cls: 'result ' + sev } },
      occ: { key: 'p', at: 'tip', kicker: 'Hepatic vein', text: 'Occluded', unit: '', cls: 'wedge' },
      abort: { key: 'a', at: 'tip', kicker: 'Unable to cannulate', text: 'No reading', unit: '', cls: 'result danger' } };
    return cath.show.map((k) => L[k]);
  }
  function cathFrame() {
    const now = performance.now(), v = cath.v;
    for (const [k, t] of Object.entries(cath.tr)) {
      const u = t.ms ? clamp((now - t.t0) / t.ms, 0, 1) : now >= t.t0 ? 1 : 0;
      v[k] = t.from + (t.to - t.from) * ease(u);
      if (u >= 1) delete cath.tr[k];
    }
    // Three short pushes against the clot (Budd–Chiari), each easing in and back out.
    const pk = cath.probeT0 ? clamp((now - cath.probeT0) / 3600, 0, 1) : 1, probe = pk < 1 ? Math.sin(pk * 3 * Math.PI) ** 2 * 0.9 : 0;
    stage.setCatheter({ u: v.u, balloon: v.balloon, column: v.column, columnColor: cath.fp ? pressureColor(cath.fp.whvp) : null, ring: cath.ring,
      pulse: 0.5 + 0.5 * Math.sin((now - cath.t0) / 170), clock: now - cath.t0, opacity: v.opacity, labels: cathLabels(), ostium: cath.ostium, probe });
    if (cath.follow) stage.cathFollow();
    cath.raf = requestAnimationFrame(cathFrame);
  }
  function cathStop() {
    cancelAnimationFrame(cath.raf);
    if (cath.on) { stage.setCatheter(null); stage.cathForget(); }
    Object.assign(cath, { on: false, v: { u: 0, balloon: 0, column: 0, opacity: 1 }, tr: {}, show: [], ring: null, ostium: false, probeT0: 0, follow: false, cam: null, fp: null });
  }
  // Out: the readings go, the balloon goes down and the catheter fades (at once when the figure is fading anyway).
  async function cathOut(fading) {
    if (!cath.on) return;
    if (!fading) {
      cath.show = []; cath.ring = null; cath.follow = false; cath.probeT0 = 0;
      cathTrack('balloon', 0, 400); cathTrack('column', 0, 400); cathTrack('opacity', 0, 650);
      await wait(reduce.matches ? 0 : 700);
    } else await figureOut();
    cathStop();
  }
  async function cathTo(mode, fp, cut) {
    await toAnatomy();
    if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await wait(700); }
    if (cut()) return;
    if (!cath.on) { cath.on = true; cath.t0 = performance.now(); cath.ostium = mode === 'blocked'; cathFrame(); }
    cath.fp = fp;
    const v = cath.v, ms = (m) => (reduce.matches ? 0 : m);
    // In along the route from wherever the tip is, the view following it down.
    if (v.u < 0.999) {
      cath.show = []; cath.ring = null;
      if (!stage.cathFocus('route', ms(1200))) return;
      cath.cam = 'route';
      await wait(ms(1000)); if (cut()) return;
      const t = 3800 * (1 - v.u);
      cath.follow = true; cathTrack('u', 1, t);
      await wait(ms(t + 100)); cath.follow = false; if (cut()) return;
    }
    if (mode === 'route') {
      cath.show = []; cath.ring = null; cathTrack('balloon', 0, 500); cathTrack('column', 0, 500);
      if (cath.cam !== 'route') { stage.cathFocus('route', ms(1300)); cath.cam = 'route'; await wait(ms(1300)); }
      return;
    }
    // The tip close up (again each slide: the data card may have come or gone).
    stage.cathFocus('tip', ms(cath.cam === 'tip' ? 700 : 1500)); 
    await wait(ms(cath.cam === 'tip' ? 700 : 1500)); cath.cam = 'tip';
    if (cut()) return;
    if (mode === 'blocked') {
      cath.show = ['occ']; cath.ring = null; cath.probeT0 = performance.now();
      await wait(ms(3800)); if (cut()) return;
      cath.show = ['abort']; cath.ring = CC.bad;
      return;
    }
    if (mode === 'free') { cath.show = ['f']; cath.ring = CC.free; cathTrack('balloon', 0, 500); cathTrack('column', 0, 500); return; }
    // Wedge: the balloon goes up just behind the tip, flow stops, the still column fills toward the sinusoids.
    if (v.balloon < 0.999) { cath.show = ['f']; cath.ring = CC.free; cathTrack('balloon', 1, 800); await wait(ms(900)); if (cut()) return; }
    cath.ring = CC.wedge;
    if (v.column < 0.999) { cath.show = ['f', 'w']; cathTrack('column', 1, 1800); await wait(ms(1900)); if (cut()) return; }
    cath.show = mode === 'result' ? ['sum'] : ['f', 'w'];
    if (mode === 'result') cath.ring = null;
  }

  // ── A time-lapse on the live model: its days run on the disease clock (ramped as the off-screen chain ran them),
  // the counter and the numbers follow, then the slide's computed state takes over (the same, to the decimal).
  let lapseOn = false;
  function stopLapse() { if (!lapseOn) return; lapseOn = false; host.send({ type: 'lapse', days: 0 }); shownState = -1; }
  const lapseWords = (n) => (n >= 60 && n % 30 === 0 ? `${n / 30} months` : `${n} days`);
  function paintLapse(d, n, done = false) {
    const el = ui?.text.querySelector('.pz-lapse');
    if (!el) return;
    el.style.setProperty('--k', (n ? d / n : 0).toFixed(3));
    el.querySelector('.pzl-t').textContent = done ? `${lapseWords(n)} later` : `Day ${Math.round(d)} of ${n}`;
    el.classList.toggle('done', done);
  }
  const tileKeys = (s) => s.tiles || (s.data === 'ladder' ? ['hvpg', 'ppg'] : []);
  function dataTo(s, f, ref, ms) {
    if (!ui) return;
    if (s.data === 'ladder') ui.ladder.set(f, { key: s.key || [], ms });
    if (s.data) ui.tiles.set(f, tileKeys(s), s.key || [], ref, ms);
  }
  async function playLapse(s, to, cut) {
    const end = await stateReady(stateOf[to]);
    if (!end || cut()) return;
    const days = s.days, d0 = store.get().frame?.day ?? 0, ref = refOf(s, to);
    lapseOn = true;
    host.send({ type: 'lapse', days, speed: days / (s.lapse.seconds || 8), ramp: s.ramp || null });
    while (lapseOn && !cut()) {
      await wait(150);
      const fr = store.get().frame, d = clamp((fr?.day ?? d0) - d0, 0, days);
      paintLapse(d, days);
      if (fr?.metrics) dataTo(s, liveFp(fr), ref, 280);
      if (d >= days && fr?.clock === 'hemo') break;
    }
    if (!lapseOn || cut()) { stopLapse(); return; }
    lapseOn = false;
    applyState(end); shownState = stateOf[to];
    paintLapse(days, days, true);
    dataTo(s, end.fp, ref, 700);
  }

  // ── Slides ──
  const asking = (s, rev) => quiz && !!s.quiz && !rev;
  function go(i, rev = false) {
    if (!deck) return;
    want = clamp(i, 0, slides.length - 1); wantRev = rev;
    paintChrome();
    if (!busy) run();
  }
  const next = () => { const s = slides[want]; if (asking(s, wantRev)) go(want, true); else if (want < slides.length - 1) go(want + 1); };
  const prev = () => { if (want > 0) go(want - 1); };
  async function run() {
    busy = true;
    try {
      while (deck && (!shown || shown.i !== want || shown.rev !== wantRev || shown.gen !== gen)) await transition(want, wantRev);
    } finally { busy = false; }
  }
  async function transition(to, rev) {
    const g = gen, s = slides[to], cut = () => !deck || want !== to || wantRev !== rev || gen !== g;
    const q = asking(s, rev), cam = s.visual ? s.cam || null : q ? 'fit' : s.cam || 'fit';
    // A time-lapse starts from the slide before's state; a catheter slide drives its own camera.
    const lap = !!s.lapse && to > 0 && !q, ct = !q && !s.visual ? s.cath || null : null;
    // Words out, and the marks: they belong to the slide that is leaving.
    store.set({ focus: null, presentLabels: [] });
    stopLapse();
    await wordsOut(s);
    if (cut()) return;
    const si = lap ? stateOf[to - 1] : stateOf[to];
    // The catheter leaves with its slides (with a new patient, the figure's fade takes it).
    if (cath.on && (!ct || si !== shownState)) { await cathOut(si !== shownState && shownState >= 0); if (cut()) return; }
    // Out of the lobule while the old patient is still there, so the rise reads as leaving the liver.
    if ((ct || (cam && !LOBULE_CAM.test(cam))) && (store.get().lobule || store.get().sinusoid)) { await toAnatomy(); if (cut()) return; }
    // (A patient still being computed off screen: after a short wait the arc shows.)
    const lateT = states[si] ? 0 : setTimeout(() => loading(true), 260);
    const st = await stateReady(si);
    clearTimeout(lateT);
    if (!st || cut()) return;
    // A visual waits for every patient it compares (some are computed after the slides).
    if (s.visual) { await Promise.all(rowIdx(s).map(stateReady)); if (cut()) return; }
    // A new patient, or the same one changed: the figure fades out, the state changes unseen, it fades back in.
    const swap = si !== shownState;
    if (swap) {
      if (shownState >= 0 && !view.classList.contains('pz-out')) await figureOut();
      applyState(st); shownState = si;
      await drawn(st);
      if (!deck) return;
    }
    wordsIn(s, q, st, to);
    if (swap || view.classList.contains('pz-out')) figureIn(); else loading(false);
    if (cut()) return;
    if (ct) await cathTo(ct, st.fp, cut);
    else if (cam) await camera(cam, s, cut);
    if (cut()) return;
    if (!s.visual) store.set({ presentLabels: q ? [] : s.labels || [], focus: !q && s.mark ? { edges: [...s.mark.edges], label: s.mark.label } : null });
    shown = { i: to, rev, gen: g };
    paintChrome();
    if (lap) await playLapse(s, to, cut);
  }

  // ── The slide's words, data and visual ──
  // Tiles beside a sinusoid sit under the words, so the vessel has the width of the screen.
  const under = (s) => s.data === 'tiles' && !s.visual && /^sinusoid/.test(s.cam || '');
  async function wordsOut(next) {
    if (!ui) return;
    const out = [ui.text, ui.panel], data = ui.data;
    // A card that moves (under the words, or back beside them) goes out with the words and comes back in its new place.
    // (Also when its kind or title changes, so the ladder never appears or goes under the numbers in one frame.)
    const lad = next?.data === 'ladder', ttl = lad ? 'Pressure, portal vein to heart' : next?.dataTitle || 'This patient, from the model';
    const move = !data.hidden && !data.classList.contains('pz-hide') && next && (next.data === 'ladder' || next.data === 'tiles') && !next.visual
      && (under(next) !== data.classList.contains('under') || !lad !== data.classList.contains('tiles-only') || ttl !== ui.dhT.textContent);
    if (move) data.classList.add('pz-hide');
    if (!move && out.every((el) => el.hidden || !el.childElementCount)) return;
    for (const el of out) el.classList.add('pz-leave');
    await wait(reduce.matches ? 0 : move ? 340 : 220);
  }
  // A slide's tiles can say how far each number moved: from the slide before (delta: true) or a named one.
  const refOf = (s, i) => (s.delta === true ? states[stateOf[i - 1]]?.fp : typeof s.delta === 'string' ? fpOf(s.delta) : null) || null;
  function wordsIn(s, q, st, i) {
    if (!ui) return;
    const { text, panel, data } = ui;
    text.classList.remove('pz-leave');   // (the panel's own is let go once its new content is in, so it never fades back in with the old)
    const kick = (site, words) => h('div', { class: 'pz-kick', 'data-site': site || 'none' }, h('i'), words);
    if (s.visual) {
      text.hidden = true; text.replaceChildren();
      // A panel that was not there fades in (never pops): unhidden while still faded, then let go.
      if (panel.hidden) { panel.classList.add('pz-leave'); panel.hidden = false; void panel.offsetWidth; }
      panel.classList.toggle('fill', s.visual === 'ladders');
      panel.dataset.visual = s.visual;
      panel.replaceChildren(h('div', { class: 'pz-ph' }, kick(null, s.kicker), h('h1', { class: 'pz-h' }, nb(s.title)), s.line ? h('p', { class: 'pz-line' }, s.line) : null),
        VISUALS[s.visual](s));
      panel.classList.remove('pz-leave');
      ui.veil.classList.add('on');
    } else {
      panel.hidden = true; panel.replaceChildren(); panel.classList.remove('pz-leave'); ui.veil.classList.remove('on');
      text.hidden = false;
      text.replaceChildren(...(q
        ? [kick(null, 'Quiz'), h('h1', { class: 'pz-h' }, s.quiz), s.rail ? rail(null) : null, h('p', { class: 'pz-line pz-hint' }, 'Take answers from the audience, then press → to show the answer.')]
        : [kick(s.site, s.kicker), h('h1', { class: 'pz-h' }, nb(s.title)), s.line ? h('p', { class: 'pz-line' }, s.line) : null,
          s.lapse && i > 0 ? h('div', { class: 'pz-lapse', role: 'status' }, h('span', { class: 'pzl-bar' }, h('i')), h('span', { class: 'pzl-t' }, `Day 0 of ${s.days}`)) : null,
          s.rail ? rail(s.rail === 'all' ? 'all' : s.site) : null,
          s.causes?.length ? h('div', { class: 'pz-causes' }, h('span', { class: 'pz-sub' }, s.causesHead || 'Causes'), h('ul', {}, s.causes.map((c) => h('li', {}, c)))) : null]));
      [...text.children].forEach((c, k) => c.style.setProperty('--i', k));
      text.classList.remove('pz-enter'); void text.offsetWidth; text.classList.add('pz-enter');
    }
    const showData = (s.data === 'ladder' || s.data === 'tiles') && !s.visual;
    if (showData) {
      const lad = s.data === 'ladder';
      data.classList.toggle('tiles-only', !lad);
      data.classList.toggle('under', under(s));
      ui.dhT.textContent = lad ? 'Pressure, portal vein to heart' : s.dataTitle || 'This patient, from the model';
      ui.dhL.hidden = !lad;
      if (lad) ui.ladder.set(st.fp, { key: q ? [] : s.key || [] });
      ui.tiles.set(st.fp, tileKeys(s), q ? [] : s.key || [], q ? null : refOf(s, i));
      if (data.hidden) { data.hidden = false; data.classList.add('pz-hide'); void data.offsetWidth; }
      data.classList.remove('pz-hide');
    } else if (!data.hidden) {
      data.classList.add('pz-hide');
      setTimeout(() => { if (data.classList.contains('pz-hide')) data.hidden = true; }, reduce.matches ? 0 : 320);
    }
    layout();
    writeNotes(); paintSpeaker();
  }
  const fpOf = (id) => { const i = slides.findIndex((x) => x.id === id); return i >= 0 ? states[stateOf[i]]?.fp : null; };
  // A visual's rows: the deck's slides by id ('pvt', or { id, name } to name it), or { preset, name } patients that
  // no slide shows, computed after the slides.
  const rowAt = (o) => { const id = typeof o === 'string' ? o : o.id, i = id ? slides.findIndex((x) => x.id === id) : -1; return [i, i >= 0 ? stateOf[i] : extraOf.get(o.preset)]; };
  const rowIdx = (s) => (s.of || []).map((o) => rowAt(o)[1]).filter((k) => k != null && k >= 0);
  function rowsOf(s) {
    return (s.of || []).map((o) => {
      const [i, k] = rowAt(o), sl = i >= 0 ? slides[i] : null, x = typeof o === 'object' ? o : {};
      if (k == null || k < 0) return null;
      const title = x.title ?? sl?.title ?? '';
      return { i, f: states[k]?.fp, kicker: x.kicker ?? sl?.kicker ?? '', title, name: x.name || title, site: x.site ?? sl?.site, note: x.note, blank: x.blank || [] };
    }).filter(Boolean);
  }
  function laddersGrid(s) {
    const grid = h('div', { class: 'pz-grid' });
    for (const r of rowsOf(s)) {
      if (!r.f) continue;
      const L = bigLadder(); L.setBase(base); L.set(r.f, {});
      grid.append(h('div', { class: 'pz-cell' },
        h('div', { class: 'pz-cell-k' }, h('div', { class: 'pz-kick', 'data-site': r.site || 'none' }, h('i'), r.kicker.replace('Intrahepatic · ', '')),
          h('span', {}, 'HVPG ', h('b', { 'data-rate': rateOf('hvpg', r.f)[0] }, fmt(r.f.hvpg, 1)))),
        h('div', { class: 'pz-cell-t' }, r.title), L.el));
    }
    return grid;
  }
  // The table's columns: the raw pressures shade above normal, the rest by their tile's rating.
  const COLS = { pv: 'Portal', whvp: 'Wedged', fhvp: 'Free HV', ra: 'RA', hvpg: 'HVPG', ppg: 'PPG', sin: 'Sinusoids', varix: 'Varix, mm', asc: 'Ascites, L', liver: 'Liver flow, %', saag: 'SAAG', tp: 'Protein', plt: 'Platelets' };
  const RAW = { pv: (v) => v > 10, whvp: (v) => v > 10, fhvp: (v) => v > 8, ra: (v) => v > 8 };
  const PRESS = new Set(['pv', 'whvp', 'fhvp', 'ra', 'hvpg', 'ppg', 'sin']);
  const cellRate = (k, f) => (RAW[k] ? (RAW[k](f[k]) ? 'hi' : null) : ['hi', 'mid'].includes(rateOf(k, f)[0]) ? rateOf(k, f)[0] : null);
  function summaryTable(s) {
    const cols = s.cols || ['pv', 'whvp', 'fhvp', 'ra', 'hvpg', 'ppg'], asc = s.asc ?? !s.cols;
    const val = (k, f) => (PRESS.has(k) && !s.fine ? fmt(f[k], 0) : tileVal(k, f[k]));
    return h('div', { class: 'pz-table' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, s.rowHead || 'Level'), cols.map((k) => h('th', { class: 'num' }, COLS[k] || k)), asc ? h('th', {}, 'Ascites: SAAG, protein') : null, s.note ? h('th', {}, s.note) : null)),
      h('tbody', {}, rowsOf(s).map((r) => h('tr', r.i >= 0 ? { onclick: () => go(r.i) } : { class: 'static' },
        h('th', { scope: 'row' }, h('span', { class: 'pz-kick', 'data-site': r.site || 'none' }, h('i'), r.kicker.replace('Intrahepatic · ', '')), h('span', { class: 'tn' }, nb(r.title))),
        cols.map((k) => (r.blank.includes(k) ? h('td', { class: 'num blank' }, '–') : h('td', { class: 'num', 'data-rate': r.f ? cellRate(k, r.f) : null }, r.f ? val(k, r.f) : '…'))),
        asc ? h('td', { class: 'asc' }, !r.f ? '…' : r.f.asc < NO_ASC ? h('span', { class: 'none' }, 'None') : [h('b', { 'data-rate': r.f.saag >= 1.1 ? 'hi' : null }, fmt(r.f.saag, 1)), ' · ', h('b', {}, fmt(r.f.tp, 1)), h('small', {}, r.f.tp >= 2.5 ? ' high protein' : ' low protein')]) : null,
        s.note ? h('td', { class: 'note' }, r.note || '') : null)))),
    h('p', { class: 'pz-foot' }, s.foot || `${asc || cols.includes('saag') || cols.includes('tp') ? 'Pressures in mmHg, SAAG and protein in g/dL' : 'Pressures in mmHg'}, from the model. Shaded: abnormal. Pick a row to go back to it.`));
  }
  const VISUALS = {
    table: summaryTable,
    ladders: laddersGrid,
    scale: (s) => scaleVisual(s.scale, rowsOf(s)),
    quadrant: (s) => quadrantVisual(rowsOf(s)),
    walls: () => wallsVisual(),
  };

  // ── Layout: what the slide's words and data cover, so the figure frames itself in the rest ──
  const phone = () => innerWidth < 768 || innerWidth < innerHeight * 0.95;
  function layout() {
    if (!ui) return;
    const p = phone(), W = wrap.clientWidth, H = wrap.clientHeight, wr = wrap.getBoundingClientRect();
    ui.root.classList.toggle('stack', p); ui.shade.classList.toggle('stack', p);
    const off = (el) => el.hidden || el.classList.contains('pz-hide');
    const below = !p && ui.data.classList.contains('under');
    if (off(ui.data) || below) delete ui.data.dataset.safe; else ui.data.dataset.safe = p ? 'bottom' : 'right';
    const r = (el) => (off(el) ? null : el.getBoundingClientRect());
    const t = r(ui.text);
    // (Under the words: in the left column, clear of the bottom.)
    if (below && t) { const y = t.bottom - wr.top + 28; ui.data.style.top = `${Math.round(y)}px`; ui.data.style.maxHeight = `${Math.round(H - y - 24)}px`; }
    else { ui.data.style.top = ''; ui.data.style.maxHeight = ''; }
    const d = below ? null : r(ui.data);
    // The words get a soft backdrop of the page colour, so a zoomed figure behind them never runs through the
    // text; it fades out over 130 px (48 on a phone), and the figure frames itself from most of the way across.
    const L = t ? t.right - wr.left : 0, T = t ? t.bottom - wr.top : 0;
    ui.shade.style.width = !p && t ? `${L + 140}px` : '';
    ui.shade.style.height = p && t ? `${T + 48}px` : '';
    ui.shade.style.opacity = t ? '1' : '0';
    ui.safe.hidden = !t;
    ui.safe.dataset.safe = p ? 'top' : 'left';
    ui.safe.style.width = p ? '' : `${L + 90}px`;
    ui.safe.style.height = p ? `${T + 20}px` : '';
    const set = (k, v) => app.style.setProperty(k, `${Math.max(0, Math.round(v))}px`);
    set('--pz-l', !p && t ? L + 90 : 0);
    set('--pz-r', !p && d ? W - (d.left - wr.left) + 8 : 0);
    set('--pz-t', p && t ? T + 20 : 0);
    set('--pz-b', p && d ? H - (d.top - wr.top) + 4 : 0);
    dispatchEvent(new Event('pps:occ'));
  }
  const onResize = () => {
    if (!ui) return;
    layout(); setLabels();
    if (!shown) return;
    const s = slides[shown.i], cam = s.visual ? s.cam : asking(s, shown.rev) ? 'fit' : s.cam || 'fit';
    if (cath.on && cath.cam) stage.cathFocus(cath.cam, 400);
    else if (cam && !LOBULE_CAM.test(cam) && !store.get().lobule) { if (cam === 'fit') stage.fitSlow(400); else stage.frameBox(Array.isArray(cam) ? cam : REGIONS[cam] || REGIONS.route, 400, s.kMax || 3.2); }
  };
  // Projector-size labels on the figure, for the screen it is on (2 at 1080 lines).
  function setLabels() {
    const k = phone() ? 1.15 : clamp(Math.min(innerHeight / 540, innerWidth / 960), 1.25, 2.4);
    stage.setProjection(k);
    document.documentElement.style.setProperty('--label-k', String(Math.min(k, 2.2)));
    dispatchEvent(new Event('pps:labelscale'));
  }

  // ── Chrome: counter, progress, controls ──
  function paintChrome() {
    if (!ui) return;
    const n = slides.length, i = want;
    ui.count.textContent = `${i + 1} / ${n}`;
    ui.prog.style.setProperty('--p', String((i + 1) / n));
    // A phone keeps it to Back, the count, Next (Finish on the last slide) and Exit, always in view.
    const ph = phone(), last = i === n - 1 && !asking(slides[i], wantRev);
    ui.bar.classList.toggle('phone', ph);
    if (ph) {
      ui.bar.classList.remove('idle');
      ui.bar.replaceChildren(
        h('button', { class: 'btn sm', 'aria-label': 'Previous slide', disabled: i === 0, onclick: prev }, icon('chev-left'), 'Back'),
        h('span', { class: 'pzb-n' }, `${i + 1} / ${n}`),
        h('button', { class: 'btn sm primary', 'aria-label': last ? 'Finish presenting' : 'Next slide', onclick: last ? stop : next }, last ? 'Finish' : 'Next', last ? null : icon('chev-right')),
        h('button', { class: 'ib', 'aria-label': 'Exit the presentation', title: 'Exit', onclick: stop }, icon('close')));
      writeNotes(); paintSpeaker();
      return;
    }
    ui.bar.replaceChildren(
      h('button', { class: 'ib', 'aria-label': 'Previous slide', title: 'Previous (←)', disabled: i === 0, onclick: prev }, icon('chev-left')),
      h('span', { class: 'pzb-n' }, `${i + 1} / ${n}`),
      h('button', { class: 'ib', 'aria-label': 'Next slide', title: 'Next (→)', disabled: i === n - 1 && !asking(slides[i], wantRev), onclick: next }, icon('chev-right')),
      h('span', { class: 'pzb-sep' }),
      deck.slides.some((s) => s.quiz) ? h('button', { class: 'btn sm', 'aria-pressed': String(quiz), title: 'Quiz the room: ask first, reveal on the next click (Q)', onclick: toggleQuiz }, 'Quiz') : null,
      h('button', { class: 'btn sm', 'aria-pressed': String(notesOpen), title: 'Speaker notes (N)', onclick: () => toggleNotes() }, 'Notes'),
      h('button', { class: 'btn sm', title: 'Speaker window: notes, next slide, timer (S)', onclick: speaker }, 'Speaker'),
      h('button', { class: 'btn sm', 'aria-pressed': String(!!laser), title: 'Laser pointer (L)', onclick: toggleLaser }, 'Laser'),
      h('button', { class: 'ib', 'aria-label': 'Black screen', title: 'Black screen (B)', onclick: () => toggleBlack() }, icon('pause')),
      document.fullscreenEnabled ? h('button', { class: 'ib', 'aria-label': 'Full screen', title: 'Full screen (F)', onclick: fullscreen }, icon('fit')) : null,
      h('button', { class: 'ib', 'aria-label': 'Stop presenting', title: 'Stop (Esc)', onclick: stop }, icon('close')));
    writeNotes(); paintSpeaker();
  }
  let idleT = 0;
  function wake() {
    if (!ui) return;
    ui.bar.classList.remove('idle');
    clearTimeout(idleT);
    if (phone()) return;   // (a phone's controls never hide)
    idleT = setTimeout(() => { if (ui && !ui.bar.matches(':hover, :focus-within')) ui.bar.classList.add('idle'); else wake(); }, 2600);
  }
  function toggleQuiz() {
    quiz = !quiz;
    toast(quiz ? 'Quiz: each level opens as a question; the next click reveals it.' : 'Quiz off.');
    gen++; shown = null; go(want, false);
  }
  function toggleBlack(on = !black) { black = on; ui?.black.classList.toggle('on', black); }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
  function toggleLaser() {
    if (laser) { laser.remove(); laser = null; document.body.classList.remove('laser-on'); paintChrome(); return; }
    laser = h('div', { class: 'laser', 'aria-hidden': 'true' });
    document.body.append(laser); document.body.classList.add('laser-on'); paintChrome();
  }
  addEventListener('pointermove', (e) => { if (laser) laser.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; if (deck) wake(); });
  addEventListener('pointerdown', () => { if (deck) wake(); });

  // ── Speaker notes: a drawer (N), or a second window for the presenter's screen (S) ──
  const noteOf = (s) => ({ notes: s?.notes || '', ask: s?.ask });
  function toggleNotes(force) { notesOpen = force ?? !notesOpen; writeNotes(); paintChrome(); }
  function writeNotes() {
    if (!ui) return;
    ui.notes.hidden = !notesOpen;
    if (!notesOpen) return;
    const s = slides[want], nx = slides[want + 1], { notes, ask } = noteOf(s);
    ui.notes.replaceChildren(
      h('div', { class: 'pn-top' }, h('span', { class: 'pn-k' }, `Speaker notes · ${want + 1} / ${slides.length}`), h('button', { class: 'ib', 'aria-label': 'Close notes', onclick: () => toggleNotes(false) }, icon('close'))),
      h('h2', {}, s.title), h('p', {}, notes || 'No notes for this slide.'),
      ask ? h('div', { class: 'pn-ask' }, h('b', {}, 'Question for the audience'), h('p', {}, ask[0]), ask[1] ? h('p', { class: 'pn-a' }, 'Answer: ' + ask[1]) : null) : null,
      nx ? h('p', { class: 'pn-next' }, `Next: ${nx.title}`) : null);
  }
  function speaker() {
    if (speakerWin && !speakerWin.closed) { speakerWin.focus(); return; }
    speakerWin = open('', 'pps-speaker', 'popup,width=980,height=720');
    if (!speakerWin) { toast('Allow pop-ups for this site to open the speaker window.'); return; }
    const d = speakerWin.document;
    d.title = 'Speaker · ' + deck.title;
    d.head.innerHTML = `<meta name="viewport" content="width=device-width"><style>
      body{margin:0;font:18px/1.5 Inter,system-ui,sans-serif;background:#10141c;color:#e9edf6}
      header{display:flex;align-items:center;gap:16px;padding:14px 22px;border-bottom:1px solid #263047}
      header b{font-size:30px;font-variant-numeric:tabular-nums}header span{color:#a9b2c7}
      header button{font:inherit;font-size:16px;padding:8px 16px;border-radius:10px;border:1px solid #33405f;background:#1b2438;color:#e9edf6;cursor:pointer}
      .sp{flex:1}main{display:grid;grid-template-columns:2fr 1fr;gap:28px;padding:22px}
      h1{font:600 34px/1.15 Georgia,serif;margin:4px 0 14px}.k{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#8f99b3}
      .ask{margin-top:18px;padding:12px 16px;border-left:4px solid #7c9bff;background:#1b2438;border-radius:8px}.ask p{margin:4px 0}.a{color:#a9b2c7}
      .nx{color:#a9b2c7}.nx h2{font:600 22px/1.25 Georgia,serif;color:#e9edf6;margin:6px 0}</style>`;
    d.body.innerHTML = '<header><b id="t">0:00</b><span id="n"></span><span class="sp"></span><button id="p">◀ Back</button><button id="x">Next ▶</button></header><main><section id="c"></section><aside class="nx" id="nx"></aside></main>';
    d.getElementById('p').onclick = prev; d.getElementById('x').onclick = next;
    speakerWin.addEventListener('keydown', onKey, true);
    clearInterval(speakerT); speakerT = setInterval(paintSpeakerClock, 1000);
    paintSpeaker();
  }
  function paintSpeakerClock() {
    if (!speakerWin || speakerWin.closed) { clearInterval(speakerT); return; }
    const s = Math.floor((performance.now() - startedAt) / 1000);
    speakerWin.document.getElementById('t').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function paintSpeaker() {
    if (!speakerWin || speakerWin.closed || !deck) return;
    const d = speakerWin.document, s = slides[want], nx = slides[want + 1], { notes, ask } = noteOf(s);
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    d.getElementById('n').textContent = `Slide ${want + 1} of ${slides.length}${asking(s, wantRev) ? ' · quiz question showing' : ''}`;
    d.getElementById('c').innerHTML = `<div class="k">${esc(s.kicker)}</div><h1>${esc(s.title)}</h1><p>${esc(notes || 'No notes for this slide.')}</p>${ask ? `<div class="ask"><b>Question for the audience</b><p>${esc(ask[0])}</p><p class="a">Answer: ${esc(ask[1])}</p></div>` : ''}`;
    d.getElementById('nx').innerHTML = nx ? `<div class="k">Next</div><h2>${esc(nx.title)}</h2><p>${esc(nx.line || '')}</p>` : '<div class="k">Last slide</div>';
    paintSpeakerClock();
  }

  // ── Keys ──
  function onKey(e) {
    if (!deck || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
    let used = true;
    if (/^[0-9]$/.test(k)) { digits = (digits + k).slice(-3); clearTimeout(digitT); digitT = setTimeout(() => { digits = ''; }, 2500); toast(`Slide ${digits}: press Enter`); }
    else if (k === 'Enter' && digits) { const n = +digits; digits = ''; if (n >= 1) go(n - 1); }
    else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter' || k === 'ArrowDown') { if (!e.repeat) next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp' || k === 'Backspace') { if (!e.repeat) prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (lk === 'b' || k === '.' || lk === 'w') toggleBlack();
    else if (lk === 'f') fullscreen();
    else if (lk === 'n') toggleNotes();
    else if (lk === 's') speaker();
    else if (lk === 'q') toggleQuiz();
    else if (lk === 'l') toggleLaser();
    else if (k === 'F5') { /* a clicker's "start show": never reload the page */ }
    else if (k === 'Escape') { if (black) toggleBlack(false); else if (notesOpen) toggleNotes(false); else stop(); }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  addEventListener('keydown', onKey, true);

  // ── Start and stop ──
  function build() {
    const ladder = bigLadder(), tiles = bigTiles();
    const text = h('section', { class: 'pz-text stage-blocker', 'aria-live': 'polite' });
    const dhT = h('span', {}, 'Pressure, portal vein to heart'), dhL = h('span', { class: 'pz-lg' }, h('i', { class: 'now' }), 'This patient', h('i', { class: 'base' }), 'Healthy');
    const data = h('section', { class: 'pz-data stage-blocker pz-hide', 'data-safe': 'right', hidden: true, 'aria-label': 'The numbers' },
      h('div', { class: 'pz-dh' }, dhT, dhL), ladder.el, tiles.el);
    const veil = h('div', { class: 'pz-veil' }), panel = h('section', { class: 'pz-panel stage-blocker', hidden: true, 'aria-live': 'polite' });
    const count = h('div', { class: 'pz-count stage-blocker', 'aria-hidden': 'true' }), prog = h('div', { class: 'pz-prog', 'aria-hidden': 'true' }, h('i'));
    const bar = h('div', { class: 'pz-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    bar.addEventListener('focusin', wake);
    const notes = h('aside', { class: 'pz-notes stage-blocker', 'aria-label': 'Speaker notes', hidden: true });
    const blackEl = h('div', { class: 'pz-black', 'aria-hidden': 'true', onclick: () => toggleBlack(false) });
    // The shade sits under the corner credit (both at figure level, the credit later), the slide over both.
    const shade = h('div', { class: 'pz-shade' });
    // What the figure frames itself clear of: the words and most of the shade's fade.
    const safe = h('div', { class: 'pz-safe', 'aria-hidden': 'true', hidden: true });
    const load = h('div', { class: 'pz-load', 'aria-hidden': 'true' }, h('i'));
    const root = h('div', { class: 'pz' }, safe, veil, load, text, data, panel, count, prog, notes, bar, blackEl);
    wrap.insertBefore(shade, wrap.querySelector('.stage-credit'));
    wrap.append(root);
    return { root, shade, safe, load, text, data, dhT, dhL, ladder, tiles, veil, panel, count, prog, bar, notes, black: blackEl };
  }
  // Everything the audience's slides will change, kept so Esc, ✕ or Finish puts the app back as it was.
  async function capture() {
    const st = store.get(), { snap } = await host.request('snapshot');
    return { snap, params: structuredClone(st.params), presetId: st.presetId, view: st.view, lobule: st.lobule, sinusoid: st.sinusoid, mode: st.mode,
      selection: st.selection, details: st.details, compareSnap: st.compareSnap, compareView: st.compareView, colorMode: st.colorMode,
      running: st.running, speed: st.speed, lapse: st.lapse, clock: st.clock, hvpgMeasured: st.hvpgMeasured, lastHVPG: st.lastHVPG,
      labelK: stage.labelScale(), cam: stage.cameraState(), home: homeTab?.() ?? null };
  }
  async function start(id, at = 0) {
    const want0 = Math.max(0, (parseInt(at, 10) || 0));
    const d = typeof id === 'object' ? id : all().find((x) => x.id === (ALIAS[id] || id));
    if (!d?.slides?.length) { toast('That presentation could not be found.'); return; }
    // Starting another deck while one runs keeps the state from before the first.
    const before = deck ? saved : await capture();
    if (deck) stop(false);
    saved = before;
    deck = d; slides = d.slides; shown = null; shownState = -1; quiz = false; notesOpen = false; black = false;
    closeHome?.();
    const st0 = store.get();
    store.set({ presenting: true, selection: null, details: null, compareSnap: null, colorMode: 'pressure', presentLabels: [], focus: null, ...(st0.mode !== 'explore' ? { mode: 'explore' } : {}) });
    if (st0.view !== 'anatomic' && !st0.lobule) store.set({ view: 'anatomic' });
    projectorOn();
    app.classList.add('presenting');
    ui = build();
    if (base) ui.ladder.setBase(base);
    setLabels();
    startedAt = performance.now();
    prepare();
    addEventListener('resize', onResize);
    go(Math.min(want0, slides.length - 1));
    wake();
  }
  function stop(restore = true) {
    if (!deck) return;
    deck = null; shown = null; want = 0;
    stopLapse(); cathStop();
    for (const w of waiters) w.res(null);
    waiters = [];
    removeEventListener('resize', onResize);
    store.set({ presenting: false, presentLabels: null, focus: null });
    clearTimeout(idleT);
    ui?.root.remove(); ui?.shade.remove(); ui = null;
    view.classList.remove('pz-out');
    for (const k of ['--pz-l', '--pz-r', '--pz-t', '--pz-b']) app.style.removeProperty(k);
    stage.setProjection(false);
    document.documentElement.style.setProperty('--label-k', String(saved?.labelK ?? stage.labelScale()));
    dispatchEvent(new Event('pps:labelscale'));
    if (laser) toggleLaser();
    if (speakerWin && !speakerWin.closed) speakerWin.close();
    speakerWin = null; clearInterval(speakerT);
    if (document.fullscreenElement) document.exitFullscreen?.();
    app.classList.remove('presenting');
    projectorOff();
    dispatchEvent(new Event('pps:occ'));
    if (restore && saved) putBack(saved);
    if (restore) saved = null;
  }
  // Back to the app as it was before the presentation: the patient and every setting, the view and its camera, the cards and
  // sheets that were open, the sim running or paused (and a time-lapse), each easing in rather than jumping.
  async function putBack(b) {
    const before = store.get(), ms = reduce.matches ? 0 : 380;
    // The patient changes behind a soft dim of the figure, as between slides, so nothing pops.
    if (ms) { view.style.transition = `opacity ${ms}ms var(--ease)`; view.style.opacity = '.22'; await wait(ms); }
    host.send({ type: 'restore', snap: b.snap });
    replaceParams(structuredClone(b.params));
    host.send({ type: 'run', running: b.running, clock: b.lapse ? 'disease' : 'hemo', speed: b.lapse || b.speed });
    store.set({ presetId: b.presetId, presetLoading: false, mode: b.mode, colorMode: b.colorMode, lapse: b.lapse, speed: b.speed, hvpgMeasured: b.hvpgMeasured, lastHVPG: b.lastHVPG,
      compareSnap: b.compareSnap, compareView: b.compareView, historyTick: (before.historyTick || 0) + 1 });
    if (before.view !== b.view) { store.set({ view: b.view }); await wait(reduce.matches ? 0 : 700); }
    if (!b.lobule) stage.setCamera(b.cam, reduce.matches ? 0 : 900);
    if (before.lobule !== b.lobule) store.set({ lobule: b.lobule, sinusoid: b.sinusoid });
    else if (before.sinusoid !== b.sinusoid) store.set({ sinusoid: b.sinusoid });
    store.set({ selection: b.selection, details: b.details });
    if (b.home) reopenHome?.(b.home);
    if (ms) { await wait(260); view.style.opacity = ''; await wait(ms + 60); view.style.transition = ''; }
  }

  // ── Library (Home › Present) ──
  function captureStep() {
    const st = store.get();
    return { title: st.presetList?.find((p) => p.id === st.presetId)?.label || 'Step', preset: st.presetId, params: structuredClone(st.params), view: st.view, notes: '' };
  }
  function newScript() {
    const title = prompt('Name the new script', 'My script');
    if (!title) return;
    const list = readMine();
    list.push({ id: 'my-' + Date.now().toString(36), title, summary: 'Built from the live model.', steps: [captureStep()] });
    writeMine(list); rerenderHome?.();
    toast('Script created with the current model as its first slide. Change the model and use “Add current state” to add more.');
  }
  function addStep(id) {
    const list = readMine(), s = list.find((x) => x.id === id);
    if (!s) return;
    const step = captureStep();
    step.title = prompt('Title for this slide', step.title) || step.title;
    step.notes = prompt('Speaker notes (optional)', '') || '';
    s.steps.push(step); writeMine(list); rerenderHome?.();
  }
  function remove(id) { if (!confirm('Delete this script?')) return; writeMine(readMine().filter((x) => x.id !== id)); rerenderHome?.(); }
  function exportScript(s) { download(`${s.title.replace(/[^\w-]+/g, '-').toLowerCase()}.pps-script.json`, JSON.stringify(s, null, 2), 'application/json'); }
  const copy = (url, msg) => navigator.clipboard?.writeText(url).then(() => toast(msg), () => prompt('Copy this link', url)) ?? prompt('Copy this link', url);
  const shareScript = (s) => copy(`${location.origin}${location.pathname}#script=${enc(s)}`, 'Link copied: opening it adds the script to the recipient’s library.');
  const shareDeck = (d) => copy(`${location.origin}${location.pathname}?script=${d.id}`, 'Link copied: it opens this presentation at its first slide.');
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', async () => {
      try { addToLibrary(JSON.parse(await inp.files[0].text())); } catch { toast('That file is not a presenter script.'); }
    });
    inp.click();
  }
  function addToLibrary(s) {
    if (!s?.title || !Array.isArray(s.steps)) throw new Error('bad script');
    const list = readMine();
    list.push({ ...s, id: 'my-' + Date.now().toString(36), builtin: undefined });
    writeMine(list); rerenderHome?.();
    toast(`Added “${s.title}” to your scripts.`);
  }
  /** A shared link (#script=…) adds its script to this device's library. */
  function readLink() {
    const m = location.hash.match(/#script=([\w-]+)/);
    if (!m) return false;
    try { addToLibrary(dec(m[1])); } catch { toast('The shared script could not be read.'); }
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  function home() {
    const mine = readMine();
    const deckCard = (d) => h('article', { class: 'pz-deck', 'data-level': d.level },
      h('div', { class: 'pzd-top' }, h('span', { class: 'pzd-lvl' }, LEVELS[d.level] || ''), h('span', { class: 'pzd-meta' }, `${d.slides.length} slides · about ${d.minutes} min`)),
      h('h3', {}, d.title), h('p', { class: 'pzd-sum' }, d.summary),
      h('ol', { class: 'pzd-list' }, d.slides.map((s, i) => h('li', {}, h('button', { type: 'button', title: `Start at slide ${i + 1}`, onclick: () => start(d.id, i) }, s.title)))),
      h('div', { class: 'script-acts' },
        h('button', { class: 'btn primary', onclick: () => start(d.id) }, svgIcon('projector', 'mi-ic'), 'Present'),
        h('button', { class: 'btn ghost sm', onclick: () => shareDeck(d) }, 'Copy link')));
    const scriptCard = (s) => h('div', { class: 'home-item script' },
      h('span', { class: 'meta' }, `${s.steps.length} slides · Yours`), h('span', { class: 't' }, s.title), h('span', { class: 'd' }, s.summary || ''),
      h('span', { class: 'script-acts' },
        h('button', { class: 'btn sm primary', onclick: () => start(s.id) }, svgIcon('projector', 'mi-ic'), 'Present'),
        h('button', { class: 'btn sm', onclick: () => addStep(s.id) }, 'Add current state'),
        h('button', { class: 'btn sm ghost', onclick: () => shareScript(s) }, 'Share link'),
        h('button', { class: 'btn sm ghost', onclick: () => exportScript(s) }, 'Export'),
        h('button', { class: 'btn sm ghost', onclick: () => remove(s.id) }, 'Delete')));
    return h('div', { class: 'pz-lib' },
      h('p', { class: 'ctl-sub lib-note' }, 'Slide presentations that run on the live model, with speaker notes and a question for the audience on each slide.'),
      h('div', { class: 'pz-decks' }, DECKS.map(deckCard)),
      h('h3', { class: 'home-sub' }, 'Your scripts'),
      mine.length ? h('div', { class: 'home-grid' }, mine.map(scriptCard)) : h('p', { class: 'ctl-sub' }, 'A script is a series of model states you capture yourself. It plays like the presentations above.'),
      h('div', { class: 'btn-row', style: { marginTop: '12px' } },
        h('button', { class: 'btn', onclick: newScript }, 'New script from the current model'),
        h('button', { class: 'btn', onclick: importFile }, 'Import a script')),
      h('p', { class: 'ctl-sub' }, 'While presenting: → or Page Down next, ← back, a number then Enter jumps, B black screen, F full screen, N notes, S a speaker window for a second screen, Q quiz, L laser, Esc stops. Clickers work.'));
  }

  // Present a case: any case full screen for a class. Projector-size labels on the figure; the slim bar reminds the presenter to take a show of hands before committing.
  let classBar = null;
  function presentCase(id) {
    closeHome?.();
    startCase(id);
    stage.setProjection(innerWidth >= 768);   // projector-size labels; the case panel stays open
    app.classList.add('class-case');
    classBar?.remove();
    classBar = h('div', { class: 'class-bar stage-blocker', role: 'status' },
      h('span', { class: 'cb-k' }, 'Presenting'),
      h('span', {}, 'Read each choice aloud, take a show of hands, then commit for the room.'),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting the case', title: 'Stop (Esc)', onclick: endCase }, icon('close')));
    view.append(classBar);
  }
  function endCase() {
    if (!classBar) return;
    classBar.remove(); classBar = null;
    app.classList.remove('class-case');
    stage.setProjection(false);
  }
  addEventListener('keydown', (e) => { if (classBar && e.key === 'Escape' && !deck) endCase(); });

  return { start, stop, home, readLink, presentCase, active: () => !!deck };
}
