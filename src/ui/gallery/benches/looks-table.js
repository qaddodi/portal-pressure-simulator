// Looks table bench (card gallery, plan 1.5 and 2.8): for each of the five looks (Light, Soft, Dark, Navy, Black) the colour tokens as swatches with
// their names and values, and each chart's resolved look (chart-looks/resolve.js) as name -> value rows per look. Pure data, no GPU, no screenshots:
// the values come from src/ui/theme-tokens.js, the table styles/tokens.css is printed from (so this is what the page wears; no style is read), and
// from the chart look table (chart-looks/index.js) resolved with resolveProps for a context of each look, with no state and no per-piece colour.
// A text token under 4.5:1 (WCAG AA) on a surface it sits on is listed as a warning.
//
// The pure helpers (parseColor, contrastRatio, looksMatrix, contrastWarnings, chartLookRows, matrixToText) have no DOM and are tested in node
// (tests/gallery-bench-looks-table.test.js). mount only draws, on open and on a tap or a filter change: nothing runs in a frame and no timer is made.
import { benchRoot, h, statusLine, copyButton } from './ui.js';
import { LOOK_IDS, tokensOfLook } from '../../theme-tokens.js';
import { parseCssColor } from '../../css-color.js';
import { LOOKS, HOSTS } from '../../chart-looks/index.js';
import { withVarsResolved, resolveProps, withCtx } from '../../chart-looks/resolve.js';

/** The AA ratio for normal text. */
export const AA = 4.5;

/** The names of the five looks as Settings shows them. */
export const LOOK_NAMES = Object.freeze({ light: 'Light', soft: 'Soft', dark: 'Dark', navy: 'Navy', black: 'Black' });

/** A CSS colour as [r, g, b, a] (0 to 1, sRGB), or null when the text is not a colour (a length, a percentage, a shadow). */
export function parseColor(text) {
  if (Array.isArray(text)) return text.length >= 3 ? [text[0], text[1], text[2], text[3] ?? 1] : null;
  if (typeof text !== 'string' || !text.trim()) return null;
  const c = parseCssColor(text.trim());
  return c ? [c[0], c[1], c[2], c[3]] : null;
}

const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
/** The relative luminance of an [r, g, b] colour (WCAG 2). */
export const luminance = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const over = (fg, bg) => { const a = fg[3]; return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1]; };

/**
 * The WCAG contrast ratio of two colours (CSS text or [r, g, b, a]), 1 to 21, or null when either is not a colour. A colour with an alpha is
 * laid over the other (the text over its ground), and a ground with an alpha over `under` (white by default).
 */
export function contrastRatio(a, b, under = [1, 1, 1, 1]) {
  const fg = parseColor(a), bgRaw = parseColor(b), u = parseColor(under) || [1, 1, 1, 1];
  if (!fg || !bgRaw) return null;
  const bg = over(bgRaw, u), top = over(fg, bg);
  const [x, y] = [luminance(top), luminance(bg)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The text tokens and the grounds they sit on (tests/token-contrast.test.js claims the first set; the rest are the other inks the page prints as words). */
export const TEXT_ON_SURFACE = Object.freeze({
  text: ['bg', 'stage-bg', 'surface', 'surface-2', 'surface-3'],
  'text-2': ['bg', 'stage-bg', 'surface', 'surface-2', 'surface-3'],
  'text-3': ['bg', 'stage-bg', 'surface', 'surface-2', 'surface-3'],
  'accent-ink': ['surface', 'surface-2'],
  'text-inverse': ['accent'],
});
/** Flattened pairs [text token, ground token]. */
export const CONTRAST_PAIRS = Object.freeze(Object.entries(TEXT_ON_SURFACE).flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg])));

/** Every token of every look as { look: { name: css text } }, with var() written as another token resolved (the page's cascade). */
export function allLookTokens(ids = LOOK_IDS) {
  return Object.fromEntries(ids.map((id) => [id, withVarsResolved(tokensOfLook(id))]));
}

