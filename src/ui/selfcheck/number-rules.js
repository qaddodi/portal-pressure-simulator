// The number-agreement rule of the self-check (screen-report-recs.md, section 2): every number the screen shows for a model reading is the model's, formatted as the
// tile table prints it. One reading is written in several places (the tile, the card header's reading, a pill in the slide's words, a chart's mark, a figure's
// label), each by its own code; this rule puts them side by side, and against the fingerprint when one is at hand.
//
//   readShownNumbers(root, { charts, tileNames }) → [{ where, key, text, rate?, owner }]  from the page: tiles, header readings, the words' live-value pills and the
//                                    chart marks that say which reading they print (data-k on a text, data-v on a dot, chart-reader.js).
//   wantNumbers(shown, fp, fmt)    → the same with what the page's formatters give for the fingerprint (`want`)
//   numbersAgree(shown)            → findings: a number that is not the model's, or a place that disagrees with its tile
import { leadNumber } from './pressure-rules.js';
import { ownerOf } from './chart-roles.js';

const OWNER = { tile: 'src/ui/presenter-cards.js', header: 'src/ui/presenter-cards.js', words: 'src/ui/presenter-words.js' };
const collapse = (s) => String(s).replace(/[\s\u00a0]+/g, ' ').trim();
const sameText = (a, b) => collapse(a).replace(/[−–]/g, '-') === collapse(b).replace(/[−–]/g, '-');

/**
 * The model numbers on the screen. tileNames: key → the name a header reading writes for it ({ hvpg: 'HVPG' }), so a header reading is told by its name.
 * charts: a chart reading (chart-reader.js readCharts), for the marks that say which reading they print.
 */
export function readShownNumbers(root, { charts = null, tileNames = {} } = {}) {
  const out = [];
  for (const tiles of root.querySelectorAll('.pz-tiles[data-keys]')) {
    const ks = tiles.getAttribute('data-keys').split(',').filter(Boolean);
    [...tiles.querySelectorAll('.pz-tile')].forEach((tile, i) => {
      const v = tile.querySelector('.pzt-v');
      if (v && ks[i] && ks[i] !== 'scope') out.push({ where: 'tile', key: ks[i], text: collapse(v.textContent), rate: tile.getAttribute('data-rate'), owner: OWNER.tile });
    });
  }
  const byName = Object.fromEntries(Object.entries(tileNames).map(([k, n]) => [n, k]));
  for (const hi of root.querySelectorAll('.pz-hi')) {
    const name = collapse(hi.querySelector('.pz-hk')?.textContent || ''), k = byName[name], b = hi.querySelector('b');
    if (k && b) out.push({ where: 'header', key: k, text: collapse(b.textContent), rate: hi.getAttribute('data-rate'), owner: OWNER.header });
  }
  for (const p of root.querySelectorAll('.pz-val[data-k]')) out.push({ where: 'words', key: p.getAttribute('data-k'), text: collapse(p.textContent), rate: p.getAttribute('data-rate'), owner: OWNER.words });
  for (const c of charts?.charts || []) {
    for (const t of c.texts) if (t.k) out.push({ where: 'chart', key: t.k, text: t.text, chart: c.id, owner: ownerOf(t.look) });
    for (const d of c.dots) if (d.v) for (const pair of d.v.split(',')) { const [k, v] = pair.split(':'); if (k && v != null) out.push({ where: 'chart', key: k, text: v, chart: c.id, owner: ownerOf(d.look), placed: true }); }
  }
  return out;
}

/**
 * The same shown numbers with what the page's own formatters say each should read, for the fingerprint fp: `want`, a list of strings any of which is right.
 * fmt: { tile(k, fp) → the string the tile prints, word(k, fp) → the strings a live-value pill may print, value(k, fp) → the number a chart is placed from (the
 * tile's, back in the model's units) }, the page's own (presenter-cards tileVal, callout-math valueText, table-marks tileShown); injected so this file loads in node.
 */
export function wantNumbers(shown, fp, fmt) {
  return shown.map((s) => {
    if (!fp || fp[s.key] == null) return s;
    const want = s.where === 'words' ? fmt.word(s.key, fp) : s.where === 'chart' && s.placed ? [String(fmt.value(s.key, fp))] : [fmt.tile(s.key, fp)];
    return { ...s, want };
  });
}

const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.05;
/**
 * Shown numbers that are not the model's, from the records readShownNumbers (and wantNumbers) made. Two judgements, either of which finds a number:
 *  - with `want` (a fingerprint was at hand): the number is one of what the page's formatters give for the model's reading;
 *  - among themselves (no fingerprint needed): every place a reading is written reads what its tile reads (the header the same text, a words pill the same
 *    number or the whole one, a chart's mark the same number), so two places on one screen never disagree.
 */
export function numbersAgree(shown) {
  const out = [];
  const flag = (s, why) => out.push({ rule: 'number-agree', chart: s.chart || null, what: `${s.key.toUpperCase()} reads "${s.text}" in the ${s.where}`, where: s.where === 'chart' ? `chart ${s.chart}` : s.where, why, owner: s.owner });
  for (const s of shown) {
    if (!s.want) continue;
    const ok = s.where === 'words' ? s.want.some((x) => leadNumber(x) === leadNumber(s.text)) : s.placed ? Math.abs(parseFloat(s.text) - parseFloat(s.want[0])) < 1e-9 : s.where === 'chart' ? leadNumber(s.text) === leadNumber(s.want[0]) : sameText(s.text, s.want[0]);
    if (!ok) flag(s, `The model's ${s.key} is "${s.want.join('" or "')}" (as the tile table prints it)`);
  }
  const by = new Map();
  for (const s of shown) (by.get(s.key) || by.set(s.key, []).get(s.key)).push(s);
  for (const group of by.values()) {
    const ref = group.find((s) => s.where === 'tile') || group.find((s) => s.where === 'header');
    const n = ref ? leadNumber(ref.text) : null;
    if (!ref || n == null) continue;
    for (const s of group) {
      if (s === ref || s.want) continue;   // (one with a fingerprint's word was judged above)
      const m = leadNumber(s.text);
      const ok = s.where === 'header' ? sameText(s.text, ref.text) : s.where === 'words' ? m === n || m === Math.round(n) : near(m, n);
      if (!ok) flag(s, `The ${ref.where} reads "${ref.text}" for the same ${s.key}`);
    }
  }
  return out;
}
