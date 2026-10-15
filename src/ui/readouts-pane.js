// The Readouts tab of the Tests card: every readout the old bottom bar showed (pressure, flow, consequences,
// systemic), live, each with its scale bar. A tap on a readout says what drives it, as it did in the bar.
// The tile markup, classes and status logic follow the bar's tiles in dock.js; the data comes from there
// (TILES, GROUPS, VITALS, readoutValue), passed in so this file does not import the dock.

import { store, hiddenNow } from './store.js?v=3b659e1968';
import { h, fmt, clamp } from './util.js?v=7bea6ad65a';
import { vitalReading } from './vital-read.js?v=e902fb66cd';

// A number that changes rewrites its text node in place (setting textContent replaces the node).
const setText = (el, t) => { const n = el.firstChild; if (n && n.nodeType === 3 && !n.nextSibling) { if (n.data !== t) n.data = t; } else if (el.textContent !== t) el.textContent = t; };

// A trend arrow marks a sustained change (over TREND_S seconds, larger than TREND_FRAC of the scale).
const TREND_S = 5, TREND_FRAC = 0.03;
const RANKS = { none: -1, ok: 0, caution: 1, danger: 2, critical: 3 };

// [id, full name, short name for a narrow card]
const SYSTEMIC = [
  ['map', 'Mean arterial pressure', 'MAP'], ['hr', 'Heart rate', 'Heart rate'], ['co', 'Cardiac output', 'Output'], ['ra', 'Right atrial pressure', 'RA pressure'], ['hb', 'Hemoglobin', 'Hb'],
];

