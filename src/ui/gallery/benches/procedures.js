// Procedures bench (card gallery, plan 2.8): every slide in the app's decks that plays a procedure or shows the HVPG catheter, grouped by kind (TIPS, BRTO, BATO,
// EUS, Meso-Rex, the HVPG catheter...). A button opens the deck on that slide (pps.presenter.start(deckId, index)); Back and Next stay at the top and move the
// open talk one slide (pps.presenter.go(position.at -/+ 1)), with a line naming where it is: "deck, slide n of m".
// The slide numbers are the presenter's own: the outline is slide 1 and the deck's first slide is 2 (decks.js withOverview), the same numbers ?script=<deck>&slide=<n> takes.
// Step Back / Step Next press the app's own arrow keys instead, which also play a procedure's steps (the catheter in, each step, the next slide), as a presenter does.
import { DECKS, withOverview } from '../../decks.js';
import { PROCEDURES } from '../../procedure-names.js';
import { benchRoot, h, statusLine, ppsOf } from './ui.js';

/** The kind id of the HVPG catheter group: a slide with `cath` or a tool { catheter: true }. */
export const CATHETER = 'hvpg-catheter';
// Kinds procedure-names.js has no name for, with the words the bench shows (anything else shows its raw kind).
export const EXTRA_LABELS = Object.freeze({ [CATHETER]: 'HVPG catheter', eus: 'EUS portal pressure', eusglue: 'EUS-guided glue', rex: 'Meso-Rex graft', tipsgrad: 'TIPS gradient', hvpgcath: 'HVPG catheter, played' });
// The order of the groups: the named procedures first, then the rest as they come, the catheter last.
const ORDER = ['tips', 'tipsgrad', 'dips', 'brto', 'bato', 'eus', 'eusglue', 'rex', 'hvpgcath', 'irivc', 'irpv', CATHETER];

/** The kind a slide's `procedure` names ('tips', or { kind: 'brto', target: 'C6' } gives 'brto'); null when it has none. */
export function kindOfProcedure(p) {
  const k = typeof p === 'string' ? p : p?.kind;
  return typeof k === 'string' && k ? k : null;
}
/** The words for a kind: procedure-names.js label when it has one, else the bench's own, else the raw kind. */
export const labelOf = (kind) => PROCEDURES[kind]?.label ?? EXTRA_LABELS[kind] ?? kind;
/** True when a slide shows the HVPG catheter (a `cath` slide, or a tool { catheter: true }). */
export const hasCatheter = (s) => !!(s?.cath || s?.tool?.catheter === true);

/** Every slide that plays a procedure or shows the catheter, grouped by kind: [{ kind, label, entries: [{ deckId, deckTitle, index, slideId, title, note }] }].
 *  index is 0-based in the presenter's slide list (the outline is 0), as pps.presenter.start and go take it; the slide number is index + 1. */
export function procedureSlides(decks = DECKS) {
  const groups = new Map();
  const add = (kind, e) => { if (!groups.has(kind)) groups.set(kind, { kind, label: labelOf(kind), entries: [] }); groups.get(kind).entries.push(e); };
  for (const d of decks || []) {
    if (!d?.slides?.length) continue;
    withOverview(d).slides.forEach((s, index) => {
      const e = (note) => ({ deckId: d.id, deckTitle: d.title || d.id, index, slideId: s.id || '', title: s.title || '', note });
      const kind = kindOfProcedure(s.procedure);
      if (kind) add(kind, e(typeof s.procedure === 'object' && s.procedure.target ? `target ${s.procedure.target}` : ''));
      if (hasCatheter(s)) add(CATHETER, e(s.cath ? `cath ${s.cath}` : 'catheter tracing'));
    });
  }
  const rank = (k) => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length - 1.5 : i; };   // (an unlisted kind sorts just before the catheter)
  return [...groups.values()].sort((a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind));
}

/** "deck title, slide n of m" for a presenter position ({ id, at }) and a slide count; 'No talk open' when there is none. Pure. */
export function whereText(pos, count, decks = DECKS) {
  if (!pos) return 'No talk open. Pick a slide below.';
  const d = decks.find((x) => x.id === pos.id);   // alloc-rare: once per tap or per finished move, never in a frame
  return `${d?.title || pos.id}, slide ${pos.at + 1}${count > 0 ? ` of ${count}` : ''}`;   // alloc-rare: once per tap or per finished move, never in a frame
}

