// Speaker notes as a printed handout, laid out like a journal handout: the title, objectives and outline up
// front, then one block per slide: the slide's figure as the audience saw it (its table, chart or the anatomy
// with the pressure card; brand/handout, made by scripts/handout-figures.mjs) beside the kicker, title, line,
// typeset equation, notes and the question for the room. Blocks never split across pages; it reads in black
// and white. Opened as its own page to print or keep on a phone. Works for any deck the Presenter lists
// (decks.js, new ones included: a slide without a figure prints without one) and for the instructor's scripts.

import { download } from './download.js?v=3564e5bf8c';
import { LEVELS, withOverview } from './decks.js?v=2f4ea7d3a2';
import { TILE } from './table-marks.js?v=1dc429fe31';
import { plateletText } from './glue.js?v=5a0f63226b';
import { citeText } from './teach-extras.js?v=5f5248f5a7';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = (t) => t.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// The handout is a printed page, black on white in any theme: its inks are the --print-* tokens, written in when it is made.
const cssVar = (n) => (typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(n).trim());
const css = () => `
:root { color-scheme: light; --ink: ${cssVar('--print-ink')}; --ink-2: ${cssVar('--print-ink-2')}; --ink-3: ${cssVar('--print-ink-3')}; --rule: ${cssVar('--print-rule')}; --paper: ${cssVar('--print-paper')}; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px 48px; background: var(--paper); color: var(--ink); font: 14px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%; }
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
button { font: 600 13px/1 Inter, system-ui, sans-serif; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); cursor: pointer; }
article { display: flex; gap: 24px; padding: 22px 0; border-bottom: 1px solid var(--rule); break-inside: avoid; page-break-inside: avoid; }
figure { flex: 0 0 44%; margin: 0; }
figure img { display: block; width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 6px; }
article.wide { flex-direction: column; gap: 14px; }
article.wide figure { flex: none; }
@media (min-width: 681px) { article.land figure { flex-basis: 55%; } }
.txt { flex: 1 1 0; min-width: 0; }
.n { font-variant-numeric: tabular-nums; }
h2 { margin: 0; font-size: 19px; font-weight: 600; line-height: 1.25; }
.line { margin: 6px 0 0; color: var(--ink-2); }
.eq { margin: 10px 0 0; }
.eq math { font-family: 'STIX Two Math', 'Cambria Math', 'Latin Modern Math', math; font-size: 18px; }
.eq small { display: block; margin-top: 2px; color: var(--ink-3); font-size: 12px; }
.cite { margin: 6px 0 0; color: var(--ink-3); font-size: 12px; }
.notes { margin-top: 12px; }
.notes p { margin: 0; }
.ask { margin-top: 12px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 6px; }
.ask p { margin: 0; }
.ask .a { margin-top: 4px; color: var(--ink-2); }
.checks { margin: 12px 0 0; padding-left: 1.4em; }
.checks li { margin-top: 6px; }
.checks p { margin: 0; }
.checks .a { margin-top: 2px; color: var(--ink-2); }
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
  article.land figure { flex-basis: 55%; }
  .eq math { font-size: 13pt; }
}`;

// Slides that print without a figure, on purpose: the outline goes in the header, and the quick check's questions
// and answers print as text (its card holds nothing else). Every other slide of a built-in deck has a figure.
export const NO_FIGURE = new Set(['outline', 'check']);
// (A figure drawn with its data card beside it is landscape: it takes more of the row.)
const fig = (base, d, s) => (base && !d.mine && s.id && !NO_FIGURE.has(s.visual) ? `<figure><img src="${esc(base)}${esc(d.id)}/${esc(s.id)}.webp" alt="" onload="if (this.naturalWidth > 1.2 * this.naturalHeight) this.closest('article').classList.add('land')" onerror="this.parentNode.remove()"></figure>` : '');

// A slide's line as plain text, as the slide shows it: [portal vein](pv) prints its word, {pv} the slide's own value
// ({ppg@before} another slide's), {<15 cm/s} a cut-off as its number, {6 to 8 g} its words. fp: the slide's numbers;
// at(id): another slide's. A value not known prints as a dash.
export function lineText(t, fp = null, at = () => null) {
  // (to the slide's decimals, with a true minus and no "−0", as util.js fmt writes it; that module needs a page)
  const num = (v, dp) => { const t = v.toFixed(dp); return /^-0(\.0+)?$/.test(t) ? t.slice(1) : t.replace('-', '−'); };
  const val = (k, f) => { const T = TILE[k], v = f?.[k]; return v == null || !Number.isFinite(v) ? '—' : k === 'plt' ? plateletText(v) : `${num(v * (T.x || 1), T.d ?? 1)}${T.u === '%' ? '%' : T.u ? ` ${T.u}` : ''}`; };
  return String(t ?? '').replace(/\[([^\]]+)\]\([\w:]+\)/g, '$1').replace(/\{([^}]+)\}/g, (_, mk) => {
    if (TILE[mk]) return val(mk, fp);
    const m = mk.match(/^(\w+)@([\w-]+)$/);
    if (m && TILE[m[1]]) return val(m[1], at(m[2]));
    return mk.replace(/^(?:>=|<=|[<>≥≤])\s*/, '');
  });
}

