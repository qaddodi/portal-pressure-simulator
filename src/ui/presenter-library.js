// The library
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { caught } from './caught.js';
import { checkDeck, parseDeckSource } from './deck-source.js';
import { DECKS, LEVELS, TOPICS, slideCount } from './decks.js';
import { download } from './download.js';
import { openHandout } from './handout.js';
import { resumeFor } from './resume.js';
import { NO_ROOM, dec, enc, readMine, writeMine } from './script-library.js';
import { store } from './store.js';
import { askText, closeModal, confirmDialog, h, icon, openModal, toast } from './util.js';

export function createLibrary(st, live) {
  const { deckNumbers, fromScript, pview, rerenderHome, start, warm } = st;
  // ── Library (the menu's Present column) ──
  function captureStep() {
    const st = store.get();
    return { title: st.presetList?.find((p) => p.id === st.presetId)?.label || 'Step', preset: st.presetId, params: structuredClone(st.params), view: st.view, notes: '' };
  }
  async function newScript() {
    const title = await askText({ title: 'New script', label: 'Name', value: 'My script', yes: 'Create' });
    if (!title) return;
    const list = readMine();
    list.push({ id: 'my-' + Date.now().toString(36), title, summary: 'Built from the live model.', steps: [captureStep()] });
    if (!writeMine(list)) { toast(NO_ROOM, 'bad'); return; }
    rerenderHome?.();
    toast('Script created with the current model as its first slide. Change the model and use “Add current state” to add more.');
  }
  async function addStep(id) {
    if (!readMine().find((x) => x.id === id) || readMine().find((x) => x.id === id).deck) return;
    const step = captureStep();
    const named = await askText({ title: 'Add this state as a slide', label: 'Slide title', value: step.title, yes: 'Add slide' });
    if (!named) return;   // (Cancel, the × and Esc add nothing; the field never answers empty)
    step.title = named;
    const list = readMine(), s = list.find((x) => x.id === id);   // (read again: the dialog was open a while)
    if (!s || s.deck) return;
    s.steps.push(step);
    if (!writeMine(list)) { toast(NO_ROOM, 'bad'); return; }
    rerenderHome?.();
  }
  async function remove(id) {
    // alloc-rare: the saved-scripts list: runs on a user edit (the scan reaches it only through the name remove)
    const s = readMine().find((x) => x.id === id);
    // alloc-rare: the saved-scripts list: runs on a user edit (the scan reaches it only through the name remove)
    if (!await confirmDialog({ title: 'Delete this script?', body: s ? `“${s.title}” and its slides will be removed from this device. A link or an exported file you made of it still opens.` : 'It will be removed from this device.', yes: 'Delete', danger: true })) return;
    // alloc-rare: the saved-scripts list: runs on a user edit (the scan reaches it only through the name remove)
    if (!writeMine(readMine().filter((x) => x.id !== id))) { toast(NO_ROOM, 'bad'); return; }
    rerenderHome?.();
  }
  function exportScript(s) { download(`${s.title.replace(/[^\w-]+/g, '-').toLowerCase()}.pps-script.json`, JSON.stringify(s, null, 2), 'application/json'); }
  // (Where the clipboard is not allowed, the link is shown in the app's own dialog, selected, to copy by hand.)
  const showLink = (url) => {
    const f = h('input', { class: 'ask-field', type: 'text', readOnly: true, value: url, 'aria-label': 'Link' });
    f.addEventListener('focus', () => f.select());
    openModal('Copy this link', h('div', {}, h('p', {}, 'Your browser did not allow copying. Select the link and copy it.'), f,
      h('div', { class: 'btn-row end' }, h('button', { class: 'btn primary', onclick: () => closeModal() }, 'Done'))), { compact: true });
    f.focus({ preventScroll: true });
  };
  const copy = (url, msg) => navigator.clipboard?.writeText(url).then(() => toast(msg, '', { present: true }), () => showLink(url)) ?? showLink(url);
  const shareScript = (s) => copy(`${location.origin}${location.pathname}#script=${enc(s)}`, 'Link copied: opening it adds the script to the recipient’s library.');
  // Built-in decks share through their page (c/deck-<id>.html, scripts/share-pages.mjs) on the hosted site, so a link preview shows the deck title.
  const shareDeck = (d) => copy(location.hostname.endsWith('github.io') && /^[\w-]+$/.test(d.id) && !String(d.id).startsWith('my-') ? new URL(`c/deck-${d.id}.html`, location.href).href : `${location.origin}${location.pathname}?script=${d.id}`, 'Link copied: it opens this presentation at its first slide.');
  // Import: a deck .js file (the format of src/ui/decks), a deck or script as .json, or the same text pasted.
  function importFile() {
    const area = h('textarea', { class: 'imp-src', rows: 10, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Deck file contents',
      placeholder: "export const MY_DECK = {\n  title: 'My talk',\n  slides: [ { title: '…', line: '…' } ],\n};" });
    const err = h('p', { class: 'imp-err', role: 'alert', hidden: true });
    const add = (text) => {
      try { addText(text); closeModal(); } catch (e) { err.textContent = e.message || 'That is not a deck or a script.'; err.hidden = false; }
    };
    const inp = h('input', { type: 'file', accept: '.js,.mjs,.json,text/javascript,application/javascript,application/json', hidden: true });
    inp.addEventListener('change', async () => { const f = inp.files[0]; if (f) add(await f.text()); inp.value = ''; });
    openModal('Import a presentation', h('div', { class: 'imp' },
      h('p', {}, 'Choose a deck file (.js, written like the built-in decks) or a script (.json), or paste its contents. The file is read as data and never run.'),
      inp,
      h('button', { class: 'btn', onclick: () => inp.click() }, icon('download'), 'Choose a file…'),
      area, err,
      h('div', { class: 'btn-row end' },
        h('button', { class: 'btn', onclick: () => closeModal() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => add(area.value) }, 'Add to your scripts'))), { sub: null });
  }
  // A script (title, steps) as JSON is kept as before; anything else must be a deck.
  function addText(text) {
    let o = null;
    try { o = JSON.parse(text); } catch (e) { caught('presenter:5877', e); /* not JSON */ }
    if (o?.title && Array.isArray(o.steps)) return addToLibrary(o);
    if (o?.deck) return addToLibrary(o);
    return addToLibrary({ deck: parseDeckSource(text) });
  }
  function addToLibrary(s) {
    if (s?.deck) {
      const d = checkDeck(s.deck);
      s = { title: d.title, summary: d.summary || '', deck: d };
    } else if (!s?.title || !Array.isArray(s.steps) || !s.steps.every((st) => st && typeof st === 'object')) throw new Error('That is not a deck or a script.');
    const list = readMine();
    const id = 'my-' + Date.now().toString(36);
    list.push({ ...s, id, builtin: undefined });
    if (!writeMine(list)) throw new Error(NO_ROOM);
    rerenderHome?.();
    toast(`Added “${s.title}” to your scripts.`);
    return id;
  }
  /** A shared link (#script=…) adds its script to this device's library; returns its id (true if it could not be read). */
  function readLink() {
    const m = location.hash.match(/#script=([\w-]+)/);
    if (!m) return false;
    let id = true;
    try { id = addToLibrary(dec(m[1])); } catch (e) { toast(e?.message === NO_ROOM ? NO_ROOM : 'The shared script could not be read.', 'bad'); }
    history.replaceState(null, '', location.pathname + location.search);
    return id;
  }
  // What the unified menu (menu.js) lists and does: the presentations, this device's scripts and their actions.
  const library = () => ({ decks: DECKS, topics: TOPICS, levels: LEVELS, mine: readMine(), testing: live.TESTING, start, warm, shareDeck, notes: (d) => openHandout(d, deckNumbers(d)),
    startView: (id, at) => { pview.open(); return start(id, at); },   // (N1: the window opens inside the tap, then the talk starts)
    scriptNotes: (s) => { const d = fromScript(s); openHandout(d, deckNumbers(d)); }, newScript, importFile, addStep, shareScript, exportScript, remove, current: () => live.deck?.id ?? null, count: slideCount,
    resumeAt: (d) => resumeFor(d.id, slideCount(d)) });
  return { library, readLink };
}
