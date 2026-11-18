// Words dump bench (card gallery, plan 2.8): every string the decks can show, per deck and slide, as one copyable text for a wording review
// (Baveno VIII only, American spelling, the lint's clinical-wording rules). The pure part is exported and runs in node (tests/gallery-bench-words-dump.test.js):
//   collectWords(decks)        -> [{ deck, deckTitle, slide, n, path, text, kind }]   one row per string, with its field path
//   formatDump(rows, { group }) -> one text ('slide' groups by deck then slide, 'deck' by deck, 'none' one line a row)
//   wordingFlags(rows)         -> the rows that break a rule, each with flags: [{ rule, match, fix }] (wording-rules.js)
// The page part (mount) is a search box, a deck picker, the flagged rows first, then the dump, capped at 400 rows on screen with "Show more";
// Copy always gives the whole filtered text. It draws only when a control changes: no timer, no frame, no layout read.
import { DECKS } from '../../decks.js';
import { checkWording } from '../wording-rules.js';
import { benchRoot, h, statusLine, copyButton, table } from './ui.js';

// Fields whose value is words wherever they stand in a slide (the last named key of the path). An id-like value (all lower case, no
// space: 'hf', 'start') is never words, so a key reused for an id in one place does not leak it in.
const TEXT_KEYS = new Set(['kicker', 'title', 'line', 'vignette', 'notes', 'caseQ', 'causesHead', 'caveat', 'cite', 'foot', 'note', 'dataTitle', 'milestone',
  'tick', 'when', 'sinceLabel', 'rowHead', 'question', 'short', 'label', 'name', 'lead', 'verdict', 'rule', 'text', 'who', 'unit', 'fromLabel',
  'deltaLabel', 'own', 'clear', 'abbr', 'cut', 't', 'axis', 'event', 'before', 'start', 'rise', 'head', 'summary']);
