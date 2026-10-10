// Speaker notes as a printed handout, laid out like a journal handout: the title, objectives and outline up
// front, then one block per slide: the slide's figure as the audience saw it (its table, chart or the anatomy
// with the pressure card; brand/handout, made by scripts/handout-figures.mjs) beside the kicker, title, line,
// typeset equation, notes and the question for the room. Blocks never split across pages; it reads in black
// and white. Opened as its own page to print or keep on a phone. Works for any deck the Presenter lists
// (decks.js, new ones included: a slide without a figure prints without one) and for the instructor's scripts.

import { download } from './records.js?v=50fb9dd463';
import { LEVELS, withOverview } from './decks.js?v=50d14b4239';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = (t) => t.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

const CSS = `
:root { color-scheme: light; --ink: #111; --ink-2: #3d3d3d; --ink-3: #6b6b6b; --rule: #cfcfcf; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px 48px; background: #fff; color: var(--ink); font: 14px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%; }
main { max-width: 1040px; margin: 0 auto; }
.serif, h1, h2 { font-family: 'Source Serif 4', 'Iowan Old Style', Georgia, serif; }
.cap { margin: 0 0 4px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
header { padding-bottom: 16px; border-bottom: 2px solid var(--ink); }
.top { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 12px 24px; }
h1 { margin: 0; font-size: 30px; font-weight: 600; line-height: 1.12; letter-spacing: -.01em; }
.meta { margin: 6px 0 0; color: var(--ink-3); font-size: 13px; }
.sum { margin: 12px 0 0; color: var(--ink-2); max-width: 75ch; }
.plan { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px 40px; margin-top: 18px; }
.plan :is(ol, ul) { margin: 0; padding-left: 1.3em; }
.plan li { padding: 1px 0; }
button { font: 600 13px/1 Inter, system-ui, sans-serif; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--ink); background: var(--ink); color: #fff; cursor: pointer; }
article { display: flex; gap: 24px; padding: 22px 0; border-bottom: 1px solid var(--rule); break-inside: avoid; page-break-inside: avoid; }
figure { flex: 0 0 44%; margin: 0; }
figure img { display: block; width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 6px; }
article.wide { flex-direction: column; gap: 14px; }
article.wide figure { flex: none; }
.txt { flex: 1 1 0; min-width: 0; }
.n { font-variant-numeric: tabular-nums; }
h2 { margin: 0; font-size: 19px; font-weight: 600; line-height: 1.25; }
.line { margin: 6px 0 0; color: var(--ink-2); }
.eq { margin: 10px 0 0; }
.eq math { font-family: 'STIX Two Math', 'Cambria Math', 'Latin Modern Math', math; font-size: 18px; }
.eq small { display: block; margin-top: 2px; color: var(--ink-3); font-size: 12px; }
.notes { margin-top: 12px; }
.notes p { margin: 0; }
.ask { margin-top: 12px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 6px; }
.ask p { margin: 0; }
.ask .a { margin-top: 4px; color: var(--ink-2); }
.ask .a b { color: var(--ink); }
@media (max-width: 680px) {
  body { padding-top: 20px; }
  article { flex-direction: column; gap: 12px; }
  figure { flex: none; }
}
@media print {
  @page { size: A4; margin: 14mm 12mm; }
  body { padding: 0; font-size: 9.5pt; }
  main { max-width: none; }
  button { display: none; }
  h1 { font-size: 22pt; }
  h2 { font-size: 13pt; }
  article { padding: 12px 0; gap: 16px; }
  figure { flex-basis: 36%; }
  figure img { max-height: 72mm; object-fit: contain; object-position: left top; border: 0; }
  article.wide figure img { max-height: 95mm; }
  .eq math { font-size: 13pt; }
}`;

const fig = (base, d, s) => (base && !d.mine && s.id ? `<figure><img src="${esc(base)}${esc(d.id)}/${esc(s.id)}.webp" alt="" onerror="this.parentNode.remove()"></figure>` : '');

function slideBlock(d, base, s, i) {
  const [ml, legend] = s.eq || [];
  const [q, a] = Array.isArray(s.ask) ? s.ask : s.ask ? [s.ask] : [];
  return `<article class="${s.visual ? 'wide' : ''}">
  ${fig(base, d, s)}
  <div class="txt">
    <p class="cap"><span class="n">${i + 1}</span>${s.kicker ? ` · ${esc(s.kicker)}` : ''}</p>
    <h2>${esc(s.title || 'Slide')}</h2>
    ${s.line ? `<p class="line">${esc(s.line.replace(/[{}]/g, ''))}</p>` : ''}
    ${ml ? `<div class="eq"><math display="block">${ml}</math>${legend ? `<small>${esc(legend)}</small>` : ''}</div>` : ''}
    ${s.notes ? `<div class="notes"><p class="cap">Notes</p><p>${esc(s.notes)}</p></div>` : ''}
    ${q ? `<div class="ask"><p class="cap">Ask the room</p><p>${esc(q)}</p>${a ? `<p class="a"><b>Answer:</b> ${esc(a)}</p>` : ''}</div>` : ''}
  </div>
</article>`;
}

/** The handout for a deck, as a standalone HTML document; base: the URL of brand/handout/ for the figures.
 *  (A deck's eq is its own constant MathML.) */
export function handoutHTML(d, base = '') {
  const slides = d.mine ? d.slides : withOverview(d).slides;
  const open = slides[0]?.visual === 'outline' ? slides[0] : null;
  const meta = [LEVELS[d.level] || (d.mine ? 'Your script' : ''), `${slides.length} slides`, d.minutes ? `about ${d.minutes} min` : ''].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notes: ${esc(d.title)}</title><style>${CSS}</style></head><body><main>
<header><div class="top"><div><p class="cap">Speaker notes</p><h1>${esc(d.title)}</h1><p class="meta">${esc(meta)}</p></div>
<button type="button" onclick="print()">Print</button></div>
${d.summary ? `<p class="sum">${esc(d.summary)}</p>` : ''}
${open ? `<div class="plan">${open.objectives.length ? `<section><p class="cap">Objectives: by the end you can</p><ul>${open.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></section>` : ''}<section><p class="cap">Outline</p><ol>${open.outline.map((k) => `<li>${esc(k)}</li>`).join('')}</ol></section></div>` : ''}
</header>
${slides.map((s, i) => (s === open ? '' : slideBlock(d, base, s, i))).join('\n')}
</main></body></html>`;
}

/** Opens the handout in a new tab; where a new tab is refused (some installed web apps), saves it as a file. */
export function openHandout(d) {
  const html = handoutHTML(d, new URL('brand/handout/', location.href).href);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (w) setTimeout(() => URL.revokeObjectURL(url), 60000);
  else { URL.revokeObjectURL(url); download(`${slug(d.title)}-notes.html`, html, 'text/html'); }
}
