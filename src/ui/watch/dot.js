// The ?watch red dot: a small dot in the corner that appears when a motion rule fails while the app is in use. Tap it for the findings (each: the
// rule, what and where, why, the file that owns it), and Copy puts them with the last 10 seconds of the history on the clipboard.
// DOM writes happen only when a finding arrives or the person taps, never per frame. Preview only; off without ?watch.
const BASE = 'position:fixed;z-index:var(--z-diag);font:600 11px/1.35 ui-monospace,Menlo,monospace;color:#fff';   // colour-exempt: a diagnostic aid

export function createDot({ doc = document, watch, copy = null }) {
  const root = doc.createElement('div');
  root.style.cssText = `${BASE};left:max(8px, env(safe-area-inset-left));bottom:calc(8px + env(safe-area-inset-bottom))`;
  root.hidden = true;   // off-screen: the ?watch dot, a diagnostic aid on the preview copy; it holds nothing until a finding arrives
  const dot = doc.createElement('button');
  dot.type = 'button'; dot.setAttribute('aria-label', 'Motion findings');
  dot.style.cssText = 'min-width:26px;height:26px;border-radius:13px;border:0;background:#e5253a;color:#fff;font:inherit;padding:0 7px;box-shadow:0 0 0 2px rgb(255 255 255 / .85)';   // colour-exempt
  const panel = doc.createElement('div');
  panel.hidden = true;   // off-screen: the diagnostic list, closed until the dot is tapped
  panel.style.cssText = 'margin-bottom:6px;max-width:min(560px, calc(100vw - 16px));max-height:50vh;overflow:auto;padding:8px 10px;border-radius:8px;background:rgb(0 0 0 / .86);white-space:pre-wrap;overflow-wrap:anywhere';   // colour-exempt
  const bar = doc.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
  const btn = (t, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = t; b.style.cssText = 'font:inherit;color:#fff;background:rgb(255 255 255 / .18);border:0;border-radius:5px;padding:2px 8px;min-height:22px'; b.addEventListener('click', fn); bar.append(b); return b; };   // colour-exempt
  const body = doc.createElement('div');
  btn('Copy', () => { const t = text(); if (copy) copy(t); else globalThis.navigator?.clipboard?.writeText?.(t); });
  btn('Clear', () => { watch.clear(); render(); });
  panel.append(bar, body);
  root.append(panel, dot);
  dot.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) render(); });   // off-screen: the diagnostic list, opened by a tap

  /** One finding as words. */
  const line = (f) => `${f.at}  ${f.rule}: ${f.what}, ${f.where}\n      why: ${f.why}\n      owner: ${f.owner}`;
  /** The findings, then the history, as one paste. */
  function text() {
    const fs = watch.findings();
    return `Motion findings (${fs.length})\n${fs.map(line).join('\n')}\n\nHistory (last 10 s, JSON):\n${JSON.stringify(watch.history({ seconds: 10 }))}`;
  }
  function render() { const fs = watch.findings(); body.textContent = fs.length ? fs.slice(-12).map(line).join('\n') : 'No findings.'; dot.textContent = String(fs.length); }
  return {
    el: root, text,
    /** A new finding: show the dot (and the open list). */
    add() { root.hidden = false; render(); },   // off-screen: the dot appears when the first finding arrives; a diagnostic aid, never part of the app's look
    remove() { root.remove(); },
  };
}
