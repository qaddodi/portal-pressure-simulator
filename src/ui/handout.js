// Speaker notes as a printable handout: one row per slide (number, kicker and title, the slide's line and
// equation, the notes, and the question for the room with its answer). Opened as its own page so the
// presenter can print it or keep it on a phone; no second window to keep in sync.
// Works for any deck the Presenter lists (decks.js, new ones included) and for the instructor's scripts.

import { download } from './records.js?v=50fb9dd463';
import { LEVELS, withOverview } from './decks.js?v=24a415b757';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = (t) => t.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

const CSS = `
:root { color-scheme: light; --ink: #1a1a1a; --ink-2: #4a4a4a; --ink-3: #767676; --rule: #d6d6d6; --soft: #f4f4f2; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px 48px; background: #fff; color: var(--ink); font: 14px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%; }
main { max-width: 960px; margin: 0 auto; }
header { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px 24px; padding-bottom: 14px; border-bottom: 2px solid var(--ink); }
h1 { margin: 0; font: 600 26px/1.15 'Source Serif 4', 'Iowan Old Style', Georgia, serif; letter-spacing: -.01em; }
.meta { margin: 4px 0 0; color: var(--ink-3); font-size: 13px; }
.sum { margin: 10px 0 0; color: var(--ink-2); max-width: 70ch; }
button { font: 600 13px/1 Inter, system-ui, sans-serif; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--ink); background: var(--ink); color: #fff; cursor: pointer; }
ol { list-style: none; margin: 0; padding: 0; }
li { display: grid; grid-template-columns: 2.2em minmax(0, 1fr) minmax(0, 1.25fr); gap: 4px 20px; padding: 16px 0; border-bottom: 1px solid var(--rule); break-inside: avoid; page-break-inside: avoid; }
.n { font-size: 15px; font-weight: 600; line-height: 1.3; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.k { margin: 0 0 2px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
h2 { margin: 0; font: 600 17px/1.25 'Source Serif 4', 'Iowan Old Style', Georgia, serif; }
.line { margin: 6px 0 0; color: var(--ink-2); }
.eq { margin: 8px 0 0; }
.eq math { font-family: 'STIX Two Math', 'Cambria Math', 'Latin Modern Math', math; font-size: 17px; }
.eq small { display: block; margin-top: 2px; color: var(--ink-3); font-size: 12px; }
.notes p { margin: 0; }
.ol { display: block; margin: 4px 0 10px; padding-left: 1.3em; color: var(--ink-2); }
.ol li { display: list-item; padding: 1px 0; border: 0; }
ul.ol { list-style: disc; } ol.ol { list-style: decimal; }
.h { margin: 0 0 2px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
.ask { margin-top: 10px; padding: 8px 12px; border-radius: 8px; background: var(--soft); }
.ask p { margin: 0; }
.ask .a { margin-top: 4px; color: var(--ink-2); }
.ask .a b { font-weight: 600; color: var(--ink); }
.empty { color: var(--ink-3); font-style: italic; }
@media (max-width: 640px) {
  body { padding-top: 20px; }
  li { grid-template-columns: 2em minmax(0, 1fr); }
  .notes { grid-column: 2; margin-top: 8px; }
}
@media print {
  @page { margin: 14mm 12mm; }
  body { padding: 0; font-size: 10.5pt; }
  button { display: none; }
  li { padding: 10px 0; }
  .ask { background: none; border: 1px solid var(--rule); }
}`;

function slideRow(s, i) {
  const [ml, legend] = s.eq || [];
  const [q, a] = Array.isArray(s.ask) ? s.ask : s.ask ? [s.ask] : [];
  return `<li>
  <div class="n">${i + 1}</div>
  <div>
    ${s.kicker ? `<p class="k">${esc(s.kicker)}</p>` : ''}
    <h2>${esc(s.title || 'Slide')}</h2>
    ${s.line ? `<p class="line">${esc(s.line)}</p>` : ''}
    ${s.visual === 'outline' ? `<p class="h">Outline</p><ol class="ol">${s.outline.map((k) => `<li>${esc(k)}</li>`).join('')}</ol>${s.objectives.length ? `<p class="h">Objectives</p><ul class="ol">${s.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}` : ''}
    ${ml ? `<div class="eq"><math>${ml}</math>${legend ? `<small>${esc(legend)}</small>` : ''}</div>` : ''}
  </div>
  <div class="notes">
    <p class="h">Notes</p>
    ${s.notes ? `<p>${esc(s.notes)}</p>` : '<p class="empty">No notes for this slide.</p>'}
    ${q ? `<div class="ask"><p class="h">Ask the room</p><p>${esc(q)}</p>${a ? `<p class="a"><b>Answer:</b> ${esc(a)}</p>` : ''}</div>` : ''}
  </div>
</li>`;
}

/** The handout page for a deck, as a standalone HTML document. (A deck's eq is its own constant MathML.) */
export function handoutHTML(d) {
  const meta = [LEVELS[d.level] || (d.mine ? 'Your script' : ''), `${d.slides.length} slides`, d.minutes ? `about ${d.minutes} min` : ''].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notes: ${esc(d.title)}</title><style>${CSS}</style></head><body><main>
<header><div><h1>${esc(d.title)}</h1><p class="meta">Speaker notes · ${esc(meta)}</p>${d.summary ? `<p class="sum">${esc(d.summary)}</p>` : ''}</div>
<button type="button" onclick="print()">Print</button></header>
<ol>${(d.mine ? d.slides : withOverview(d).slides).map(slideRow).join('')}</ol>
</main></body></html>`;
}

/** Opens the handout in a new tab; where a new tab is refused (some installed web apps), saves it as a file. */
export function openHandout(d) {
  const html = handoutHTML(d);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (w) setTimeout(() => URL.revokeObjectURL(url), 60000);
  else { URL.revokeObjectURL(url); download(`${slug(d.title)}-notes.html`, html, 'text/html'); }
}
