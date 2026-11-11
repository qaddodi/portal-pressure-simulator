// The Readouts tab of the Tests card: every readout the old bottom bar showed (pressure, flow, consequences,
// systemic), live, each with its scale bar. A tap on a readout says what drives it, as it did in the bar.
// The tile markup, classes and status logic follow the bar's tiles in dock.js; the data comes from there
// (TILES, GROUPS, VITALS, readoutValue), passed in so this file does not import the dock.

import { store, hiddenNow } from './store.js';
import { hvBlocked } from '../engine/pressure-cuts.js';
import { h, fmt, clamp, shownOf, countTo, swapText, fadeIn, putText } from './util.js';
import { vitalReading, bpText } from './vital-read.js';
import { SCALE, RATE } from './table-marks.js';
import { shownState, shownOr, FILL_SMALL, fillQ } from './shown.js';

// A number that changes rewrites its text node in place (setting textContent replaces the node).

// A trend arrow marks a sustained change (over TREND_S seconds, larger than TREND_FRAC of the scale).
const TREND_S = 5, TREND_FRAC = 0.03;
const RANKS = { none: -1, ok: 0, caution: 1, danger: 2, critical: 3 };
// The data card tile's rating class as this pane's severity: green, amber, red; a reading its tile only informs of (a slow heart rate, a high
// output) stays the neutral gray.
const SEV = { ok: 'ok', mid: 'caution', hi: 'danger' };