const COLOUR_WORD = /^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color\(|color-mix\(|transparent$)/i;
/** Whether a token's text is a colour (so it gets a swatch). */
export const isColourText = (v) => typeof v === 'string' && COLOUR_WORD.test(v.trim()) && !!parseColor(v);

/**
 * Rows of token x look: [{ name, values: { look: text | undefined }, differs, colour }], names in the order the tables list them (first appearance).
 * differs is true when any look's text differs from another's (a look that lacks the token counts as different).
 */
export function looksMatrix(tokensByLook, ids = Object.keys(tokensByLook)) {
  const names = [], seen = new Set();
  for (const id of ids) for (const n of Object.keys(tokensByLook[id] || {})) if (!seen.has(n)) { seen.add(n); names.push(n); }
  return names.map((name) => {
    const values = {};
    for (const id of ids) values[id] = tokensByLook[id]?.[name];
    const first = values[ids[0]];
    return { name, values, differs: ids.some((id) => values[id] !== first), colour: ids.some((id) => isColourText(values[id])) };
  });
}

/** The text pairs under 4.5:1 in a look: [{ look, fg, bg, fgValue, bgValue, ratio }], worst first. A pair whose colours are not both in the look is skipped. */
export function contrastWarnings(tokensByLook, pairs = CONTRAST_PAIRS, min = AA) {
  const out = [];
  for (const [look, t] of Object.entries(tokensByLook)) {
    for (const [fg, bg] of pairs) {
      const r = contrastRatio(t[fg], t[bg]);
      if (r != null && r < min) out.push({ look, fg, bg, fgValue: t[fg], bgValue: t[bg], ratio: r });
    }
  }
  return out.sort((a, b) => a.ratio - b.ratio);
}

// ---- chart looks ----
/** The context a chart look is read under for a look id, as makeCtx would make it from <html> (no page needed). */
export function lookContext(id, host = '') {
  const attr = { light: ['light', false, ''], soft: ['soft', false, ''], dark: ['dark', true, ''], navy: ['dark', true, 'navy'], black: ['dark', true, 'black'] }[id];
  if (!attr) throw new RangeError(`unknown look ${id}`);
  const base = { theme: attr[0], dark: attr[1], palette: attr[2], view: 'anatomic', motion: 'full', host, layout: '', in: '', boxW: 0, scale: {}, svk: 1, fit: 1, dk: 1, lad: 1, hostPx: 12, sig: '' };
  base.hostPx = HOSTS[host] ? HOSTS[host](base) : 12;
  return withCtx(base, {});
}

const MAGENTA = 'rgb(255, 0, 255)';   // colour-exempt: (what the resolver answers for a colour the builder gives each piece, or a token the look lacks)
/** A resolved value as short text: numbers and words as they are, a piece's own colour as "(per piece)", lists and ease records as JSON. */
export function formatValue(v) {
  if (v === undefined) return '';
  if (v === MAGENTA) return '(per piece)';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(+v.toFixed(4));
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** One chart look resolved for each look: { prop: text } per look id. No state, no piece colours; a host adds its `when` rows and its type size. */
export function resolveChartLook(key, ids = LOOK_IDS, host = '') {
  const entry = LOOKS[key];
  const out = {};
  if (!entry) return out;
  const warn = console.warn;
  console.warn = () => {};   // (a colour the builder hands each piece has no token here: the resolver says so once on the console; the row says "(per piece)")
  try {
    for (const id of ids) {
      const P = resolveProps(entry, lookContext(id, host), {}, {});
      out[id] = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, formatValue(v)]));
    }
  } finally { console.warn = warn; }
  return out;
}

/** Rows of chart look x prop x look: [{ key, prop, values: { look: text }, differs }], keys in the table's order, props in the order they resolve. */
export function chartLookRows(ids = LOOK_IDS, host = '', keys = Object.keys(LOOKS)) {
  const rows = [];
  for (const key of keys) {
    const per = resolveChartLook(key, ids, host);
    const props = [];
    for (const id of ids) for (const p of Object.keys(per[id] || {})) if (!props.includes(p)) props.push(p);
    for (const prop of props) {
      const values = Object.fromEntries(ids.map((id) => [id, per[id]?.[prop] ?? '']));
      rows.push({ key, prop, values, differs: ids.some((id) => values[id] !== values[ids[0]]) });
    }
  }
  return rows;
}

/** The groups of chart look keys ("plot", "talk" ... the part before the first dot), in table order. */
export const chartGroups = (keys = Object.keys(LOOKS)) => [...new Set(keys.map((k) => k.split('.')[0]))];

