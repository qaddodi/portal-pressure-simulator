// The patient chart: one card, no tabs, read top to bottom like a bedside chart. The orders
// (drugs · fluids & blood · procedures) are in the Treat card, built here too (treatBody).
//
//   Scenario summary                     (the patient's name heads the panel)
//   [step card of a lesson or case]      (rendered by learn.js / cases.js above this)
//   [Compared with A]                    (when a moment is pinned)
//   Findings                             what is abnormal, in words, with its cut-off; Why?
//   (what has happened lives in the timeline's History, under the figure)
//   Advanced                             physiology knobs (instructor / researcher)

import { store, updateParams } from './store.js?v=9c069d2ebf';
import { h, fmt, icon, svgIcon, toast } from './util.js?v=d680016625';
import { DRUGS } from '../engine/scenario.js?v=304cd180db';
import { TILES, VITALS, readoutValue } from './dock.js?v=d39ec7d011';
import { activeInterventions } from './inspector.js?v=fe8a1a69f1';
import { verbEnabled, DRUG_NOTE } from './actions.js?v=447ea9cb02';

// Where each readout is measured, so a click can show it on the figure.
const WHERE = { hvpg: ['RHV_IVC', 'SIN_RR'], pv: ['PV_TRUNK'], ppg: ['PV_TRUNK', 'IVCS_RA'], pvflow: ['PV_TRUNK'], varix: ['C1a', 'C1b'], ascites: [], liver: ['SIN_RR', 'SIN_LL'], shunt: ['C1b', 'C3', 'C5', 'C6', 'TIPS'], spleen: ['V_SPL', 'SV_CONF'], ra: ['IVCS_RA'] };
const ALL = [...TILES, ...VITALS];
const RANK = { critical: 3, danger: 2, caution: 1, ok: 0 };
const n1 = (v) => fmt(v, 1), n0 = (v) => fmt(v, 0);
// One finding per abnormal readout: [what it is, the numbers and the cut-off it crossed].
const FIND = {
  hvpg: (v, m, sev) => sev === 'caution'
    ? ['Portal hypertension, subclinical', `HVPG ${n1(v)} mmHg: above normal (< 5), below the clinically significant threshold (10).`]
    : ['Clinically significant portal hypertension', `HVPG ${n1(v)} mmHg (≥ 10). At this level varices, ascites and other complications can develop.`],
  ppg: (v, m) => ['Portosystemic gradient raised', m.hvpg < 5
    ? `PPG ${n1(v)} mmHg (normal < 6) while HVPG is normal: the block sits before the sinusoids, where the wedged catheter cannot see it.`
    : `PPG ${n1(v)} mmHg (normal < 6), measured directly from the portal vein to the vena cava.`],
  pv: (v, m, sev) => [sev === 'danger' ? 'Portal pressure high' : 'Portal pressure raised', `Portal vein ${n1(v)} mmHg (normal ≤ 10).`],
  pvflow: (v, m, sev) => sev === 'critical'
    ? ['Portal flow reversed (hepatofugal)', `${fmt(Math.abs(v), 1)} L/min flows away from the liver, out through collaterals.`]
    : sev === 'danger'
      ? ['Portal flow near stasis', `${n0(Math.abs(m.pvVelMean ?? m.pvVel))} cm/s (normal ≥ 12). Slow flow favors portal vein thrombosis.`]
      : ['Portal flow reduced', `${fmt(v, 1)} L/min at ${n0(Math.abs(m.pvVelMean ?? m.pvVel))} cm/s (normal ≥ 0.9 L/min, ≥ 12 cm/s).`],
  liver: (v, m) => ['Liver perfusion reduced', `${n0(v)} % of normal. The hepatic artery has risen ×${fmt(m.habr, 1)} to buffer the loss of portal flow.`],
  shunt: (v, m) => ['Portosystemic shunting', `${n0(v)} % of gut blood bypasses the liver. Encephalopathy risk ${m.heRisk.label.toLowerCase()}.`],
  varix: (v, m, sev) => [m.varix.d < 2.5 ? 'Varix wall under strain' : sev === 'critical' ? 'Varices close to rupture' : `Esophageal varices, ${m.varix.grade.label.toLowerCase()}`,
    `${n1(m.varix.d)} mm across; wall tension ${n0(v)} % of the rupture point${m.varix.redWale ? ', with red wale signs' : ''}.`],
  ascites: (v, m) => [`Ascites, grade ${m.ascites.grade}`, `${fmt(v, 1)} L of free fluid in the abdomen.`],
  spleen: (v) => ['Splenomegaly', `Spleen ${n1(v)} cm (normal ≤ 13). An enlarged spleen traps platelets.`],
  map: (v) => ['Hypotension', `Mean arterial pressure ${n0(v)} mmHg (< 65).`],
  hr: (v) => ['Tachycardia', `Heart rate ${n0(v)} /min (> 110).`],
  co: (v) => ['Hyperdynamic circulation', `Cardiac output ${n1(v)} L/min (> 6.5), from splanchnic and systemic vasodilation.`],
  ra: (v) => ['Right atrial pressure raised', `RA ${n1(v)} mmHg (> 10). Back-pressure reaches the liver from the heart.`],
  hb: (v) => ['Severe anemia', `Hemoglobin ${n1(v)} g/dL (< 7).`],
};