export function createReadoutsPane({ tiles, groups, vitals, readoutValue, onWhy, show }) {
  const pos = (t, v) => clamp((v - t.scale[0]) / (t.scale[1] - t.scale[0]), 0, 1) * 100;
  const els = {};
  const vitEls = [];

  function tile(t) {
    const val = h('span', { class: 'val' }, '—'), tr = h('span', { class: 'tr', 'aria-hidden': 'true' }), st = h('span', { class: 'status' }), cmp = h('span', { class: 'cmp' });
    const fill = h('i', { class: 'rb-fill' });
    const bar = h('span', { class: 'rb', 'aria-hidden': 'true' }, fill, t.ticks.map((x) => h('i', { class: 'rb-tick', style: { left: pos(t, x) + '%' } })));
    const el = h('button', { type: 'button', class: 'metric', 'data-id': t.id },
      h('span', { class: 'k' }, t.k), h('span', { class: 'v' }, val, h('span', { class: 'unit' }, t.u, t.ux ? h('span', { class: 'u-x' }, t.ux) : null), tr), bar, h('span', { class: 's' }, st, cmp));
    el.title = `${t.title || t.k}${t.pane ? '\nClick to open the Ascites view.' : t.why ? '\nClick for what is driving it.' : ''}`;
    if (t.pane) el.addEventListener('click', () => show(t.pane, { reveal: true }));
    else if (t.why) el.addEventListener('click', () => (t.id === 'hvpg' && readoutValue(t, {}, hiddenNow()) == null ? show('hvpg', { reveal: true }) : onWhy(t.why, el)));
    els[t.id] = { el, t, val, tr, st, cmp, fill, hist: [], sev: null, trend: '', ariaTxt: '' };
    return el;
  }

  function vital(v, name, short) {
    const val = h('span', { class: 'val' }, '—');
    const el = h('button', { type: 'button', class: 'metric rp-vital', 'data-id': v.id },
      h('span', { class: 'k' }, h('span', { class: 'k-l' }, name), h('span', { class: 'k-s' }, short)), h('span', { class: 'v' }, val, h('span', { class: 'unit' }, v.u)));
    el.title = `${v.title}${v.why ? '\nClick for what is driving it.' : ''}`;
    if (v.why) el.addEventListener('click', () => onWhy(v.why, el));
    else el.style.cursor = 'default';
    vitEls.push({ v, el, val });
    return el;
  }

  const section = (g, label, kids) => h('section', { class: 'rp-group', 'data-group': g, 'aria-label': label },
    h('h3', { class: 'rp-cap' }, label), h('div', { class: 'rp-tiles' }, kids));
  const byId = Object.fromEntries(vitals.map((v) => [v.id, v]));
  const el = h('div', { class: 'dock-pane', 'data-pane': 'readouts' },
    groups.map(([g, label]) => section(g, label, tiles.filter((t) => t.group === g).map(tile))),
    section('systemic', 'Systemic', SYSTEMIC.map(([id, name, short]) => vital(byId[id], name, short))));

  function trendOf(x, v, now) {
    const hs = x.hist;
    if (!hs.length || now - hs[hs.length - 1][0] > 500) { hs.push([now, v]); while (hs.length && now - hs[0][0] > TREND_S * 1000 + 600) hs.shift(); }
    if (now - hs[0][0] < TREND_S * 1000 * 0.8) return '';
    const d = v - hs[0][1], thr = TREND_FRAC * (x.t.scale[1] - x.t.scale[0]);
    return d > thr ? 'up' : d < -thr ? 'down' : '';
  }

  function update(f) {
    const m = f.metrics, st0 = store.get(), hidden = hiddenNow(st0), A = st0.compareSnap?.metrics || null, now = performance.now();
    for (const x of Object.values(els)) {
      const { el: tileEl, t } = x;
      const raw = readoutValue(t, m, hidden);
      // A running mean (about a second) keeps the number steady through the beat; a real step or a paused model shows at once.
      let v = raw;
      if (raw != null && x.sm != null && st0.running && Math.abs(raw - x.sm) < 0.1 * Math.abs(t.scale[1] - t.scale[0])) v = x.sm + (raw - x.sm) * Math.min(1, (now - x.smT) / 1200);
      x.sm = v; x.smT = now;
      const measured = v != null && hidden?.has(t.hideKey);
      let sev, s;
      if (v == null) { setText(x.val, '?'); s = 'Not measured'; sev = 'none'; x.hist.length = 0; }
      else {
        setText(x.val, fmt(v, t.d));
        s = measured ? 'Measured' : t.s(v, m);
        sev = t.st(v, m);
        const w = pos(t, v), o = pos(t, clamp(0, t.scale[0], t.scale[1]));
        const fl = Math.min(w, o) / 100, fw = Math.abs(w - o) / 100;
        if (x.fillL !== fl || x.fillW !== fw) { x.fillL = fl; x.fillW = fw; x.fill.style.setProperty('--fl', fl); x.fill.style.setProperty('--fw', fw); }
      }
      tileEl.classList.toggle('hidden-val', v == null);
      const trend = v == null || measured ? '' : trendOf(x, v, now);
      if (trend !== x.trend) { x.trend = trend; x.tr.textContent = trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''; }
      // Compare: each tile reports its change from the pinned moment in place of the status word.
      if (A && v != null && !measured) {
        const d = v - t.v(A);
        const same = Math.abs(d) < Math.pow(10, -t.d) * 0.5;
        x.cmp.textContent = same ? 'same as then' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs then`;
        x.cmp.className = 'cmp ' + (same ? 'same' : d > 0 ? 'up' : 'down');
        x.st.hidden = true;
      } else if (x.cmp.textContent) { x.cmp.textContent = ''; x.st.hidden = false; }
      // A new band must hold for a moment before the tile takes it, so a value on a cut-off does not flicker (paused: at once).
      if (sev !== x.sev) {
        if (x.sevNext !== sev) { x.sevNext = sev; x.sevSince = now; }
        if (!x.sev || sev === 'none' || !st0.running || now - x.sevSince > 1500) {
          if (x.sev && RANKS[sev] > RANKS[x.sev]) { tileEl.classList.remove('flash'); void tileEl.offsetWidth; tileEl.classList.add('flash'); }
          tileEl.dataset.sev = sev; x.sev = sev;
        }
      } else x.sevNext = null;
      if (sev === x.sev && x.st.textContent !== s) { x.st.textContent = s; x.st.classList.toggle('unmeas', v == null); }
      const aria = `${t.title || t.k}: ${v == null ? 'not measured' : `${fmt(v, t.d)} ${t.u}${t.ux || ''}, ${s}`}${x.trend ? `, ${x.trend === 'up' ? 'rising' : 'falling'}` : ''}`;
      if (aria !== x.ariaTxt) { x.ariaTxt = aria; tileEl.setAttribute('aria-label', aria); }
    }
    for (const x of vitEls) {
      const hid = hidden?.has(x.v.hideKey);
      const r = vitalReading(x, m, st0.running, now);
      setText(x.val, hid ? '?' : fmt(r.v, x.v.d));
      const sev = !hid && r.bad ? 'danger' : 'ok';
      if (x.el.dataset.sev !== sev) x.el.dataset.sev = sev;
    }
  }

  // The tab's own reading: how many readouts are past a cut-off right now (abnormal).
  function summary(f) {
    const m = f.metrics, hidden = hiddenNow();
    let n = 0;
    for (const t of tiles) { const v = readoutValue(t, m, hidden); if (v != null && !hidden?.has(t.hideKey) && t.st(v, m) !== 'ok') n++; }
    return n ? `${n} abnormal` : 'All normal';
  }

  return { id: 'readouts', label: 'Readouts', el, update, summary };
}