export default {
  id: 'procedures',
  title: 'Procedures',
  mount(host, ctx) {
    const pps = ppsOf(ctx);
    benchRoot(host, 'Procedures', 'Every slide that plays a procedure or shows the HVPG catheter, by kind. Tap a slide number to open that deck there. Back and Next move the open talk one slide; Step Back and Step Next press the app\'s own arrow keys, which play a procedure\'s steps.');
    const say = statusLine(), where = h('div', { class: 'gb-status', role: 'status' });
    const groups = procedureSlides(DECKS);
    let gone = false, timer = 0, keyT = 0;
    const pr = () => pps?.presenter || null;

    const refresh = () => {
      const p = pr();
      let pos = null, n = 0;
      try { pos = p?.position?.() ?? null; n = p?.count?.() ?? 0; } catch { /* a presenter still loading */ }
      where.textContent = whereText(pos, n);
      back.disabled = next.disabled = stepBack.disabled = stepNext.disabled = !pos;
    };
    const poll = () => { timer = setTimeout(() => { if (gone) return; refresh(); poll(); }, 1000); };   // alloc-rare: once a second, a timer chain, not a frame callback
    const open = async (e) => {
      const p = pr();
      if (!p?.start) { say.set('The presenter is not available here (pps.presenter).', 'bad'); return; }
      say.set(`Opening ${e.deckTitle}, slide ${e.index + 1}…`);
      try { await p.start(e.deckId, e.index); say.set(`${e.deckTitle}, slide ${e.index + 1}: ${e.title || e.slideId}`, 'ok'); } catch (err) { say.set(`Would not open: ${err?.message || err}`, 'bad'); }
      refresh();
    };
    const move = (d) => {
      const p = pr(), pos = p?.position?.();
      if (!pos) { say.set('No talk is open.', 'warn'); return; }
      const n = p.count?.() ?? 0, to = pos.at + d;
      if (to < 0 || (n && to >= n)) { say.set(d < 0 ? 'Already on the first slide.' : 'Already on the last slide.', 'warn'); return; }
      p.go(to); refresh();
    };
    // (The app's own Next and Back are its arrow keys on the page: the slide's next procedure step, then the next slide.)
    const key = (k) => {
      if (!pr()?.position?.()) { say.set('No talk is open.', 'warn'); return; }
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      clearTimeout(keyT); keyT = setTimeout(() => { if (!gone) refresh(); }, 400);   // alloc-rare: one timeout after a tap
    };
    const back = h('button', { type: 'button', disabled: true, onclick: () => move(-1) }, 'Back');
    const next = h('button', { type: 'button', disabled: true, onclick: () => move(1) }, 'Next');
    const stepBack = h('button', { type: 'button', disabled: true, onclick: () => key('ArrowLeft') }, 'Step Back');
    const stepNext = h('button', { type: 'button', disabled: true, onclick: () => key('ArrowRight') }, 'Step Next');
    host.append(h('div', { class: 'gb-row' }, back, next, stepBack, stepNext, where), say);

    if (!groups.length) host.append(h('p', null, 'No slide in the decks plays a procedure.'));
    for (const g of groups) {
      const byDeck = new Map();
      for (const e of g.entries) { if (!byDeck.has(e.deckId)) byDeck.set(e.deckId, []); byDeck.get(e.deckId).push(e); }
      host.append(h('h3', { style: 'margin-top:14px' }, `${g.label} `, h('span', { class: 'gb-note' }, `${g.entries.length} slide${g.entries.length === 1 ? '' : 's'}`)));
      for (const es of byDeck.values()) {
        host.append(h('div', { class: 'gb-row' }, h('span', { class: 'gb-note', style: 'min-width:150px' }, es[0].deckTitle),
          es.map((e) => h('button', { type: 'button', title: `${e.title}${e.note ? ` (${e.note})` : ''}`, onclick: () => open(e) }, `${e.index + 1}`, e.note ? h('span', { class: 'gb-note' }, ` ${e.note}`) : null))));
      }
    }
    refresh(); poll();

    // (The talk this bench opened is left as it is: it is the owner's to close. The timers are the only thing started here.)
    return () => { gone = true; clearTimeout(timer); clearTimeout(keyT); };
  },
};