// Lists of strings that are words (a path with its indexes written []).
const TEXT_PATHS = [/^(?:ask|causes|chartFoot|note|objectives)\[\]$/, /^tool\.(?:rows|styles|key)\[\](?:\[\])?$/, /^whatIf\.ends\[\]$/, /^of\[\]\.note(?:\[\])?$/, /^tool\.words\.[a-z]+$/, /^lapse\.(?:from|to)$/];
// Never words, whatever they look like (an id list, an equation's markup, the zone rules' ids).
const NOT_TEXT = /(?:^|\.)(?:when\[\]|eq\[\])/;
const ID_LIKE = /^[a-z][a-z0-9:_.-]*$/;
const isWords = (s) => /\s/.test(s) && (s.match(/[A-Za-z]{2,}/g) || []).length >= 2;
// The order a slide's fields are shown in (a field not named goes after them, in the order the slide writes it; notes last).
const ORDER = ['kicker', 'title', 'line', 'vignette', 'eq', 'causesHead', 'causes', 'caveat', 'cite', 'caseQ', 'ask'];
const rankOf = (path) => { const k = path.split(/[.[]/)[0]; const i = ORDER.indexOf(k); return k === 'notes' ? 99 : i < 0 ? 50 : i; };

/** MathML to its words: the tags dropped, the spaces tidied. */
export const mathText = (ml) => String(ml).replace(/<[^>]*>/g, ' ').replace(/&minus;/g, '−').replace(/\s+/g, ' ').trim();

// Every string under v with its path (indexes kept) and the same path with [] for each index.
function* strings(v, path = '', norm = '') {
  if (typeof v === 'string') yield [path, norm, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${path}[${i}]`, `${norm}[]`);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) yield* strings(v[k], path ? `${path}.${k}` : k, norm ? `${norm}.${k}` : k);
}
const lastKey = (norm) => { const m = norm.match(/([A-Za-z_][\w]*)(?:\[\])*$/); return m ? m[1] : ''; };

/** What a slide's field is called for a reader: ask[0] is the question and ask[1] the answer. */
export const nicePath = (p) => p.replace(/^ask\[0\]$/, 'ask.question').replace(/^ask\[1\]$/, 'ask.answer');

/** The kind of a string at this path: 'text' (a field known to hold words), 'other' (not known, but it reads as words), or '' (not words). */
function kindOf(norm, text) {
  if (NOT_TEXT.test(norm)) return '';
  if (!text.trim()) return '';
  if (TEXT_PATHS.some((re) => re.test(norm))) return norm === 'notes' ? 'notes' : 'text';
  if (TEXT_KEYS.has(lastKey(norm)) && !ID_LIKE.test(text)) return norm === 'notes' ? 'notes' : 'text';
  return isWords(text) && !/^tool\.(?:kind|vessel|id)\b/.test(norm) ? 'other' : '';
}

/** The slide fields of one deck: [{ path, text, kind }] in reading order. */
function slideRows(s) {
  const out = [];
  // (A term pill's label is the key of terms: its target is not words.)
  if (s.terms && typeof s.terms === 'object' && !Array.isArray(s.terms)) for (const label of Object.keys(s.terms)) out.push({ path: `terms.${label}`, text: label, kind: 'text' });
  if (Array.isArray(s.eq)) s.eq.forEach((x, i) => { if (typeof x === 'string') out.push({ path: `eq[${i}]`, text: i === 0 ? mathText(x) : x, kind: 'text' }); });
  for (const [path, norm, text] of strings(s)) {
    if (/^eq\[\]$/.test(norm) || (/^terms\./.test(norm) && !Array.isArray(s.terms))) continue;
    const kind = kindOf(norm, text);
    if (kind) out.push({ path: nicePath(path), text, kind });
  }
  return out.map((r, i) => ({ r, i })).sort((a, b) => rankOf(a.r.path) - rankOf(b.r.path) || a.i - b.i).map((x) => x.r);
}

/** Every string the decks can show: one row per string. slide is the slide's id ('deck' for the deck's own words), n the slide's number in the
 *  presenter (the outline is 1, so the first slide of the deck is 2; 0 for the deck's own words), path the field inside the slide. */
export function collectWords(decks) {
  const rows = [];
  for (const d of decks || []) {
    if (!d) continue;
    const base = { deck: d.id, deckTitle: d.title || d.id };
    const add = (slide, n, path, text, kind = 'text') => { if (typeof text === 'string' && text.trim()) rows.push({ ...base, slide, n, path, text, kind }); };
    add('deck', 0, 'title', d.title); add('deck', 0, 'summary', d.summary); add('deck', 0, 'short', d.short); add('deck', 0, 'head', d.head);
    (d.objectives || []).forEach((o, i) => add('deck', 0, `objectives[${i}]`, o));
    (d.sections || []).forEach((sec, i) => add('deck', 0, `sections[${i}]`, Array.isArray(sec) ? sec[0] : sec));
    (d.checks || []).forEach((c, i) => { add('deck', 0, `checks[${i}].question`, c?.[0]); add('deck', 0, `checks[${i}].answer`, c?.[1]); });
    const shift = d.slides?.[0]?.visual === 'outline' ? 1 : 2;   // (the presenter puts an outline slide first, unless the deck has one)
    (d.slides || []).forEach((s, i) => {
      const id = s.id || `s${i + 1}`;
      for (const r of slideRows(s)) rows.push({ ...base, slide: id, n: i + shift, path: r.path, text: r.text, kind: r.kind });
    });
  }
  return rows;
}

const GROUPS = ['slide', 'deck', 'none'];
/** The rows as one text. group 'slide' (default): a heading for each deck and slide, then one "path: text" line a field; 'deck': a heading for
 *  each deck; 'none': one line a row, "deck / slide / path: text". Rows keep the order they come in. */
export function formatDump(rows, { group = 'slide' } = {}) {
  const g = GROUPS.includes(group) ? group : 'slide', out = [];
  let deck = null, slide = null;
  for (const r of rows || []) {
    if (g === 'none') { out.push(`${r.deck} / ${r.slide} / ${r.path}: ${r.text}`); continue; }
    if (r.deck !== deck) { deck = r.deck; slide = null; if (out.length) out.push(''); out.push(`== ${r.deckTitle} (${r.deck}) ==`); }
    if (g === 'slide' && r.slide !== slide) { slide = r.slide; out.push(r.slide === 'deck' ? '-- the deck --' : `-- slide ${r.n}: ${r.slide} --`); }
    out.push(g === 'slide' ? `${r.path}: ${r.text}` : `${r.slide} / ${r.path}: ${r.text}`);
  }
  return out.join('\n');
}

/** The rows that break a wording rule (wording-rules.js: the lint's rules, Baveno VIII only, a double space), each as a copy with flags. */
export function wordingFlags(rows) {
  const out = [];
  for (const r of rows || []) { const flags = checkWording(r.text); if (flags.length) out.push({ ...r, flags }); }
  return out;
}

/** The counts the page shows. */
export function countWords(rows, flagged) {
  return { decks: new Set(rows.map((r) => r.deck)).size, slides: new Set(rows.filter((r) => r.n > 0).map((r) => `${r.deck}/${r.slide}`)).size, strings: rows.length, flags: flagged.length };
}

/** The rows a search and a deck pick leave: a row matches when every word typed is in its deck, slide, path or text (case ignored). */
export function filterRows(rows, { query = '', deck = '', notes = true } = {}) {
  const q = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (deck && r.deck !== deck) return false;
    if (!notes && r.kind === 'notes') return false;
    if (!q.length) return true;
    const hay = `${r.deckTitle} ${r.deck} ${r.slide} ${r.path} ${r.text}`.toLowerCase();
    return q.every((w) => hay.includes(w));
  });
}

const CAP = 400;   // (rows on the screen at first, and each "Show more")

export default {
  id: 'words-dump',
  title: 'Words dump',
  mount(host, ctx) {
    benchRoot(host, 'Words dump', 'Every string the decks can show, for a wording review: Baveno VIII only, American spelling, and the lint\'s clinical-wording rules. A value in braces or brackets is a live number or a term pill, shown as written.');
    const say = statusLine();
    const all = collectWords(DECKS);
    const st = { query: '', deck: '', notes: true, group: 'slide', shown: CAP, flagShown: 100 };
    let rows = [], flagged = [], gone = false;

    const search = h('input', { type: 'search', placeholder: 'Search words, paths, decks', 'aria-label': 'Search the words', oninput: (e) => { st.query = e.target.value; st.shown = CAP; st.flagShown = 100; draw(); } });
    const deckSel = h('select', { 'aria-label': 'Deck', onchange: (e) => { st.deck = e.target.value; st.shown = CAP; st.flagShown = 100; draw(); } },
      h('option', { value: '' }, `All decks (${DECKS.length})`), DECKS.map((d) => h('option', { value: d.id }, d.title || d.id)));
    const notesBox = h('input', { type: 'checkbox', checked: true, onchange: (e) => { st.notes = e.target.checked; st.shown = CAP; draw(); } });
    const groupSel = h('select', { 'aria-label': 'Group the text by', onchange: (e) => { st.group = e.target.value; draw(); } },
      h('option', { value: 'slide' }, 'Group by slide'), h('option', { value: 'deck' }, 'Group by deck'), h('option', { value: 'none' }, 'One line each'));
    const counts = h('p', { class: 'gb-note', role: 'status' });
    const flagHead = h('h3', null, 'Flagged');
    const flagBox = h('div');
    const flagMore = h('button', { type: 'button', onclick: () => { st.flagShown += 200; draw(); } }, 'Show more flagged');
    const pre = h('pre', { tabindex: '0', 'aria-label': 'The words' });
    const more = h('button', { type: 'button', onclick: () => { st.shown += CAP; draw(); } }, 'Show more');
    const dumpHead = h('h3', null, 'The words');
    const copyAll = copyButton('Copy all (filtered)', () => formatDump(rows, { group: st.group }), (t, tone) => say.set(t === 'Copied.' ? `Copied ${rows.length} strings.` : t, tone), ctx);
    const copyFlags = copyButton('Copy the flags', () => flagged.map((r) => `${r.deck} / ${r.slide} / ${r.path}: ${r.flags.map((f) => `${f.rule} "${f.match}"`).join('; ')}\n  ${r.text}`).join('\n'), (t, tone) => say.set(t === 'Copied.' ? `Copied ${flagged.length} flagged strings.` : t, tone), ctx);

    function draw() {
      if (gone) return;
      rows = filterRows(all, st);
      flagged = wordingFlags(rows);
      const c = countWords(rows, flagged);
      counts.textContent = `${c.decks} deck${c.decks === 1 ? '' : 's'}, ${c.slides} slides, ${c.strings} strings, ${c.flags} flagged.`;
      flagHead.textContent = `Flagged (${flagged.length})`;
      flagBox.replaceChildren(flagged.length
        ? table(['Deck', 'Slide', 'Field', 'Rule', 'Words'], flagged.slice(0, st.flagShown).map((r) => [r.deckTitle, `${r.n || ''} ${r.slide}`.trim(), r.path, r.flags.map((f) => `${f.rule}: "${f.match}" (${f.fix})`).join('\n'), r.text]))
        : h('p', { class: 'gb-ok' }, 'No wording rule is broken in these strings.'));
      flagMore.hidden = flagged.length <= st.flagShown;
      const shown = rows.slice(0, st.shown);
      pre.textContent = formatDump(shown, { group: st.group }) || 'Nothing matches.';
      more.hidden = rows.length <= st.shown;
      dumpHead.textContent = `The words (${shown.length} of ${rows.length} shown; Copy gives all ${rows.length})`;
      copyFlags.disabled = !flagged.length;
      copyAll.disabled = !rows.length;
    }

    host.append(
      h('div', { class: 'gb-row' }, search, deckSel, groupSel, h('label', { class: 'gb-note' }, notesBox, ' Speaker notes')),
      counts, say, flagHead, h('div', { class: 'gb-row' }, copyFlags), flagBox, h('div', { class: 'gb-row' }, flagMore),
      dumpHead, h('div', { class: 'gb-row' }, copyAll, more), pre);
    draw();

    return () => { gone = true; };
  },
};