function slideBlock(d, base, s, i, fp, at) {
  const [ml, legend] = s.eq || [];
  const [q, a] = Array.isArray(s.ask) ? s.ask : s.ask ? [s.ask] : [];
  return `<article class="${s.visual ? 'wide' : ''}">
  ${fig(base, d, s)}
  <div class="txt">
    <p class="cap"><span class="n">${i + 1}</span>${s.kicker ? ` · ${esc(s.kicker)}` : ''}</p>
    <h2>${esc(s.title || 'Slide')}</h2>
    ${s.line ? `<p class="line">${esc(lineText(s.line, fp, at))}</p>` : ''}
    ${ml ? `<div class="eq"><math display="block">${ml}</math>${legend ? `<small>${esc(legend)}</small>` : ''}</div>` : ''}
    ${citeText(s.cite) ? `<p class="cite">${esc(citeText(s.cite))}</p>` : ''}
    ${s.notes ? `<div class="notes"><p class="cap">Notes</p><p>${esc(s.notes)}</p></div>` : ''}
    ${s.checks ? `<ol class="checks">${s.checks.map(([cq, ca]) => `<li><p>${esc(cq)}</p><p class="a"><b>Answer:</b> ${esc(ca)}</p></li>`).join('')}</ol>` : ''}
    ${q ? `<div class="ask"><p class="cap">Ask the room</p><p>${esc(q)}</p>${a ? `<p class="a"><b>Answer:</b> ${esc(a)}</p>` : ''}</div>` : ''}
  </div>
</article>`;
}

/** The handout for a deck, as a standalone HTML document; base: the URL of brand/handout/ for the figures; fps: each
 *  slide's numbers (its fingerprint, as the presenter computes it), for the values in the words.
 *  (A deck's eq is its own constant MathML.) */
export function handoutHTML(d, base = '', fps = []) {
  const slides = d.mine ? d.slides : withOverview(d).slides;
  const at = (id) => fps[slides.findIndex((x) => x.id === id)] ?? null;
  const open = slides[0]?.visual === 'outline' ? slides[0] : null;
  const meta = [LEVELS[d.level] || (d.mine ? 'Your script' : ''), `${slides.length} slides`, d.minutes ? `about ${d.minutes} min` : ''].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notes: ${esc(d.title)}</title><style>${css()}</style></head><body><main>
<header><div class="top"><div><p class="cap">Speaker notes</p><h1>${esc(d.title)}</h1><p class="meta">${esc(meta)}</p></div>
<button type="button" onclick="print()">Print</button></div>
${d.summary ? `<p class="sum">${esc(d.summary)}</p>` : ''}
${open ? `<div class="plan">${open.objectives.length ? `<section><p class="cap">Objectives: by the end you can</p><ul>${open.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></section>` : ''}<section><p class="cap">Outline</p><ol>${open.outline.map((k) => `<li>${esc(k)}</li>`).join('')}</ol></section></div>` : ''}
</header>
${slides.map((s, i) => (s === open ? '' : slideBlock(d, base, s, i, fps[i], at))).join('\n')}
</main></body></html>`;
}

/** Opens the handout in a new tab; where a new tab is refused (some installed web apps), saves it as a file.
 *  numbers: a promise of each slide's numbers (the deck computed as the presenter does it, a second or two); the tab
 *  opens at once (still inside the tap, so it is not blocked) and the notes are written into it when they are ready. */
export async function openHandout(d, numbers = Promise.resolve([])) {
  const w = window.open('', '_blank');
  if (w) w.document.write(`<!doctype html><title>Notes: ${esc(d.title)}</title><p style="font: 15px system-ui, sans-serif; margin: 32px">Preparing the notes…</p>`);
  const fps = await numbers.catch(() => []);
  const html = handoutHTML(d, new URL('brand/handout/', location.href).href, fps || []);
  if (w && !w.closed) { w.document.open(); w.document.write(html); w.document.close(); }
  else download(`${slug(d.title)}-notes.html`, html, 'text/html');
}
