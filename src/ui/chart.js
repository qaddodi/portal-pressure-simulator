// The patient chart: one panel, no tabs, read top to bottom like a bedside chart.
//
//   Patient · scenario
//   [step card of a lesson or case]      (rendered by learn.js / cases.js above this)
//   [Compared with A]                    (when a moment is pinned)
//   Vitals & hemodynamics                key values; abnormal ones join; sparkline; Why?
//   Treat                                drugs · fluids & blood · procedures (on the anatomy)
//   Story                                what has happened, in plain language, with ✕ to undo
//   Advanced                             physiology knobs (instructor / researcher)

import { store, updateParams } from './store.js?v=4bf5a96a9d';
import { h, fmt, icon, svgIcon, toast } from './util.js?v=d483888526';
import { DRUGS } from '../engine/scenario.js?v=8fc90f782f';
import { TILES, VITALS, PRIMARY } from './dock.js?v=fa01c43d90';
import { activeInterventions } from './inspector.js?v=718cafd0b0';
import { verbEnabled, DRUG_NOTE } from './actions.js?v=3aaea708e3';
import { fmtClock } from './timeline.js?v=2c81ae8bfc';

// Where each readout is measured, so a click can show it on the figure.
const WHERE = { hvpg: ['RHV_IVC', 'SIN_RR'], pv: ['PV_TRUNK'], ppg: ['PV_TRUNK', 'IVCS_RA'], pvflow: ['PV_TRUNK'], varix: ['C1a', 'C1b'], ascites: [], liver: ['SIN_RR', 'SIN_LL'], shunt: ['C1b', 'C3', 'C5', 'C6', 'TIPS'] };
const SPARK_N = 90;

