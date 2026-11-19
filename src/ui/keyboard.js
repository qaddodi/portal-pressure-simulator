// The page's keys (§8.5), out of main.js (SHL-7, bible review 19 Nov 2026: main.js had 78 tests that read its text and none that ran it). createKeyboard takes what the keys act on
// and returns the keydown handler, so tests/keyboard.test.js drives it with a fake page: Esc closes one thing, a talk owns its keys, a text field keeps its own, a held key is one press,
// the figure's zoom is on the plain + - 0, and the speed ladder steps.
// The letter a key stands for: its character where that is a Latin letter, else its place on the board (an Arabic or Russian layout has no A, L or Z
// to name, but the key in that place is the same one).
// (Only a letter of another script falls back to its place: on a Dvorak or Colemak board the key that makes ; sits where Z is, and ; is not Z.)
export const letterOf = (e) => /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : /^\p{L}$/u.test(e.key || '') && /^Key[A-Z]$/.test(e.code || '') ? e.code[3].toLowerCase() : (e.key || '').toLowerCase();
// Inputs that are controls, not text: a slider, a switch, a button. They keep their own keys (the arrows, Space) and leave the rest to the page.
const NON_TEXT_INPUT = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'color', 'file']);

/** @param <class 'object'> d what the keys act on (see main.js wireKeyboard); `projecting()` says whether the projector look is on. */
export function createKeyboard(d) {
  const { palette, isModalOpen, closeModal, popoverOpen, closePopover, mainMenu, toggleProjector, app, dock, treatOpen, closeTreat, historyOpen, closeHistory, stage, store, setTool, setViewKey, viewKey, panelShown, closePanel, card, presenter, keyHeldBack, doRedo, doUndo, controlOwnsKey, host, runOn, runOff, speeds, lapses, setSpeed, toast, lensKeys, lenses, lcFirst, settle, openHelp, openTreat, timeline, injectDye, projecting } = d;
  function onKeyDown(e) {
    if (e.isComposing || e.keyCode === 229) return;   // (an input method is composing: its Enter and Esc are its own)
    const tag = (e.target.tagName || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.isOpen() ? palette.close() : palette.open(); return; }
    // (Ctrl or Cmd with + − 0 is the browser's page zoom, which a low-vision user needs: WCAG 1.4.4, SHL-5. The figure's zoom is the plain + − 0 below.)
    const inputType = tag === 'input' ? (e.target.type || 'text') : '';
    if (tag === 'select' || tag === 'textarea' || e.target.isContentEditable || (tag === 'input' && !NON_TEXT_INPUT.has(inputType))) {
      // (A dialog's one-line field, a name or a link, cancels its dialog with Esc as the old prompt did; a longer text box blurs first.)
      if (e.key === 'Escape') { if (tag === 'input' && isModalOpen() && e.target.closest?.('#modalBack')) { e.preventDefault(); closeModal(); } else e.target.blur(); }
      return;
    }
    // A slider or a switch left with focus (Chrome keeps it after a click or a drag) keeps the keys it uses; the rest, Cmd Z, Space, the letters, are the page's.
    if (tag === 'input' && (inputType === 'range' ? /^(Arrow(Left|Right|Up|Down)|Home|End|Page(Up|Down))$/ : /^(Arrow(Left|Right|Up|Down)| |Enter)$/).test(e.key)) return;
    // Search open with focus on one of its results: Esc closes it, and no letter reaches the figure behind it.
    if (palette.isOpen()) { if (e.key === 'Escape') { e.preventDefault(); palette.close(); } return; }
    if (e.key === 'Escape') {
      // One Esc closes one thing: an open menu first, and only the menu (review #24).
      if (popoverOpen()) { closePopover(); return; }
      if (isModalOpen()) closeModal();
      else if (mainMenu.isOpen()) mainMenu.close();
      else if (projecting()) toggleProjector(false);
      else if (app.classList.contains('instrument-focus')) dock.setState('open');
      else if (treatOpen()) closeTreat({ focus: true });
      else if (historyOpen()) closeHistory({ focus: true });
      else if (stage.isShunting()) stage.cancelShunt();
      else if (store.get().tool !== 'select') setTool('select');
      else if (app.classList.contains('dock-open') && dock) dock.close();   // Tests (it hands focus back to its tab)
      else if (store.get().sinusoid && !store.get().selection) setViewKey('lobule');
      else if (panelShown() && !store.get().selection) closePanel({ focus: true });   // the patient chart (its close button says Esc)
      else if (card.detailsOpen()) card.closeDetails();   // (a card's details first, then the card)
      else store.set({ selection: null });
      return;
    }
    if (isModalOpen() || mainMenu.isOpen()) return;
    // A talk owns the keyboard (presenter.js onKey takes its own keys): undo, speed, view, lens, dye, settle and the rest would change the
    // slide's scripted model under it, and nothing puts it back. Search (/) and the guide (?) stay.
    if (presenter.active() && e.key !== '/' && e.key !== '?') return;
    if (keyHeldBack(e)) return;   // (Settings › Keyboard shortcuts off: only Esc and Ctrl or Cmd with a key are the page's, keys-pref.js)
    if (e.key === '/') { e.preventDefault(); palette.open(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? doRedo : doUndo)(); return; }
    // (A held key is one press: Space does not flicker play and pause, a number does not run its verb twenty times. J has its own rule below.)
    // (The figure's item in focus and a label act on Space themselves; a button the keyboard reached does too, one that was clicked does not. A held Space is still ours: it must not scroll the panel behind.)
    const spaceIsOurs = e.key === ' ' && !e.altKey && !controlOwnsKey(e.target, ' ') && !e.target.closest?.('.lb') && !(e.target.id === 'stage' && stage?.keyItem?.());
    if (e.repeat && !(e.ctrlKey || e.metaKey) && letterOf(e) !== 'j') { if (spaceIsOurs) e.preventDefault(); return; }
    // (The speed keys [ and ] need Option on a German, French or Spanish layout: the character they make is the key, so Option alone is no reason to drop them. On Windows the
    // same layouts make them with AltGr, which reports Ctrl and Alt together; AltGr makes other characters too (a Polish ą), and those are not the letter's key.)
    const altGr = !!e.getModifierState?.('AltGraph');
    if (altGr ? e.key !== '[' && e.key !== ']' : e.ctrlKey || e.metaKey || (e.altKey && e.key !== '[' && e.key !== ']')) return;
    if (spaceIsOurs) { e.preventDefault(); host.send({ type: 'run', running: !store.get().running }); return; }
    // With a card open, the number keys run its verbs in order.
    if (/^[1-9]$/.test(e.key) && card.isOpen()) { if (card.trigger(+e.key)) e.preventDefault(); return; }
    if (e.key === '.') { host.send(runOn); setTimeout(runOff, 60); return; }
    // The figure's zoom on the plain keys (Ctrl or Cmd with them stays the browser's page zoom).
    if (e.key === '+' || e.key === '=') { e.preventDefault(); stage.zoomIn(); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); stage.zoomOut(); return; }
    if (e.key === '0') { e.preventDefault(); stage.fit(); return; }
    if (e.key === '[' || e.key === ']') {
      // One ladder: real-time speeds, then the time-lapse rates.
      const ladder = [...speeds.map((v) => [v, false]), ...lapses.map(([d]) => [d, true])];
      const cur = store.get().lapse ? ladder.findIndex(([v, l]) => l && v === store.get().lapse) : ladder.findIndex(([v, l]) => !l && v === store.get().speed);
      const [v, lap] = ladder[Math.max(0, Math.min(ladder.length - 1, (cur < 0 ? 2 : cur) + (e.key === ']' ? 1 : -1)))];
      setSpeed(v, lap);
      toast(lap ? `Time-lapse ${lapses.find((l) => l[0] === v)[2]}` : `Speed ${v}×`);
      return;
    }
    const k = letterOf(e);
    if (k === 'a' && !e.shiftKey) { if (store.get().sinusoid) return; setViewKey(viewKey() === 'circuit' ? 'anatomy' : 'circuit'); return; }
    if ((k === 'l' || (e.key === 'C' && e.shiftKey)) && !store.get().imaging && !(store.get().lobule && store.get().sinusoid)) {
      const ks = lensKeys(), i = ks.indexOf(store.get().colorMode);
      const next = ks[(i + (e.shiftKey && k === 'l' ? ks.length - 1 : 1)) % ks.length];
      store.set({ colorMode: next }); toast(`Colored by ${lcFirst(lenses[next][0])}. ${lenses[next][1]}.`); return;
    }
    if (k === 'z') { settle(); return; }
    if (e.key === '?') { openHelp(presenter.active() ? 'present' : undefined); return; }
    if (k === 'i') { dock.toggle(); return; }
    if (k === 't') { if (treatOpen()) closeTreat({ focus: true }); else openTreat(); return; }
    if (k === 'p') { timeline.togglePin(); return; }
    if (k === 'j' && !store.get().imaging) { if (!e.repeat) injectDye({ hold: true }); return; }
  }
  /** J injects dye for as long as it is held: its release (keyup, or the window losing focus) lets go. */
  const onKeyUp = (e) => { if (letterOf(e) === 'j') stage.releaseDye(); };
  return { onKeyDown, onKeyUp };
}