// [id, full name, short name for a narrow card]
const SYSTEMIC = [
  ['map', 'Blood pressure', 'BP'], ['hr', 'Heart rate', 'Heart rate'], ['co', 'Cardiac output', 'Cardiac output'], ['ra', 'Right atrial pressure', 'RA pressure'], ['hb', 'Hemoglobin', 'Hb'],
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
      h('span', { class: 'k' }, t.k), h('span', { class: 'v' }, val, h('span', { class: t.u === '%' ? 'unit pct' : 'unit' }, t.u, t.ux ? h('span', { class: 'u-x' }, t.ux) : null), tr), bar, h('span', { class: 's' }, st, cmp));
    el.title = `${t.title || t.k}${t.pane ? '\nClick to open the Ascites view.' : t.why ? '\nClick for what is driving it.' : ''}`;
    if (t.pane) el.addEventListener('click', () => show(t.pane, { reveal: true }));
    else if (t.why) el.addEventListener('click', () => (t.id === 'hvpg' && readoutValue(t, {}, hiddenNow()) == null ? show('hvpg', { reveal: true }) : onWhy(t.why, el)));
    els[t.id] = { el, t, val, tr, st, cmp, fill, hist: [], sev: null, trend: '', ariaTxt: '' };
    return el;
  }

  // A systemic value has its data card tile's bar: the tile's own scale, cut-offs, word and colour (table-marks SCALE and RATE), so the two
  // never disagree about what is normal (Mohammad, 22 Oct: any tile should have its normals).
  function vital(v, name, short) {
    const S = SCALE[v.id];
    const val = h('span', { class: 'val' }, '—'), st = h('span', { class: 'status' }), fill = h('i', { class: 'rb-fill' });
    // (The blood pressure: systolic/diastolic before the mean and the bracket after it, 120/80 (93).)
    const pre = v.s ? h('span', { class: 'val v-bp' }, '') : null, post = v.s ? h('span', { class: 'val v-bp' }, '') : null;
    const bar = h('span', { class: 'rb', 'aria-hidden': 'true' }, fill, S[2].map((c) => h('i', { class: 'rb-tick', style: { left: clamp((c - S[0]) / (S[1] - S[0]), 0, 1) * 100 + '%' } })));
    const el = h('button', { type: 'button', class: 'metric rp-vital', 'data-id': v.id },
      h('span', { class: 'k' }, h('span', { class: 'k-l' }, name), h('span', { class: 'k-s' }, short)), h('span', { class: 'v' }, pre, val, post, h('span', { class: 'unit' }, v.u)), bar, h('span', { class: 's' }, st));
    el.title = `${v.title}${v.why ? '\nClick for what is driving it.' : ''}`;
    if (v.why) el.addEventListener('click', () => onWhy(v.why, el));
    else el.style.cursor = 'default';
    vitEls.push({ v, S, el, val, pre, post, preT: null, st, fill, sev: null, ariaTxt: '' });
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

  // As the bar's tiles (dock.js updateStrip and paintStrip): a model frame sets each reading's target on the page's one shown state
  // (shown.js, premium-feel R4), and every display frame while one is on its way paints from what is shown (follow), so the numbers,
  // bars and words glide with the figure rather than step ten times a second. A step the running mean does not ease is taken at once.
  // (small: one step of the last digit printed. A number prints only whole steps of its last digit, so a move of one step or less shows
    // the same whether it glides or lands at once, and a running model's wobble, which is about that size, costs no display frames.)
    const followOpts = (d, snap) => ({ snap, small: Math.pow(10, -d), eps: 0.05 * Math.pow(10, -d) });
  // (A bar's length glides on the same filter, across a jump too, as dock.js fillTo; shown again after "Not measured", from its origin.)
  const fillTo = (key, lo, hi, v, seen) => {
    const r = Math.abs(hi - lo), o = { small: FILL_SMALL * r, eps: 0.0005 * r, across: true };
    if (v != null && Number.isFinite(v) && !seen && shownState.get(key) === undefined) shownState.set(key, clamp(0, Math.min(lo, hi), Math.max(lo, hi)), o);
    return shownState.set(key, v, o);
  };
  // (Followed only while the pane is being drawn: the dock draws it from each model frame only while it is open and on screen.)
  let lastF = null, lastAt = 0;
  shownState.on(() => { if (lastF && el.isConnected && performance.now() - lastAt < 400) update(lastF, true); });
  function update(f, follow = false) {
    if (!follow) { lastF = f; lastAt = performance.now(); }
    const m = f.metrics, st0 = store.get(), hidden = hiddenNow(st0), A = st0.compareSnap?.metrics || null, now = performance.now();
    for (const x of Object.values(els)) {
      const { el: tileEl, t } = x;
      if (!follow) {
        const raw = readoutValue(t, m, hidden);
        // A running mean (about a second) keeps the number steady through the beat; a real step or a paused model shows at once.
        let v = raw, eased = false;
        if (raw != null && x.sm != null && st0.running && Math.abs(raw - x.sm) < 0.1 * Math.abs(t.scale[1] - t.scale[0])) { v = x.sm + (raw - x.sm) * Math.min(1, (now - x.smT) / 1200); eased = true; }
        x.sm = v; x.smT = now;
        x.eased = eased; x.target = v;
        x.shown = v == null ? null : shownState.set('rp:' + t.id, v, followOpts(t.d, !eased));
        fillTo('rpfill:' + t.id, t.scale[0], t.scale[1], v, x.fillSeen); x.fillSeen = v != null;
      } else if (x.target != null) x.shown = shownState.or('rp:' + t.id, x.target);
      let v = x.shown ?? null;
      const eased = follow || x.eased;
      // HVPG and PPG read as the bar beside them prints them: the difference of their two readings as shown (dock.js paintStrip, shown.js),
      // so this tab never says 11.7 where the bar says 11.6. A measured HVPG, or a number far from the bar's (a step still gliding), keeps its own.
      if (v != null && (t.id === 'hvpg' || t.id === 'ppg') && !hidden?.has(t.hideKey)) { const g = shownOr(t.id, v); if (Math.abs(g - v) < 0.25) v = g; }
      // (A display frame between model frames repaints only the tiles whose shown number or bar moved since they were last painted.)
      if (follow) { const fk = `${v}|${shownState.or('rpfill:' + t.id, '')}`; if (fk === x.followKey) continue; x.followKey = fk; } else x.followKey = null;
      const measured = v != null && hidden?.has(t.hideKey);
      let sev, s;
      if (v == null) { if (!follow) countTo(x.val, null); s = t.id === 'hvpg' && hvBlocked(store.get().params) ? 'Not measurable' : 'Not measured'; sev = 'none'; x.hist.length = 0; }
      else {
        countTo(x.val, v, t.d, { eased });   // (a paused edit or a treatment rolls to the new number: P17)
        const vs = shownOf(v, t.d);   // (the word judges the number shown)
        s = measured ? 'Measured' : t.s(vs, m);
        sev = t.st(vs, m);
        const w = pos(t, shownState.or('rpfill:' + t.id, v)), o = pos(t, clamp(0, t.scale[0], t.scale[1]));
        const fl = fillQ(Math.min(w, o) / 100), fw = fillQ(Math.abs(w - o) / 100);
        if (x.fillL !== fl || x.fillW !== fw) { x.fillL = fl; x.fillW = fw; x.fill.style.setProperty('--fl', fl); x.fill.style.setProperty('--fw', fw); }
      }
      tileEl.classList.toggle('hidden-val', v == null);
      const trend = v == null || measured ? '' : trendOf(x, v, now);
      if (trend !== x.trend) { x.trend = trend; swapText(x.tr, trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''); }
      // Compare: each tile reports its change from the pinned moment in place of the status word.
      if (A && v != null && !measured) {
        const d = v - t.v(A);
        const same = Math.abs(d) < Math.pow(10, -t.d) * 0.5;
        // (Written only when they change: each model frame rewrote every tile's.)
        const ct = same ? 'same as then' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs then`, cc = 'cmp ' + (same ? 'same' : d > 0 ? 'up' : 'down');
        if (x.cmp.textContent !== ct) x.cmp.textContent = ct;
        if (x.cmp.className !== cc) x.cmp.className = cc;
        if (!x.st.hidden) { x.st.hidden = true; fadeIn(x.cmp); }
      } else if (x.cmp.textContent) { x.cmp.textContent = ''; x.st.hidden = false; fadeIn(x.st); }
      // A new band must hold for a moment before the tile takes it, so a value on a cut-off does not flicker (paused: at once).
      if (sev !== x.sev) {
        if (x.sevNext !== sev) { x.sevNext = sev; x.sevSince = now; }
        if (!x.sev || sev === 'none' || !st0.running || now - x.sevSince > 1500) {
          if (x.sev && RANKS[sev] > RANKS[x.sev]) { tileEl.classList.remove('flash'); void tileEl.offsetWidth; tileEl.classList.add('flash'); }
          tileEl.dataset.sev = sev; x.sev = sev;
        }
      } else x.sevNext = null;
      if (sev === x.sev) { const un = v == null; swapText(x.st, s, () => x.st.classList.toggle('unmeas', un)); }
      const aria = `${t.title || t.k}: ${v == null ? s.toLowerCase() : `${fmt(v, t.d)} ${t.u}${t.ux || ''}, ${s}`}${x.trend ? `, ${x.trend === 'up' ? 'rising' : 'falling'}` : ''}`;
      if (aria !== x.ariaTxt) { x.ariaTxt = aria; tileEl.setAttribute('aria-label', aria); }
    }
    for (const x of vitEls) {
      const hid = hidden?.has(x.v.hideKey);
      if (!follow) {
        x.r = vitalReading(x, m, st0.running, now); x.shown = shownState.set('rp:' + x.v.id, x.r.v, followOpts(x.v.d, !st0.running));
        const fv = hid || !Number.isFinite(x.r.v) ? null : x.r.v;
        fillTo('rpfill:' + x.v.id, x.S[0], x.S[1], fv, x.fillSeen); x.fillSeen = fv != null;
      }
      else x.shown = shownState.or('rp:' + x.v.id, x.shown);
      const r = { v: x.shown, bad: x.r?.bad };
      if (follow) { const fk = `${x.shown}|${hid}|${shownState.or('rpfill:' + x.v.id, '')}`; if (fk === x.followKey) continue; x.followKey = fk; } else x.followKey = null;
      countTo(x.val, hid ? null : r.v, x.v.d, { eased: st0.running });
      if (x.pre) {
        const t = hid || !Number.isFinite(r.v) || !Number.isFinite(x.r?.s) || !Number.isFinite(x.r?.d) ? '' : `${Math.round(x.r.s)}/${Math.round(x.r.d)} (`;
        if (t !== x.preT) { x.preT = t; putText(x.pre, t); putText(x.post, t ? ')' : ''); }
      }
      // (Its tile's word and colour, judging the number as shown; the tile's colour holds a moment before it changes, as the others do.)
      const none = hid || !Number.isFinite(r.v), [cls, word] = none ? [null, 'Not measured'] : RATE[x.v.id](shownOf(r.v, x.v.d), x.v.s ? { sbp: x.r?.s } : {}), sev = SEV[cls] ?? 'none';
      const w = none ? 0 : fillQ(clamp((shownState.or('rpfill:' + x.v.id, r.v) - x.S[0]) / (x.S[1] - x.S[0]), 0, 1));
      if (x.fillW !== w) { x.fillW = w; x.fill.style.setProperty('--fl', 0); x.fill.style.setProperty('--fw', w); }
      if (sev !== x.sev) {
        if (x.sevNext !== sev) { x.sevNext = sev; x.sevSince = now; }
        if (!x.sev || sev === 'none' || !st0.running || now - x.sevSince > 1500) {
          if (x.sev && RANKS[sev] > RANKS[x.sev]) { x.el.classList.remove('flash'); void x.el.offsetWidth; x.el.classList.add('flash'); }
          x.el.dataset.sev = sev; x.sev = sev;
        }
      } else x.sevNext = null;
      if (sev === x.sev) swapText(x.st, word, () => x.st.classList.toggle('unmeas', none));
      const aria = `${x.v.title}: ${none ? 'not measured' : `${x.v.s ? bpText(x.r?.s, x.r?.d, r.v) : fmt(r.v, x.v.d)} ${x.v.u}, ${word}`}`;
      if (aria !== x.ariaTxt) { x.ariaTxt = aria; x.el.setAttribute('aria-label', aria); }
    }
  }

  // The tab's own reading: how many readouts are past a cut-off right now (abnormal).
  function summary(f) {
    const m = f.metrics, hidden = hiddenNow();
    let n = 0;
    for (const t of tiles) { const v = readoutValue(t, m, hidden); if (v != null && !hidden?.has(t.hideKey) && t.st(shownOf(v, t.d), m) !== 'ok') n++; }
    return n ? `${n} abnormal` : 'All normal';
  }

  return { id: 'readouts', label: 'Readouts', el, update, summary };
}