export function createChart({ onWhy, flash, onScenarios, action, startShunt, select, timeline, pinned }) {
  let controls = () => [];
  let storyPaint = null;
  const hist = Object.fromEntries(TILES.map((t) => [t.id, []]));
  let lastSample = 0, showAll = false;
  const open = new Set(JSON.parse(safeGet('pps.chartOpen') || '["vitals","story"]'));
  let live = [];

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function remember() { try { localStorage.setItem('pps.chartOpen', JSON.stringify([...open])); } catch { /* storage unavailable */ } }

  function section(id, title, ic, badge, ...kids) {
    const d = h('details', { class: 'section chart-sec', 'data-id': id },
      h('summary', {}, ic ? svgIcon(ic, 'sec-ic') : null, title, badge ? h('span', { class: 'count' }, badge) : null, svgIcon('chev-down', 'chev')),
      h('div', { class: 'section-body' }, ...kids));
    if (open.has(id)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) open.add(id); else open.delete(id); remember(); });
    return d;
  }

  // ── Vitals & hemodynamics ─────────────────────────
  function vitals() {
    const rows = h('div', { class: 'vt-rows', role: 'list' });
    const els = TILES.map((t) => {
      const val = h('b', { class: 'vt-v' }), st = h('span', { class: 'vt-s' }), cv = h('canvas', { class: 'vt-spark', width: 64, height: 20, 'aria-hidden': 'true' });
      const cmp = h('span', { class: 'vt-cmp' });
      const row = h('button', { class: 'vt-row', role: 'listitem', title: `${t.title || t.k} · click for why, and where it is measured` },
        h('span', { class: 'vt-k' }, t.k), h('span', { class: 'vt-val' }, val, h('span', { class: 'unit' }, t.u)), cv, h('span', { class: 'vt-status' }, st, cmp));
      row.addEventListener('click', () => { onWhy(t.why, row); flash(WHERE[t.id] || []); });
      return { t, row, val, st, cv, cmp };
    });
    rows.append(...els.map((e) => e.row));
    const sys = h('div', { class: 'vt-sys' });
    const sysEls = VITALS.map((v) => { const b = h('b'); const el = h(v.why ? 'button' : 'div', { class: 'vt-vital', title: v.k }, h('span', {}, v.k), b, h('i', {}, v.u)); if (v.why) el.addEventListener('click', () => onWhy(v.why, el)); sys.append(el); return { v, el, b }; });
    const more = h('button', { class: 'link vt-more' });
    more.addEventListener('click', () => { showAll = !showAll; paint(); });
    const paint = () => {
      const f = store.get().frame;
      if (!f) return;
      const m = f.metrics, hidden = store.get().hiddenReadouts, A = store.get().compareSnap?.metrics;
      let hiddenN = 0;
      for (const x of els) {
        const t = x.t;
        let sev, v = null;
        if (hidden?.has(t.hideKey)) {
          const meas = t.id === 'hvpg' ? t.measured?.() : null;
          x.val.textContent = meas ? fmt(meas.hvpg, 1) : '?';
          x.st.textContent = meas ? 'Measured' : t.id === 'hvpg' ? 'Use the catheter' : 'Not measured';
          sev = meas ? t.st(meas.hvpg, m) : 'none';
        } else {
          v = t.v(m);
          const txt = fmt(v, t.d);
          if (x.val.textContent !== txt) x.val.textContent = txt;
          const s = t.s(v, m);
          if (x.st.textContent !== s) x.st.textContent = s;
          sev = t.st(v, m);
        }
        x.row.dataset.sev = sev;
        if (A && v != null) { const d = v - t.v(A); x.cmp.textContent = Math.abs(d) < Math.pow(10, -t.d) * 0.5 ? 'same as A' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs A`; x.cmp.className = 'vt-cmp ' + (d > 0 ? 'up' : 'down'); }
        else x.cmp.textContent = '';
        const show = showAll || PRIMARY.has(t.id) || sev !== 'ok' || !!A;
        x.row.hidden = !show;
        if (!show) hiddenN++;
        spark(x.cv, hidden?.has(t.hideKey) ? [] : hist[t.id], sev);
      }
      for (const x of sysEls) { const txt = hidden?.has(x.v.hideKey) ? '?' : x.v.v(m); if (x.b.textContent !== txt) x.b.textContent = txt; x.el.classList.toggle('bad', !hidden?.has(x.v.hideKey) && x.v.bad(m)); }
      sys.hidden = !showAll;
      more.textContent = showAll ? 'Show fewer' : `Show all (${TILES.length + VITALS.length})`;
    };
    live.push(paint);
    return section('vitals', 'Vitals & hemodynamics', 'gauge', null, rows, sys, more);
  }
  // A sparkline changes only when its history is sampled (every 0.7 s) or its severity color
  // changes; redrawing it every frame, and reading its color with getComputedStyle (a forced
  // style pass right after the frame's DOM writes), was a large share of the page's work.
  const darkQ = matchMedia('(prefers-color-scheme: dark)');
  function spark(cv, data, sev) {
    const key = `${lastSample}|${sev}|${data.length}`;
    if (cv._k === key) return;
    const ck = sev + (document.documentElement.getAttribute('data-theme') || '') + darkQ.matches;
    if (cv._ck !== ck || !cv._color) { cv._ck = ck; cv._color = getComputedStyle(cv).color; cv._k = ''; }
    cv._k = key;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (data.length < 2) return;
    let mn = Infinity, mx = -Infinity;
    for (const v of data) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const pad = Math.max(1e-3, (mx - mn) * 0.15);
    mn -= pad; mx += pad;
    ctx.strokeStyle = cv._color;
    ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    const n = Math.max(12, data.length) - 1;
    const x0 = W - ((data.length - 1) / n) * (W - 4) - 2;
    data.forEach((v, i) => { const x = x0 + (i / n) * (W - 4), y = 2 + (H - 4) * (1 - (v - mn) / (mx - mn)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    const lx = W - 2, ly = 2 + (H - 4) * (1 - (data[data.length - 1] - mn) / (mx - mn));
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(lx, ly, 2, 0, 7); ctx.fill();
  }

  // ── Treat ─────────────────────────────────────────
  function treat() {
    const p0 = store.get().params;
    const drugChip = (k, label, note, get, set) => {
      const b = h('button', { class: 'order-chip', 'aria-pressed': String(!!get(p0)), title: note }, h('span', { class: 'oc-dot' }, icon('check')), h('span', { class: 'oc-t' }, label));
      const enabled = verbEnabled('drug:' + k, 'drug:' + k) || verbEnabled('drugs', 'drugs');
      if (!enabled) b.disabled = true;
      b.addEventListener('click', () => updateParams((pp) => { set(pp, !get(pp)); return pp; }, { label }));
      live.push(() => b.setAttribute('aria-pressed', String(!!get(store.get().params))));
      return b;
    };
    const drugs = h('div', { class: 'order-chips' },
      Object.keys(DRUGS).map((k) => drugChip(k, DRUGS[k].label, `${DRUG_NOTE[k] || ''}. ${DRUGS[k].info || ''}`, (p) => p.drugs[k], (p, v) => { p.drugs[k] = v; })),
      drugChip('anticoag', 'Anticoagulation', 'Thrombi slowly recanalize on the disease clock.', (p) => p.anticoag, (p, v) => { p.anticoag = v; }),
      drugChip('diuretics', 'Diuretics', 'Spironolactone + furosemide: renal sodium and water loss mobilizes ascites.', (p) => p.diuretics, (p, v) => { p.diuretics = v; }));
    const btn = (ic, label, run, sub) => { const b = h('button', { class: 'order-btn' }, ic ? svgIcon(ic, 'ac-ic') : null, h('span', { class: 'ob-t' }, label, sub ? h('small', {}, sub) : null)); b.addEventListener('click', run); return b; };
    const fluids = h('div', { class: 'order-grid' },
      btn('drop', '1 L crystalloid', () => action({ kind: 'infuse', fluid: 'crystalloid' }), '≈ 25 % stays in the vessels'),
      btn('drop', '1 unit PRBC', () => action({ kind: 'infuse', fluid: 'prbc' }), 'packed red cells'),
      btn('drop', 'Albumin', () => action({ kind: 'infuse', fluid: 'albumin' }), 'raises oncotic pressure'));
    const lock = (id) => !verbEnabled(id);
    const proc = (ic, label, sub, id, run) => { const b = btn(ic, label, run, sub); if (lock(id)) b.disabled = true; return b; };
    const procs = h('div', { class: 'order-grid' },
      proc('band', 'Band ligation', 'on the esophageal varices', 'band', () => { select({ type: 'organ', id: 'varices' }); action({ kind: 'band' }); toast('Band placed. The varices card is open on the figure.'); }),
      proc('balloon', 'Balloon tamponade', 'esophageal or gastric', 'balloon', () => { select({ type: 'organ', id: 'varices' }); toast('Switch the balloon on in the varices card.'); }),
      proc('stent', 'TIPS', 'choose the hepatic vein', 'shunt', () => { select(null); if (startShunt('PVH_R', { only: 'tips' })) toast('Click the hepatic vein where the stent should end.'); }),
      proc('stent', 'Surgical shunt', 'portocaval, Warren, mesocaval', 'shunt', () => { select(null); if (startShunt('PV_TRUNK')) toast('Click the systemic vein to connect the portal vein to.'); }),
      proc('occlude', 'BRTO', 'occlude the gastrorenal shunt', 'occlude', () => { select({ type: 'organ', id: 'gastric' }); if (!store.get().params.spontaneous.C5) toast('This patient has no gastrorenal shunt (see Advanced › anatomical variants).'); }),
      proc('needle', 'Paracentesis', 'drain ascites', 'paracentesis', () => select({ type: 'organ', id: 'abdomen' })));
    const n = activeInterventions(p0).filter((a) => a.key.startsWith('drug:') || ['anticoag', 'diuretics', 'tips', 'balloonEso', 'balloonGas', 'portocaval', 'dsrs', 'mesocaval', 'occ:C5'].includes(a.key)).length;
    return section('treat', 'Treat', 'pill', n || null,
      h('div', { class: 'subhead' }, 'Drugs'), drugs,
      h('div', { class: 'subhead' }, 'Fluids & blood'), fluids,
      h('div', { class: 'subhead' }, 'Procedures'), procs);
  }

  // ── Story ─────────────────────────────────────────
  function story() {
    const list = h('ol', { class: 'story' });
    const copy = h('button', { class: 'btn sm ghost', title: 'Copy the story as text' }, 'Copy');
    const print = h('button', { class: 'btn sm ghost', title: 'Print the story' }, 'Print');
    const paint = () => {
      const es = timeline.entries();
      const active = new Map(activeInterventions(store.get().params).map((a) => [a.key, a]));
      const cur = timeline.cursor();
      const items = es.map((e, i) => {
        if (e.kind === 'event' && e.sev === 'info' && es.length > 24) return null;
        const when = h('span', { class: 'st-when' }, e.kind === 'start' ? 'Start' : fmtClock(e.t, e.day));
        const dot = (t) => (/[.!?]$/.test(t) ? t : t + '.');
        const text = e.kind === 'start' ? `Patient: ${e.label}.` : e.kind === 'jump' ? `${e.label[0].toUpperCase()}${e.label.slice(1)} passed.` : e.kind === 'event' ? dot(`${e.label}${e.detail ? `: ${e.detail}` : ''}`) : dot(e.label);
        const undoKeys = (e.keys || []).filter((k) => active.has(k));
        const x = e.kind === 'change' && undoKeys.length && store.get().mode !== 'cases'
          ? h('button', { class: 'st-x', 'aria-label': `Undo: ${e.label}`, title: 'Remove this change' }, icon('close')) : null;
        x?.addEventListener('click', () => updateParams((q) => { for (const k of undoKeys) active.get(k)?.remove(q); return q; }, { label: `Removed ${e.label}` }));
        return h('li', { class: `st-${e.kind}${cur >= 0 && i > cur ? ' future' : ''}` }, when, h('span', { class: 'st-t' }, text), x);
      }).filter(Boolean);
      list.replaceChildren(...(items.length ? items : [h('li', { class: 'st-empty' }, 'Nothing has happened yet. Click the anatomy to change something, or jump ahead in time.')]));
    };
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(storyText()); toast('Story copied.'); } catch { toast('Copy is not available here.'); } });
    print.addEventListener('click', () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<title>Story</title><pre style="font:14px/1.6 system-ui;white-space:pre-wrap;padding:24px">${storyText().replace(/</g, '&lt;')}</pre>`); w.document.close(); w.print(); });
    storyPaint = () => { if (list.isConnected) paint(); };
    live.push(() => { if (list.isConnected && list._n !== timeline.entries().length) { list._n = timeline.entries().length; paint(); } });
    paint();
    return section('story', 'Story', 'book', null, list, h('div', { class: 'btn-row st-actions' }, copy, print));
  }
  function storyText() {
    return timeline.entries().map((e) => `${e.kind === 'start' ? 'Start' : fmtClock(e.t, e.day)}  ${e.kind === 'start' ? 'Patient: ' : ''}${e.label}${e.detail ? ': ' + e.detail : ''}`).join('\n');
  }

  // ── Advanced ──────────────────────────────────────
  function advanced() {
    const role = store.get().role || 'student';
    if (role === 'student') return null;
    const acts = h('div', { class: 'order-grid' },
      h('button', { class: 'order-btn', onclick: () => action({ kind: 'valsalva' }) }, h('span', { class: 'ob-t' }, 'Valsalva', h('small', {}, '10 s strain'))),
      h('button', { class: 'order-btn', onclick: () => action({ kind: 'rupture', site: 'VAR', tear: 0.6 }) }, h('span', { class: 'ob-t' }, 'Rupture a varix', h('small', {}, 'start a bleed'))),
      h('button', { class: 'order-btn', onclick: () => action({ kind: 'hemorrhage', mL: 500 }) }, h('span', { class: 'ob-t' }, '− 500 mL', h('small', {}, 'hemorrhage'))));
    if (role === 'researcher') open.add('advanced');
    return section('advanced', 'Advanced physiology', 'sliders', null,
      h('div', { class: 'subhead' }, 'Inflow & vascular tone'), controls(['splanchnicTone', 'systemicTone']),
      h('div', { class: 'subhead' }, 'Hepatic circulation'), controls(['habr', 'apShunt']),
      h('div', { class: 'subhead' }, 'Anatomical variants'), controls(['grShunt', 'geComm', 'srShunt']),
      h('div', { class: 'subhead' }, 'Simulation'), controls(['pulsatile', 'respiration', 'respDepth', 'detRupture']), acts);
  }

  function render(ctl) {
    if (ctl) controls = ctl;
    live = [];
    const st = store.get();
    const pr = st.presetList?.find((p) => p.id === st.presetId);
    const scen = h('button', { class: 'chart-scen', title: 'Choose a patient scenario', onclick: (e) => onScenarios(e.currentTarget) }, h('span', {}, pr?.label || 'Custom'), svgIcon('chev-down', 'chev'));
    const head = h('div', { class: 'p-head chart-head' }, h('div', { class: 'p-title' }, h('span', { class: 'kicker' }, 'Patient'), scen), pr?.summary ? h('p', { class: 'chart-sum' }, pr.summary) : null);
    const inCase = st.mode === 'cases';
    const kids = [head, pinned(), h('div', { class: 'p-body chart-body' }, vitals(), inCase ? null : treat(), story(), advanced())];
    update(store.get().frame, true);
    return kids;
  }

  function update(f, force) {
    if (!f) return;
    const now = performance.now();
    if (now - lastSample > 700 || force) {
      lastSample = now;
      for (const t of TILES) { const a = hist[t.id]; a.push(t.v(f.metrics)); if (a.length > SPARK_N) a.shift(); }
    }
    for (const fn of live) fn();
  }
  timeline.onChange(() => { const es = timeline.entries(); if (es.length === 1) for (const k of Object.keys(hist)) hist[k].length = 0; storyPaint?.(); });
  return { render, update };
}
