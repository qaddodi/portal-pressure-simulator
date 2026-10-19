// The Treat card's orders (drugs · fluids & blood · procedures, treatBody) and its Changes list, the
// advanced physiology knobs (opened from Settings) and the side panel's pinned comparison.
//
//   [Compared with A]                    side panel, when a moment is pinned
//   Changes                              Treat card, closed until opened: what has been set, with values
//   Advanced physiology                  side panel, from Settings

import { store, updateParams } from './store.js?v=31ee79b6ab';
import { h, icon, svgIcon, toast, reconcile } from './util.js?v=8813192ea2';
import { DRUGS } from '../engine/scenario.js?v=1ee7733788';
import { activeInterventions } from './inspector.js?v=46bf36da72';
import { DRUG_NOTE } from './actions.js?v=109ccff154';
import { factTarget } from './fact-target.js?v=b7631940ce';


export function createChart({ onWhy, flash, onScenarios, action, startShunt, select, reveal = select, timeline, pinned }) {
  let controls = () => [];
  // Changes starts closed in the Treat card so the card does not grow with every order.
  // A damaged saved value (not JSON, or not a list) starts closed rather than stopping the app.
  const open = new Set((() => { try { const v = JSON.parse(safeGet('pps.chartOpen3') || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } })());
  let live = [];

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function remember() { try { localStorage.setItem('pps.chartOpen3', JSON.stringify([...open])); } catch { /* storage unavailable */ } }

  function section(id, title, ic, badge, ...kids) {
    const d = h('details', { class: 'section chart-sec', 'data-id': id },
      h('summary', {}, ic ? svgIcon(ic, 'sec-ic') : null, title, badge ? h('span', { class: 'count' }, badge) : null, svgIcon('chev-down', 'chev')),
      h('div', { class: 'section-body' }, ...kids));
    // The Advanced physiology sections start open; for them the saved set holds the ones closed.
    const shut = id.startsWith('adv-');
    if (open.has(id) !== shut) d.open = true;
    d.addEventListener('toggle', () => { if (d.open !== shut) open.add(id); else open.delete(id); remember(); });
    return d;
  }

  // ── Changes ───────────────────────────────────────
  // Everything set away from a healthy adult (by a preset, a slider, a drug or a procedure), with
  // its value; one tap takes a change back.
  // The loaded patient's own settings, while the learner is still on that patient in Explore.
  function presetBase() {
    const st = store.get(), b = st.presetParams;
    return b && st.mode === 'explore' && b.id === st.presetId ? b.params : null;
  }
  function changes() {
    const list = h('div', { class: 'chg-list', role: 'list' });
    const empty = h('p', { class: 'fd-empty' }, 'Nothing changed yet. Move a slider or treat, and it shows here.');
    // Clear all takes back only the learner's own changes: the patient's own picture stays.
    const clear = h('button', { class: 'link chg-clear', onclick: () => updateParams((q) => { const base = presetBase(); if (base) return structuredClone(base); for (const a of activeInterventions(q)) a.remove(q); return q; }, { label: 'Clear all changes' }) }, 'Clear all');
    let key = null, count = null;
    const row = (a, undo) => {
      const m = /^(.*?)\s+([×\d].*)$/.exec(a.label);
      // A fact about the patient opens the vessel or organ where it is set (U14); the chevron sits where × would be.
      const go = !undo && factTarget(a.key);
      if (go) {
        return h('div', { class: 'chg about', role: 'listitem' },
          h('button', { class: 'chg-go', title: 'Show it on the figure', 'aria-label': `${a.label}: show it on the figure`, onclick: () => reveal(go) },
            h('span', { class: 'chg-n' }, m ? m[1] : a.label), m ? h('span', { class: 'chg-v' }, m[2]) : null, svgIcon('chev-right', 'chg-ch')));
      }
      return h('div', { class: 'chg' + (undo ? '' : ' about'), role: 'listitem' },
        h('span', { class: 'chg-n' }, m ? m[1] : a.label), m ? h('span', { class: 'chg-v' }, m[2]) : null,
        undo ? h('button', { class: 'ib chg-x', 'aria-label': `Undo ${a.label}`, title: 'Undo this change', onclick: () => updateParams((q) => { a.remove(q); return q; }, { label: `Remove ${a.label}` }) }, icon('close')) : null);
    };
    const paint = () => {
      const base = presetBase();
      const baseLabels = new Set(base ? activeInterventions(base).map((a) => a.label) : []);
      const active = activeInterventions(store.get().params), k = active.map((a) => a.label).join('|') + '#' + [...baseLabels].join('|');
      if (k === key) return;
      key = k;
      // What the patient came with is a fact about them, not a change to undo.
      const about = active.filter((a) => baseLabels.has(a.label)), mine = active.filter((a) => !baseLabels.has(a.label));
      // (Updated in place: a new change rises in, an undone one folds away, the rest stay put: P18.)
      const keyed = (el, k) => { el.dataset.row = k; return el; };
      reconcile(list, [
        ...(about.length ? [keyed(h('div', { class: 'chg-sub' }, 'About this patient'), 'sub:about'), ...about.map((a) => keyed(row(a, false), `about:${a.label}`)), keyed(h('div', { class: 'chg-sub' }, 'Your changes'), 'sub:mine')] : []),
        ...mine.map((a) => keyed(row(a, true), `mine:${a.label}`))]);
      empty.hidden = mine.length > 0; clear.hidden = !mine.length;
      if (count) { count.textContent = mine.length; count.hidden = !mine.length; }
    };
    live.push(paint);
    const sec = section('changes', 'Changes', null, '0', list, empty, clear);
    count = sec.querySelector('summary .count');
    count.classList.add('fd-count');
    return sec;
  }

  // ── Treat ─────────────────────────────────────────
  // The orders, for the Treat card. `sync` collects what must repaint when the parameters change.
  let treatTab = 'drugs';
  function treatBody(sync, onDone) {
    const live = sync;
    const p0 = store.get().params;
    const drugChip = (k, label, note, get, set) => {
      const b = h('button', { class: 'order-chip', 'aria-pressed': String(!!get(p0)), title: note }, h('span', { class: 'oc-t' }, label), h('span', { class: 'oc-dot' }, icon('check')));
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
    const proc = (ic, label, sub, run) => btn(ic, label, run, sub);
    // A procedure that continues on the figure (a card, a shunt to draw) puts the Treat card away.
    const procs = h('div', { class: 'order-grid' },
      proc('band', 'Band ligation', 'on the esophageal varices', () => { select({ type: 'organ', id: 'varices' }); action({ kind: 'band' }); }),
      proc('balloon', 'Balloon tamponade', 'esophageal or gastric', () => { select({ type: 'organ', id: 'varices' }); toast('Switch the balloon on in the varices card.'); }),
      // A TIPS is always right portal vein → right hepatic vein, so it is placed at once.
      proc('stent', 'TIPS', 'right portal vein → right hepatic vein', () => {
        const on = store.get().params.tips.on;
        if (!on) updateParams({ tips: { on: true, d: store.get().params.tips.d || 8 } }, { label: 'TIPS' });
        select({ type: 'edge', id: 'TIPS' });
        toast(on ? 'The TIPS is already in place.' : 'TIPS placed: right portal vein → right hepatic vein.');
      }),
      // A DIPS is always right portal vein → the intrahepatic IVC, so it is placed at once too.
      proc('stent', 'DIPS', 'right portal vein → intrahepatic IVC', () => {
        const on = store.get().params.dips.on;
        if (!on) updateParams({ dips: { on: true, d: store.get().params.dips.d || 8 } }, { label: 'DIPS' });
        select({ type: 'edge', id: 'DIPS' });
        toast(on ? 'The DIPS is already in place.' : 'DIPS placed: right portal vein → IVC, through the caudate lobe.');
      }),
      proc('stent', 'Surgical shunt', 'portocaval, Warren, mesocaval', () => { select(null); startShunt('PV_TRUNK'); }),
      proc('occlude', 'BRTO', 'occlude the gastrorenal shunt', () => { select({ type: 'organ', id: 'gastric' }); if (store.get().params.spontaneous.C5 === false) toast('This patient has no gastrorenal shunt (see Advanced › anatomical variants).'); }),
      // One button cycles the spleen: untreated → partial embolization → splenectomy → untreated.
      (() => {
        const NAME = ['Spleen', 'Embolization', 'Splenectomy'], SUB = ['embolization or splenectomy', 'partial splenic artery embolization', 'spleen removed'];
        const b = proc('occlude', 'Spleen', SUB[0], () => {
          const v = ((store.get().params.splenicRx | 0) + 1) % 3;
          updateParams((p) => { p.splenicRx = v; return p; }, { label: ['Spleen untreated', 'Partial splenic embolization', 'Splenectomy'][v] });
          select({ type: 'organ', id: 'spleen' });
        });
        const paint = () => { const v = store.get().params.splenicRx | 0; b.querySelector('.ob-t').textContent = NAME[v]; b.title = `${NAME[v]}: ${SUB[v]} (click to change)`; b.setAttribute('aria-pressed', String(v > 0)); };
        paint(); live.push(paint); return b;
      })(),
      proc('needle', 'Paracentesis', 'drain ascites', () => select({ type: 'organ', id: 'abdomen' })));
    for (const b of procs.querySelectorAll('button')) b.addEventListener('click', () => onDone?.());
    // Three tabs, styled as the Tests card's, so the cards read as one set; the last tab is kept.
    const panes = [['drugs', 'Drugs', drugs], ['fluids', 'Fluids', fluids], ['procs', 'Procedures', procs]];
    const tabs = h('div', { class: 'instr-tabs treat-tabs', role: 'tablist', 'aria-label': 'Treatments' });
    // All three panes share one grid cell, the others hidden but still laid out, so the card is as tall as the tallest
    // tab on every tab and never changes height when a tab is picked (review #20).
    const body = h('div', { class: 'treat-pane' }, panes.map((x) => x[2]));
    const show = (id) => {
      treatTab = id;
      for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === id));
      for (const [pid, , el] of panes) { const off = pid !== id; el.classList.toggle('tp-off', off); el.inert = off; el.setAttribute('aria-hidden', String(off)); }
      if (body.isConnected) spare();
    };
    // The spare room under a shorter tab goes to the card's foot, under Changes, rather than sitting as a band between
    // the orders and Changes (sweep, 16 Oct): the pane is as tall as the tab shown, and the card's body is padded by
    // what the tallest tab needs more, so the card's frame still holds still from tab to tab.
    const spare = () => {
      if (!body.isConnected) { ro?.disconnect(); return; }
      const on = panes.find((x) => x[0] === treatTab)?.[2];
      const tall = Math.max(...panes.map((x) => x[2].offsetHeight)), own = on?.offsetHeight ?? tall, cs = getComputedStyle(body);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      body.style.height = `${own + pad}px`;
      body.parentElement?.style.setProperty('--tp-spare', `${tall - own}px`);
    };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(spare) : null;
    for (const x of panes) ro?.observe(x[2]);
    // Words only: the three names always fit, so an icon beside each would only repeat it (design giveaway DG5, 17 Oct).
    for (const [id, label] of panes) tabs.append(h('button', { class: 'instr-tab', role: 'tab', 'data-tab': id, 'aria-selected': 'false', onclick: () => show(id) }, h('span', {}, label)));
    show(treatTab);
    return [tabs, body];
  }
  /** How many treatments are running now (drugs, shunts, balloons, BRTO). */
  function treatCount(p) {
    return activeInterventions(p).filter((a) => a.key.startsWith('drug:') || ['anticoag', 'diuretics', 'tips', 'dips', 'balloonEso', 'balloonGas', 'portocaval', 'dsrs', 'mesocaval', 'occ:C5', 'splenicRx'].includes(a.key)).length;
  }

  // ── Advanced ──────────────────────────────────────
  function advanced() {
    const acts = h('div', { class: 'order-grid' },
      h('button', { class: 'order-btn', onclick: () => action({ kind: 'valsalva' }) }, h('span', { class: 'ob-t' }, 'Valsalva', h('small', {}, '10 s strain'))),
      h('button', { class: 'order-btn', onclick: () => action({ kind: 'rupture', site: 'VAR', tear: 0.6 }) }, h('span', { class: 'ob-t' }, 'Rupture a varix', h('small', {}, 'start a bleed'))),
      h('button', { class: 'order-btn', onclick: () => action({ kind: 'hemorrhage', mL: 500 }) }, h('span', { class: 'ob-t' }, '− 500 mL', h('small', {}, 'hemorrhage'))));
    // Laid out as the Details panel's sections (heading, spaced rows, a hairline between groups), not bare subheads.
    return [
      section('adv-tone', 'Inflow & vascular tone', null, null, ...controls(['splanchnicTone', 'systemicTone'])),
      section('adv-hepatic', 'Hepatic circulation', null, null, ...controls(['habr', 'apShunt'])),
      section('adv-variants', 'Anatomical variants', null, null, ...controls(['grShunt', 'srShunt'])),
      section('adv-sim', 'Simulation', null, null, ...controls(['pulsatile', 'respiration', 'respDepth', 'bleeding', 'detRupture']), acts)];
  }

  // The side panel with nothing selected shows only a pinned comparison; the changes live in the Treat card
  // (treatChanges) and the physiology knobs open from Settings (renderAdvanced).
  function render(ctl) {
    if (ctl) controls = ctl;
    live = [];
    return [pinned()];
  }
  function renderAdvanced(ctl) {
    if (ctl) controls = ctl;
    live = [];
    return [h('div', { class: 'p-body chart-body adv-body' }, ...advanced())];
  }
  /** The changes list for the Treat card; `sync` collects its repaint. */
  function treatChanges(sync) {
    const saved = live, from = sync.length;
    live = sync;
    const sec = changes();
    live = saved;
    for (const fn of sync.slice(from)) fn();
    return sec;
  }

  function update(f) {
    if (!f) return;
    for (const fn of live) fn();
  }
  return { render, renderAdvanced, update, treatBody, treatCount, treatChanges };
}
