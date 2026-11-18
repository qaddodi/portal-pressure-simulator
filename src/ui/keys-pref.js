// Settings > Display > Keyboard shortcuts (SHELL-8, WCAG 2.1.4 Character Key Shortcuts): the single-key shortcuts (Space, A, L, Z, I, T, P, J, [ ], ., / ? and the
// number keys) can be switched off, for anyone whose speech input or switch device would fire them by accident. On unless this device chose off ('pps.keys' = '0').
// What stays: Esc, Ctrl/Cmd with a key (Ctrl/Cmd K, Z, + - 0), and a control's own keys when it has focus (the figure's arrows and Enter, a button's Space).
let on = true;
try { on = localStorage.getItem('pps.keys') !== '0'; } catch { /* storage unavailable: on */ }

export const keysOn = () => on;
/** Sets and remembers the choice. Returns it. */
export function setKeysOn(v) {
  on = !!v;
  try { localStorage.setItem('pps.keys', on ? '1' : '0'); } catch { /* storage unavailable: kept for this visit */ }
  return on;
}
/** Whether a key press is one the switch holds back: a plain key (no Ctrl or Cmd) and not Esc, with the shortcuts off. */
export const keyHeldBack = (e) => !on && !e.ctrlKey && !e.metaKey && e.key !== 'Escape';
