// Opening a specimen that is not a teaching-card slide: a Tests pane, a structure card, a sheet (plan 1.2 to 1.5). Each opener uses the app's own
// controls (window.pps, the top-bar buttons, the keys), never a copy of the card. Every step happens on a tap of the gallery page; nothing here runs per frame.
//
//   pane   the patient, then the Tests card on that pane (pps.dock.show), and FibroScan's organ or the endoscope's wall where the entry names one
//   pick   the view, the patient, then the selection the card is made for (pps.store.set({ selection })); `details` taps the card's name, which slides to its Details
//   sheet  the top-bar button, the menu or the palette that opens it, as a person opens it

import { toast } from '../util.js';

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const press = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const click = (sel) => document.querySelector(sel)?.click();

/** Waits until nothing is arriving: the card has no running animation and the presenter and the camera are still (or `ms` pass). */
export async function settle(pps, ms = 6000) {
  const t0 = performance.now();
  await sleep(250);
  while (performance.now() - t0 < ms) {
    const card = pps?.card?.el;
    const moving = !!card?.getAnimations?.({ subtree: true }).some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime));
    if (!moving && !pps?.presenter?.busy?.() && !pps?.stage?.viewChanging?.()) { await sleep(200); return true; }
    await sleep(150);
  }
  return false;
}

/** Puts every surface this page opens away, so the next specimen starts from the bare figure. */
export async function clearAll(pps) {
  for (let i = 0; i < 3; i++) { press('Escape'); await sleep(80); }
  pps?.store?.set({ selection: null, details: null, compareSnap: null });
  pps?.dock?.close?.();
  await sleep(120);
}

async function loadPatient(pps, entry) {
  await pps.loadPreset(entry.preset);   // (always afresh: the last specimen may have changed the patient)
  if (entry.params) pps.updateParams(entry.params, { settle: true, history: false });   // (a patch, deep-merged by the store)
}

const viewButton = (view) => click(`#viewSeg button[data-view="${view}"]`);

export const OPENERS = {
  async pane(entry, pps) {
    await clearAll(pps);
    viewButton('anatomic');
    await loadPatient(pps, entry);
    pps.dock.show(entry.sub === 'wall' ? 'varixwall' : entry.pane);
    await settle(pps);
    if (entry.organ) { document.querySelector(`#dock .ps-btn[data-organ="${entry.organ}"]`)?.click(); await settle(pps); }
  },

  async pick(entry, pps) {
    await clearAll(pps);
    viewButton(entry.view || 'anatomic');
    await sleep(entry.view === 'lobule' ? 1500 : 300);
    await loadPatient(pps, entry);
    pps.store.set({ selection: entry.sel });
    await settle(pps);
    if (entry.details) { pps.card?.el?.querySelector('.ac-name')?.click(); await settle(pps); }
  },

  async sheet(entry, pps) {
    await clearAll(pps);
    viewButton('anatomic');
    await loadPatient(pps, entry);
    switch (entry.open) {
      case 'treat': click('#btnTreat'); break;
      case 'history': click('#btnHistory'); break;
      case 'tests': click('#tabInstruments'); break;
      case 'settings': click('#btnSettings'); break;
      case 'menu-patients': pps.menu?.open('patients'); break;
      case 'menu-present': pps.menu?.open('present'); break;
      case 'palette': pps.palette?.open(); break;
      case 'compare': {
        // (The state now is pinned as A, then the change is made: the banner and the card compare the two.)
        pps.timeline?.togglePin?.();
        await sleep(200);
        pps.updateParams(entry.params || {}, { settle: true, history: false });
        break;
      }
      case 'toast': toast('A short message.'); break;
      case 'toast-bad': toast('Something could not be done.', 'bad'); break;
      case 'toast-action': toast('A message with a button.', '', { actions: [['Undo', () => {}], ['Dismiss', () => {}]] }); break;
      default: toast(`No opener for the sheet "${entry.open}".`); return;
    }
    await settle(pps);
  },
};

/** Brings the app to the state a specimen describes. A kind with no opener says so in a toast instead of doing nothing. */
export async function openEntry(entry, pps) {
  const fn = OPENERS[entry.kind];
  if (!fn) { toast(`No opener yet for ${entry.kind} specimens.`); return; }
  try { await fn(entry, pps); } catch (err) { console.error('[gallery] open', entry.id, err); toast(`Could not open ${entry.title}.`, 'bad'); }   // alloc-rare: a tap that failed
}
