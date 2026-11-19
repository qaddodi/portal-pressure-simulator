// The edge rules are in the one rule registry (DBG-1, bible review 19 Nov 2026): the owner's own Check, the Sweep, the Phone check and the bug packet run them,
// not only the headless sweeps. The judge is gallery/edge-rules.js's own; this checks the registry runs it, once per kind, and a report carries only the evidence.
import './screen-dom.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeEdges, compactEdges, edgeProblems, EDGE_KINDS, EDGE_WORDS } from '../src/ui/gallery/edge-rules.js';
import { reportText, KINDS } from '../src/ui/gallery/fit-rules.js';
import '../src/ui/selfcheck/plugins.js';
import { runRules, ruleList, ruleFamilies, ruleIds } from '../src/ui/selfcheck/rules.js';

const card = (q, over = {}) => ({ q, behind: false, box: [24, 54, 336, 366], vis: [24, 54, 336, 366], leaves: [], ...over });
const leaf = (t, b, over = {}) => ({ t, b, n: 'p.line', ...over });
const read = (cards, over = {}) => ({ vw: 844, vh: 390, shuf: true, front: 'words', cards, ...over });
const report = (edges) => ({ v: 1, cards: { layout: true, fit: {}, structure: null, cards: [], edges } });

const BAD = read([
  card('.pz-text', { shade: [24, 54, 336, 300], leaves: [leaf('The free hepatic vein pressure', [24, 178, 336, 394]), leaf('low words', [30, 280, 300, 340]), leaf('half line', [30, 100, 300, 130], { clipBy: [30, 90, 300, 120, 'div.fold'] })] }),
  card('.pz-data', { behind: true, vis: [24, 10, 336, 40], leaves: [leaf('t', [24, 30, 300, 63], { lines: [[30, 63]] })] }),
]);

test('every edge kind is a registered rule of the family "edge", with an owner and the owner\'s words', () => {
  assert.ok(ruleFamilies().includes('edge') && ruleFamilies().includes('fit'));
  for (const k of EDGE_KINDS) { const r = ruleList().find((x) => x.id === k); assert.ok(r, k); assert.equal(r.family, 'edge'); assert.ok(r.owner.startsWith('src/ui/') && r.why.length > 20, k); assert.ok(EDGE_WORDS[k], k); }
  assert.deepEqual(ruleIds().filter((id) => id.startsWith('edge-')), EDGE_KINDS);
});

test('the registry names what the judge names: cutoff, off, cutby, stray and nobacking, each once, from report.cards.edges', () => {
  const found = runRules(report(BAD), { families: 'edge' });
  assert.deepEqual([...new Set(found.map((f) => f.rule))].sort(), [...EDGE_KINDS].sort());
  assert.equal(found.length, judgeEdges(BAD).length);
  assert.ok(found.every((f) => f.owner && f.why && f.what && f.where));
  assert.deepEqual(runRules(report(read([card('.pz-text', { leaves: [leaf('fine', [30, 60, 300, 360])] })])), { families: 'edge' }), [], 'a clean slide is quiet');
  assert.deepEqual(runRules({ cards: { layout: false } }, { families: ['edge'] }), [], 'a page with no layout has no edges to judge');
  assert.deepEqual(runRules(report(null), { families: ['edge'] }), []);
});

test('a family is a selection: fit rules and edge rules are told apart, and a runner asks for either', () => {
  const rep = report(BAD);
  assert.equal(runRules(rep, { families: ['fit'] }).filter((f) => f.rule.startsWith('edge-')).length, 0);
  assert.ok(runRules(rep).some((f) => f.rule === 'edge-cutoff'), 'with no selection every family runs, the Phone check and the packet among them');
});

test('a report holds only the evidence: compactEdges keeps exactly the leaves the judge names, and the findings stay the same', () => {
  const small = compactEdges(BAD);
  assert.deepEqual(judgeEdges(small), judgeEdges(BAD));
  const clean = read([card('.pz-text', { leaves: [leaf('a', [30, 60, 300, 90]), leaf('b', [30, 100, 300, 130]), leaf('c', [30, 140, 300, 170])] })]);
  assert.equal(compactEdges(clean).cards.length, 0);
  // seeded random cards: the same findings before and after
  let s = 11; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let n = 0; n < 60; n++) {
    const leaves = Array.from({ length: 6 }, (_, k) => { const t = rnd() * 420 - 20, l = rnd() * 400; return leaf(`w${k}`, [l, t, l + 20 + rnd() * 400, t + 14 + rnd() * 30], rnd() < 0.15 ? { clipBy: [0, t - 5, 700, t + 8, 'div.x'] } : {}); });
    const r = read([card('.pz-text', { shade: [24, 54, 336, 300], leaves }), card('.pz-data', { behind: true, vis: [24, 10, 336, 40], leaves: leaves.map((l) => ({ ...l, lines: [[l.b[1], l.b[3]]] })) })]);
    assert.deepEqual(judgeEdges(compactEdges(r)), judgeEdges(r));
  }
});

test('the Check\'s list names edge problems in words and under their own heading', () => {
  const problems = edgeProblems(BAD);
  assert.ok(problems.length >= 4 && problems.every((p) => /^edge-/.test(p.kind) && p.where === 'edges'));
  const text = reportText(problems);
  for (const k of new Set(problems.map((p) => p.kind))) assert.ok(text.includes(`${k} (${EDGE_WORDS[k]})`), k);
  assert.ok(!KINDS.some((k) => k.startsWith('edge-')), 'the fit kinds stay the fit judge\'s; the edge kinds are their own list');
});

// ── runners select rules by family; they do not import a judge (the way tests/no-raw-raf.test.js guards requestAnimationFrame) ──
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const walkJs = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : walkJs(p)) : /\.(m?js)$/.test(n) ? [p] : []; });
test('no runner imports a card judge: judgeCards, judgeStructureCard, judgeEdges and edgeProblems are called only by selfcheck/ and their own files (the allowance only shrinks)', () => {
  const root = new URL('../', import.meta.url).pathname;
  const JUDGES = /\b(judgeCards|judgeStructureCard|judgeEdges|edgeProblems|judgeZoom)\b/;
  // scripts/card-fit.mjs is the owner's call (his 18 Nov Actions ban, step 11 of the migration); phone-card-fit.mjs is gone (step 10: its structure cards are gallery specimens).
  const allowed = [/src\/ui\/selfcheck\//, /src\/ui\/gallery\/(fit|edge)-rules\.js$/, /scripts\/card-fit\.mjs$/];
  const bad = [];
  for (const f of [...walkJs(join(root, 'src')), ...walkJs(join(root, 'scripts'))]) {
    const rel = f.slice(root.length);
    if (allowed.some((a) => a.test(rel))) continue;
    if (JUDGES.test(readFileSync(f, 'utf8'))) bad.push(rel);
  }
  assert.deepEqual(bad, [], `these call a judge themselves; ask the registry for a family instead: ${bad.join(', ')}`);
});
