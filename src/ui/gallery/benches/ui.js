// Small DOM helpers the debug benches share (the card gallery, preview only; docs/card-gallery.md). Plain elements and one style sheet,
// all written when a bench opens or a button is tapped, never in a frame. The look comes from the app's own tokens (--surface, --text...),
// so every bench follows the five looks. Nothing here is imported by the live app.

const CSS = `
.gb { font: 13px/1.45 system-ui, -apple-system, sans-serif; color: var(--text); padding: 12px 14px 20px; max-width: 980px; }
.gb h3 { font-size: 15px; margin: 0 0 4px; } .gb p { margin: 0 0 8px; color: var(--text-2, var(--text)); }
.gb .gb-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
.gb button { font: inherit; padding: 6px 10px; min-height: 32px; border-radius: 8px; border: 1px solid var(--border-strong, var(--border)); background: var(--surface); color: var(--text); cursor: pointer; }
.gb button[aria-pressed="true"], .gb button.on { background: var(--surface-3, var(--surface-2)); border-color: var(--text); font-weight: 600; }
.gb button:disabled { opacity: .45; cursor: default; }
.gb table { border-collapse: collapse; font-variant-numeric: tabular-nums; margin: 6px 0; }
.gb th, .gb td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--hairline, var(--border)); vertical-align: top; }
.gb th { font-weight: 600; position: sticky; top: 0; background: var(--surface); }
.gb .gb-note { font-size: 12px; color: var(--text-2, var(--text)); }
.gb .gb-ok { color: var(--ok); } .gb .gb-warn { color: var(--caution); } .gb .gb-bad { color: var(--danger); }
.gb .gb-status { min-height: 1.4em; font-size: 12px; }
.gb textarea, .gb pre { width: 100%; box-sizing: border-box; font: 12px/1.4 ui-monospace, Menlo, monospace; background: var(--surface-2, var(--surface)); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.gb pre { white-space: pre-wrap; max-height: 40vh; overflow: auto; }
.gb input[type="search"], .gb input[type="text"], .gb select { font: inherit; padding: 5px 8px; min-height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
.gb .gb-grid { display: grid; gap: 4px; }
.gb .gb-sw { display: inline-block; width: 22px; height: 22px; border-radius: 5px; border: 1px solid var(--border); vertical-align: middle; }
`;

/** Puts the benches' one style sheet in the document (once). */
export function benchStyles(doc = globalThis.document) {
  if (!doc || doc.getElementById('gb-styles')) return;
  const s = doc.createElement('style'); s.id = 'gb-styles'; s.textContent = CSS; doc.head.append(s);
}

/** h('button', { class: 'on', onclick: fn }, 'Text', child) → element. Attributes starting "on" are listeners. */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}

/** A table from a header row and rows of strings or nodes. */
export function table(head, rows) {
  return h('table', null, h('thead', null, h('tr', null, head.map((c) => h('th', null, c)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c))))));
}

/** A line of status text the bench rewrites on a tap or a slow timer: tone is 'ok' | 'warn' | 'bad' | ''. */
export function statusLine() {
  const el = h('div', { class: 'gb-status', role: 'status', 'aria-live': 'polite' });
  el.set = (text, tone = '') => { el.className = `gb-status${tone ? ` gb-${tone}` : ''}`; el.textContent = text; };
  return el;
}

/** Copies text: the page's own copy when ctx has one, else the clipboard. Resolves true when it worked. */
export async function copyText(text, ctx) {
  try { if (typeof ctx?.copy === 'function') return !!(await ctx.copy(text)); await navigator.clipboard.writeText(text); return true; } catch { return false; }   // alloc-rare: a tap
}

/** A button that copies `get()` and says so in `say`. */
export function copyButton(label, get, say, ctx) {
  return h('button', { type: 'button', onclick: async () => { const ok = await copyText(get(), ctx); say?.(ok ? 'Copied.' : 'The page would not let me copy; select the text and copy it.', ok ? 'ok' : 'warn'); } }, label);
}

/** Waits ms of the page's own clock (the test clock when it is on). */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The pps the bench was given, or the page's. */
export const ppsOf = (ctx) => ctx?.pps || globalThis.pps || globalThis.window?.pps || null;

/** Builds a bench's root: styles in, a class on the host, and a heading. Returns the host. */
export function benchRoot(host, title, blurb) {
  benchStyles(host.ownerDocument);
  host.classList.add('gb');
  host.append(h('h3', null, title), blurb ? h('p', null, blurb) : null);
  return host;
}