/** Every abnormal readout as a finding, most severe first: [{ id, sev, txt: [title, detail] }]. */
export function computeFindings(m, hidden) {
  const found = [];
  for (const t of TILES) {
    const v = readoutValue(t, m, hidden);
    if (v == null) continue;
    const sev = t.st(v, m);
    if (sev === 'ok') continue;
    const txt = FIND[t.id]?.(v, m, sev);
    if (txt) found.push({ id: t.id, sev, txt });
  }
  for (const x of VITALS) {
    if (hidden?.has(x.hideKey) || !x.bad(m)) continue;
    found.push({ id: x.id, sev: 'danger', txt: FIND[x.id](x.v(m), m) });
  }
  return found.sort((a, b) => RANK[b.sev] - RANK[a.sev]);
}

export function createChart({ onWhy, flash, onScenarios, action, startShunt, select, timeline, pinned }) {
  let controls = () => [];
  const open = new Set(JSON.parse(safeGet('pps.chartOpen2') || '["findings","treat","story"]'));
  let live = [];

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function remember() { try { localStorage.setItem('pps.chartOpen2', JSON.stringify([...open])); } catch { /* storage unavailable */ } }

  function section(id, title, ic, badge, ...kids) {
    const d = h('details', { class: 'section chart-sec', 'data-id': id },
      h('summary', {}, ic ? svgIcon(ic, 'sec-ic') : null, title, badge ? h('span', { class: 'count' }, badge) : null, svgIcon('chev-down', 'chev')),
      h('div', { class: 'section-body' }, ...kids));
    if (open.has(id)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) open.add(id); else open.delete(id); remember(); });
    return d;
  }

  // ── Findings ──────────────────────────────────────
  // The strip under the figure carries the numbers; the chart says what they mean. Each abnormal
  // readout becomes one finding in plain language, most severe first, with its cut-off.
  function findings() {
    const list = h('div', { class: 'fd-list', role: 'list' });
    const empty = h('p', { class: 'fd-empty' }, 'Nothing abnormal. Pressures, flow and the circulation are all in their normal ranges.');
    const els = new Map();
    let count = null, order = '';
    const row = (key) => {
      const src = ALL.find((x) => x.id === key);
      const title = h('span', { class: 'fd-t' }), detail = h('span', { class: 'fd-d' });
      const el = h(src.why ? 'button' : 'div', { class: 'finding', role: 'listitem' }, h('span', { class: 'fd-dot', 'aria-hidden': 'true' }), h('span', { class: 'fd-body' }, title, detail));
      if (src.why) { el.title = 'What is driving this, and where it is measured'; el.addEventListener('click', () => { onWhy(src.why, el); flash(WHERE[key] || []); }); }
      return { el, title, detail };
    };
    const paint = () => {
      const f = store.get().frame;
      if (!f) return;
      const found = computeFindings(f.metrics, store.get().hiddenReadouts);
      for (const x of found) {
        let e = els.get(x.id);
        if (!e) { e = row(x.id); els.set(x.id, e); }
        if (e.el.dataset.sev !== x.sev) e.el.dataset.sev = x.sev;
        if (e.title.textContent !== x.txt[0]) e.title.textContent = x.txt[0];
        if (e.detail.textContent !== x.txt[1]) e.detail.textContent = x.txt[1];
      }
      const key = found.map((x) => x.id).join();
      if (key !== order) { order = key; list.replaceChildren(...found.map((x) => els.get(x.id).el)); empty.hidden = found.length > 0; }
      if (count && count.textContent !== String(found.length)) { count.textContent = found.length; count.hidden = !found.length; }
    };
    live.push(paint);
    const sec = section('findings', 'Findings', 'activity', '0', list, empty);
    count = sec.querySelector('summary .count');
    count.classList.add('fd-count');
    return sec;
  }

  // ── Treat ─────────────────────────────────────────
  // The orders, for the Treat card. `sync` collects what must repaint when the parameters change.
  function treatBody(sync, onDone) {
    const live = sync;
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
    // One line per order; what it does is in its tooltip, so the list stays short.
    const btn = (ic, label, run, sub) => { const b = h('button', { class: 'order-btn', title: sub ? `${label}: ${sub}` : label }, ic ? svgIcon(ic, 'ac-ic') : null, h('span', { class: 'ob-t' }, label)); b.addEventListener('click', run); return b; };
    const fluids = h('div', { class: 'order-grid three' },
      btn(null, '1 L crystalloid', () => action({ kind: 'infuse', fluid: 'crystalloid' }), 'about 25 % stays in the vessels'),
      btn(null, '1 unit PRBC', () => action({ kind: 'infuse', fluid: 'prbc' }), 'packed red cells'),
      btn(null, 'Albumin', () => action({ kind: 'infuse', fluid: 'albumin' }), 'raises oncotic pressure'));
    const lock = (id) => !verbEnabled(id);
    const proc = (ic, label, sub, id, run) => { const b = btn(ic, label, run, sub); if (lock(id)) b.disabled = true; return b; };
    // A procedure that continues on the figure (a card, a shunt to draw) puts the Treat card away.
    const procs = h('div', { class: 'order-grid' },
      proc('band', 'Band ligation', 'on the esophageal varices', 'band', () => { select({ type: 'organ', id: 'varices' }); action({ kind: 'band' }); toast('Band placed. The varices card is open on the figure.'); }),
      proc('balloon', 'Balloon tamponade', 'esophageal or gastric', 'balloon', () => { select({ type: 'organ', id: 'varices' }); toast('Switch the balloon on in the varices card.'); }),
      // A TIPS is always right portal vein → right hepatic vein, so it is placed at once.
      proc('stent', 'TIPS', 'right portal vein → right hepatic vein', 'shunt', () => {
        const on = store.get().params.tips.on;
        if (!on) updateParams({ tips: { on: true, d: store.get().params.tips.d || 10 } }, { label: 'TIPS' });
        select({ type: 'edge', id: 'TIPS' });
        toast(on ? 'The TIPS is already in place.' : 'TIPS placed: right portal vein → right hepatic vein.');
      }),
      proc('stent', 'Surgical shunt', 'portocaval, Warren, mesocaval', 'shunt', () => { select(null); if (startShunt('PV_TRUNK')) toast('Click the systemic vein to connect the portal vein to.'); }),
      proc('occlude', 'BRTO', 'occlude the gastrorenal shunt', 'occlude', () => { select({ type: 'organ', id: 'gastric' }); if (!store.get().params.spontaneous.C5) toast('This patient has no gastrorenal shunt (see Advanced › anatomical variants).'); }),
      proc('needle', 'Paracentesis', 'drain ascites', 'paracentesis', () => select({ type: 'organ', id: 'abdomen' })));
    for (const b of procs.querySelectorAll('button')) b.addEventListener('click', () => onDone?.());
    return [h('div', { class: 'subhead' }, 'Drugs'), drugs,
      h('div', { class: 'subhead' }, 'Fluids & blood'), fluids,
      h('div', { class: 'subhead' }, 'Procedures'), procs];
  }
  /** How many treatments are running now (drugs, shunts, balloons, BRTO). */
  function treatCount(p) {
    return activeInterventions(p).filter((a) => a.key.startsWith('drug:') || ['anticoag', 'diuretics', 'tips', 'balloonEso', 'balloonGas', 'portocaval', 'dsrs', 'mesocaval', 'occ:C5'].includes(a.key)).length;
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
      h('div', { class: 'subhead' }, 'Simulation'), controls(['pulsatile', 'respiration', 'respDepth', 'bleeding', 'detRupture']), acts);
  }

  function render(ctl) {
    if (ctl) controls = ctl;
    live = [];
    const st = store.get();
    const pr = st.presetList?.find((p) => p.id === st.presetId);
    // The patient's name heads the panel; the chart opens on what the patient has.
    const head = pr?.summary ? h('div', { class: 'p-head chart-head' }, h('p', { class: 'chart-sum' }, pr.summary)) : null;
    // Treat has a card of its own (the Treat button), so the chart keeps to what the patient has.
    const kids = [head, pinned(), h('div', { class: 'p-body chart-body' }, findings(), advanced())];
    update(store.get().frame, true);
    return kids;
  }

  function update(f) {
    if (!f) return;
    for (const fn of live) fn();
  }
  return { render, update, treatBody, treatCount };
}
