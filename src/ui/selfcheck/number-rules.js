// The number-agreement rule of the self-check (screen-report-recs.md, section 2): every number the screen shows for a model reading is the model's, formatted as the
// tile table prints it. One reading is written in several places (the tile, the card header's reading, a pill in the slide's words, a chart's mark, a figure's
// label), each by its own code; this rule puts them side by side against ONE fingerprint.
//
//   readShownNumbers(root, charts) → [{ where, key, text, rate?, owner }]  from the page: tiles, header readings, the words' live-value pills and the chart marks that
//                                    say which reading they print (data-k on a text, data-v on a dot, chart-reader.js).
//   numbersAgree(shown, fp, fmt)   → findings, for the fingerprint fp and the formatters fmt the page owns (presenter-cards tileVal, callout-math valueText,
//                                    table-marks tileShown); injected so this file loads in node with no page.
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
 * Shown numbers that are not the model's.
 * fp: the fingerprint. fmt: { tile(k, fp) → the string the tile prints, word(k, fp) → the strings a live-value pill may print, value(k, fp) → the number a chart is
 * placed from (the tile's, back in the model's units) }.
 */
export function numbersAgree(shown, fp, fmt) {
  const out = [];
  for (const s of shown) {
    if (!fp || fp[s.key] == null) continue;
    let ok, want;
    if (s.where === 'tile' || s.where === 'header') { want = fmt.tile(s.key, fp); ok = sameText(s.text, want); }
    else if (s.where === 'words') { const w = fmt.word(s.key, fp); want = w.join(' or '); ok = w.some((x) => leadNumber(x) === leadNumber(s.text)); }
    else if (s.where === 'chart' && s.placed) { want = String(fmt.value(s.key, fp)); ok = Math.abs(parseFloat(s.text) - fmt.value(s.key, fp)) < 1e-9; }
    else if (s.where === 'chart') { want = fmt.tile(s.key, fp); ok = leadNumber(s.text) === leadNumber(want); }
    else continue;
    if (!ok) {
      out.push({ rule: 'number-agree', chart: s.chart || null, what: `${s.key.toUpperCase()} reads "${s.text}" in the ${s.where}`, where: s.where === 'chart' ? `chart ${s.chart}` : s.where,
        why: `The model's ${s.key} is "${want}" (as the tile table prints it)`, owner: s.owner });
    }
  }
  return out;
}