/** Rows as tab-separated text: a header of look names, then name and each look's value. */
export function matrixToText(rows, ids = LOOK_IDS, nameOf = (r) => r.name) {
  return [['name', ...ids.map((i) => LOOK_NAMES[i] || i)].join('\t'), ...rows.map((r) => [nameOf(r), ...ids.map((i) => r.values[i] ?? '')].join('\t'))].join('\n');
}

/** The warnings as lines. */
export const warningsToText = (ws) => (ws.length ? ws.map((w) => `${LOOK_NAMES[w.look] || w.look}: --${w.fg} ${w.fgValue} on --${w.bg} ${w.bgValue} is ${w.ratio.toFixed(2)}:1 (under ${AA}:1)`).join('\n') : `No text token pair is under ${AA}:1.`);

const CAP = 500;   // rows drawn at most in one table; the filters narrow the rest

export default {
  id: 'looks-table',
  title: 'Looks table',
  mount(host, ctx) {
    benchRoot(host, 'Looks table', 'The colour tokens of the five looks and each chart\'s resolved look, from the tables the page is built from (theme-tokens.js, chart-looks). No page style is read. Only rows that differ between looks are shown at first.');
    const say = statusLine();
    const ids = LOOK_IDS.slice();
    const tokens = allLookTokens(ids);
    const matrix = looksMatrix(tokens, ids);
    const warns = contrastWarnings(tokens);
    let charts = null;   // (the chart rows are made when that section is first asked for)

    // ---- the look buttons: wear a look on the page, to see a swatch beside the real thing ----
    const now = typeof ctx?.look === 'function' ? ctx.look() : null;
    const wear = h('div', { class: 'gb-row' }, h('span', { class: 'gb-note' }, 'Wear on the page:'),
      ids.map((id) => h('button', { type: 'button', 'aria-pressed': String(id === now), disabled: typeof ctx?.setLook !== 'function', onclick: (e) => {
        try { ctx.setLook(id); for (const b of wear.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === e.currentTarget)); say.set(`Wearing ${LOOK_NAMES[id]}.`, 'ok'); } catch (err) { say.set(`The look would not change: ${err?.message || err}`, 'bad'); }
      } }, LOOK_NAMES[id])));

    // ---- contrast warnings ----
    const warnBox = h('div', null,
      h('h3', null, 'Text contrast (WCAG AA, 4.5:1)'),
      warns.length
        ? h('p', { class: 'gb-warn' }, `${warns.length} text and ground pair${warns.length > 1 ? 's' : ''} under ${AA}:1.`)
        : h('p', { class: 'gb-ok' }, `Every text token pair checked is at least ${AA}:1 in all five looks.`),
      warns.length ? h('table', null, h('thead', null, h('tr', null, ['Look', 'Text', 'Ground', 'Ratio'].map((c) => h('th', null, c)))),
        h('tbody', null, warns.map((w) => h('tr', null, [h('td', null, LOOK_NAMES[w.look]), h('td', null, swatch(w.fgValue), ` --${w.fg} ${w.fgValue}`), h('td', null, swatch(w.bgValue), ` --${w.bg} ${w.bgValue}`), h('td', { class: 'gb-warn' }, `${w.ratio.toFixed(2)}:1`)])))) : null);

    // ---- token table ----
    const q = h('input', { type: 'search', placeholder: 'Filter tokens', 'aria-label': 'Filter tokens' });
    const onlyDiff = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Only tokens that differ between looks' });
    const onlyCol = h('input', { type: 'checkbox', 'aria-label': 'Only colours' });
    const tokBody = h('tbody'), tokNote = h('p', { class: 'gb-note' });
    let tokShown = matrix;
    function drawTokens() {
      const f = q.value.trim().toLowerCase();
      tokShown = matrix.filter((r) => (!onlyDiff.checked || r.differs) && (!onlyCol.checked || r.colour) && (!f || r.name.includes(f) || ids.some((i) => String(r.values[i] ?? '').toLowerCase().includes(f))));
      tokBody.replaceChildren(...tokShown.slice(0, CAP).map((r) => h('tr', null, h('td', null, `--${r.name}`), ids.map((i) => h('td', null, isColourText(r.values[i]) ? swatch(r.values[i]) : null, ' ', r.values[i] ?? '(none)')))));
      tokNote.textContent = `${tokShown.length} of ${matrix.length} tokens${tokShown.length > CAP ? `; the first ${CAP} are drawn, narrow the filter for the rest` : ''}.`;
    }
    for (const el of [q, onlyDiff, onlyCol]) el.addEventListener('input', drawTokens);
    const tokTable = h('table', null, h('thead', null, h('tr', null, h('th', null, 'Token'), ids.map((i) => h('th', null, LOOK_NAMES[i])))), tokBody);
    drawTokens();

    // ---- chart looks ----
    const chartHost = h('select', { 'aria-label': 'Chart host' }, h('option', { value: '' }, 'host: none'), Object.keys(HOSTS).map((k) => h('option', { value: k }, `host: ${k}`)));
    const chartGroup = h('select', { 'aria-label': 'Chart group' }, h('option', { value: '' }, 'every chart'), chartGroups().map((g) => h('option', { value: g }, g)));
    const chartQ = h('input', { type: 'search', placeholder: 'Filter chart looks', 'aria-label': 'Filter chart looks' });
    const chartDiff = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Only values that differ between looks' });
    const chartBody = h('tbody'), chartNote = h('p', { class: 'gb-note' });
    let chartShown = [];
    function drawCharts(remake) {
      if (remake || !charts) { try { charts = chartLookRows(ids, chartHost.value); } catch (err) { chartNote.textContent = `The chart looks would not resolve: ${err?.message || err}`; return; } }
      const f = chartQ.value.trim().toLowerCase(), g = chartGroup.value;
      chartShown = charts.filter((r) => (!chartDiff.checked || r.differs) && (!g || r.key.startsWith(`${g}.`)) && (!f || `${r.key} ${r.prop}`.toLowerCase().includes(f) || ids.some((i) => r.values[i].toLowerCase().includes(f))));
      chartBody.replaceChildren(...chartShown.slice(0, CAP).map((r) => h('tr', null, h('td', null, `${r.key} → ${r.prop}`), ids.map((i) => h('td', null, isColourText(r.values[i]) ? swatch(r.values[i]) : null, ' ', r.values[i])))));
      chartNote.textContent = `${chartShown.length} of ${charts.length} values${chartShown.length > CAP ? `; the first ${CAP} are drawn, narrow the filter for the rest` : ''}. Read with no state and no per-piece colour; a host adds its own rows and type size.`;
    }
    chartHost.addEventListener('change', () => drawCharts(true));
    for (const el of [chartGroup, chartQ, chartDiff]) el.addEventListener('input', () => drawCharts(false));
    const chartTable = h('table', null, h('thead', null, h('tr', null, h('th', null, 'Chart look → property'), ids.map((i) => h('th', null, LOOK_NAMES[i])))), chartBody);
    drawCharts(true);

    const copyAll = () => [
      `Looks table (${ids.map((i) => LOOK_NAMES[i]).join(', ')})`, '', warningsToText(warns), '',
      `Tokens (${tokShown.length} rows)`, matrixToText(tokShown, ids, (r) => `--${r.name}`), '',
      `Chart looks (${chartShown.length} rows${chartHost.value ? `, host ${chartHost.value}` : ''})`, matrixToText(chartShown, ids, (r) => `${r.key} -> ${r.prop}`),
    ].join('\n');

    host.append(wear, say, warnBox,
      h('h3', null, 'Colour tokens'), h('div', { class: 'gb-row' }, q, h('label', null, onlyDiff, ' only differing'), h('label', null, onlyCol, ' only colours')), tokNote, tokTable,
      h('h3', null, 'Chart looks'), h('div', { class: 'gb-row' }, chartHost, chartGroup, chartQ, h('label', null, chartDiff, ' only differing')), chartNote, chartTable,
      h('div', { class: 'gb-row' }, copyButton('Copy as text', copyAll, (m, t) => say.set(m, t), ctx)));
    return () => { charts = null; };   // (no timers and no listeners outside the host's own controls; the page removes the host)
  },
};

/** A swatch for a colour text, with its text as the hover title. The colour is set once, when the row is made. */
function swatch(value) {
  const s = h('span', { class: 'gb-sw', title: String(value), 'aria-hidden': 'true' });
  try { s.style.background = value; } catch { /* a colour the browser cannot read: an empty swatch */ }
  return s;
}
