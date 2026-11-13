// The guideline path card's other kinds (7 Nov 2026): the score card (PSVD or NCPF), the checklist (recompensation), the grid (portal vein clot
// and anticoagulation) and the ladder (the stages of cirrhosis). Their data, the verdicts at every boundary, the layouts at the Mac and the
// phone widths (inside the card, one size for every patient), the words rules and the looks. Numbers are those of guidelines/.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALGOS, PATHS, WORST, OUTCOMES, litOf, outcomeOf, readingFor, chipsOf, patientFor, mapWordsOf, isTree } from '../src/ui/path-data.js';
import { CARD_HELPERS, ROLE, shownOf } from '../src/ui/tool-path.js';
import { drawCard, gridGroups, layout, model, patientsOf, scoreState, zoneText, cardCompact, CARD_WIDE_MIN, isCardKind } from '../src/ui/path-cards.js';
import { loadMetrics, textCovers } from '../src/ui/text-gl.js';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';
import psvdscore from '../src/ui/path-algos/psvdscore.js';
import recomp from '../src/ui/path-algos/recomp.js';
import pvtgrid from '../src/ui/path-algos/pvtgrid.js';
import ladder from '../src/ui/path-algos/ladder.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const CARDS = [psvdscore, recomp, pvtgrid, ladder];
const TONES = ['n', 'ok', 'warn', 'bad', 'acc'];
const WIDTHS = [['Mac', 528, false], ['phone', 340, true], ['small phone', 300, true], ['iPad upright', 700, true]];
await loadMetrics();
const H = CARD_HELPERS;
const FAKE = { ...H, svg: (tag, attrs = {}, ...kids) => ({ tag, attrs, kids }) };   // (svgModel needs a page: a plain record stands in)

/** Every string a card draws, from its data (rows, zones, cells, steps, readings, chips). */
function wordsOf(a) {
  const out = [a.label, a.source, a.cite];
  if (a.kind === 'score') { for (const r of a.rows) out.push(r.n, r.d || '', ...r.o.map((o) => o[0])); for (const z of a.zones) out.push(zoneText(z, a.allOf)); }
  if (a.kind === 'grid') { for (const r of a.rowsH) out.push(r[1], r[2]); for (const c of a.colsH) out.push(c[1]); for (const c of Object.values(a.cells)) out.push(c[0], c[1]); }
  if (a.kind === 'ladder') { for (const s of a.steps) out.push(s[0], s[1], s[2]); out.push(a.back, 'Patient is here', 'Reversible.', 'Recompensated.'); }
  for (const p of patientsOf(a)) {
    for (const k of a.outcomes) { const r = a.reading(k, a.patientFor({ patient: p })); if (a.lit(p).has(`${k}`) || a.outcomeOf(a.lit(p)) === k) out.push(r.head, r.next); }
    out.push(...a.chips(p));
    if (a.kind === 'score') out.push(a.verdict(scoreState(a, p).t, p, a.rows).head, a.verdict(scoreState(a, p).t, p, a.rows).next);
  }
  return out.filter(Boolean);
}

test('the four modules carry the contract\'s common fields and their kind\'s own, and the registry knows them', () => {
  assert.deepEqual(CARDS.map((a) => a.id), ['psvdscore', 'recomp', 'pvtgrid', 'ladder']);
  assert.deepEqual(CARDS.map((a) => a.kind), ['score', 'score', 'grid', 'ladder']);
  for (const a of CARDS) {
    assert.ok(a.label && a.notes, a.id);
    assert.equal(a.source, 'Baveno VIII');
    assert.match(a.cite, /^Fig\. \d$/, 'the foot says only the figure');
    for (const f of ['lit', 'outcomeOf', 'reading', 'chips', 'patientFor']) assert.equal(typeof a[f], 'function', `${a.id}.${f}`);
    assert.equal(ALGOS[a.id], a);
    assert.equal(PATHS[a.id].algo, a);
    assert.equal(PATHS[a.id].kind, a.kind);
    assert.equal(PATHS[a.id].tree, undefined, `${a.id} is not a tree`);
    assert.ok(PATHS[a.id].short && PATHS[a.id].short !== PATHS[a.id].label, `${a.id} has a short name`);
    assert.equal(isTree(a.id), false);
    assert.ok(isCardKind(a.kind));
    assert.equal(WORST[a.id], a.worst);
    assert.deepEqual(OUTCOMES[a.id], a.outcomes);
    assert.equal(mapWordsOf(a.id, 'x'), null);
  }
  assert.equal(isTree('bleed'), true);
  assert.equal(psvdscore.rows.length, 4);
  assert.equal(recomp.allOf, true);
  assert.equal(recomp.rows.length, 3);
  assert.equal(pvtgrid.rowsH.length * pvtgrid.colsH.length, Object.keys(pvtgrid.cells).length, 'one cell for each pair of answers');
  assert.equal(ladder.steps.length, 4);
});

test('the patient\'s shape is the mock\'s, the defaults are the mock\'s, a slide\'s patient is read as the index of an option', () => {
  assert.deepEqual(patientFor({ of: 'psvdscore' }), { sg: 1, hi: 1, ac: 1, cc: 1 });
  assert.deepEqual(patientFor({ of: 'recomp' }), { ca: 0, ev: 0, lf: 1 });
  assert.deepEqual(patientFor({ of: 'pvtgrid' }), { r: 'yes', c: 'abs' });
  assert.deepEqual(patientFor({ of: 'ladder' }), { s: 1, rc: false });
  assert.deepEqual(patientFor({ of: 'psvdscore', patient: { sg: 0, hi: 2 } }), { sg: 0, hi: 2, ac: 1, cc: 1 });
  assert.deepEqual(patientFor({ of: 'psvdscore', patient: { sg: 7, hi: -1, ac: 'x', cc: 1 } }), { sg: 1, hi: 1, ac: 1, cc: 1 }, 'an index out of range is the default');
  assert.deepEqual(patientFor({ of: 'recomp', patient: { ca: 1, ev: 1, lf: 0 } }), { ca: 1, ev: 1, lf: 0 });
  assert.deepEqual(patientFor({ of: 'pvtgrid', patient: { r: 'no', c: 'maj' } }), { r: 'no', c: 'maj' });
  assert.deepEqual(patientFor({ of: 'pvtgrid', patient: { r: 'maybe', c: 'min' } }), { r: 'yes', c: 'min' });
  assert.deepEqual(patientFor({ of: 'ladder', patient: { s: 3, rc: true } }), { s: 3, rc: true });
  assert.deepEqual(patientFor({ of: 'ladder', patient: { s: 9 } }), { s: 1, rc: false });
  // the live model's readings are not these cards' patient: the case's answers are
  assert.deepEqual(patientFor({ of: 'ladder', patient: { s: 2 } }, { lsm: 30, plt: 90, ssm: 70, hvpg: 16 }, shownOf), { s: 2, rc: false });
  // the patient's shape is exactly the keys of the mock
  assert.deepEqual(Object.keys(patientFor({ of: 'psvdscore' })).sort(), ['ac', 'cc', 'hi', 'sg']);
  assert.deepEqual(Object.keys(patientFor({ of: 'recomp' })).sort(), ['ca', 'ev', 'lf']);
  // the mock's presets are in the data
  assert.deepEqual(psvdscore.presets.map((x) => x[0]), ['Ascites and a minor lesion', 'Varices and a major lesion', 'Splenomegaly only']);
  assert.deepEqual(recomp.presets.map((x) => x[0]), ['All three met', 'Events not yet 6 months', 'Etiology still active']);
  assert.deepEqual(pvtgrid.presets.map((x) => x[0]), ['Provoked, nothing permanent', 'Unprovoked', 'Major permanent factor']);
  assert.deepEqual(ladder.presets.map((x) => x[0]), ['Compensated, CSPH', 'First ascites', 'Further events', 'Recompensated']);
});

test('psvdscore: Baveno VIII 8.44 totals 0-2 no PSVD or NCPF, 3-4 possible, 5 or more definite, with every boundary and the mock\'s presets', () => {
  const at = (p) => { const q = patientFor({ of: 'psvdscore', patient: p }), { t, v } = scoreState(psvdscore, q); return { t, z: v.z, head: v.head, key: outcomeOf('psvdscore', litOf('psvdscore', q)) }; };
  // (indexes: sg 0 Specific +3, 1 Non-specific +2, 2 None 0; hi 0 Major +5, 1 Minor +2, 2 Normal 0; ac 0 Present +1, 1 Absent 0; cc 0 Present -1, 1 Absent 0)
  const NONE = { sg: 2, hi: 2, ac: 1, cc: 1 };
  assert.deepEqual(at(NONE), { t: 0, z: 0, head: 'Not PSVD or NCPF', key: 'z0' });
  assert.equal(at({ ...NONE, cc: 0 }).t, -1, 'a concomitant cause of cirrhosis takes a point off');
  assert.equal(at({ ...NONE, cc: 0 }).z, 0, 'below 0 is still the first band');
  assert.equal(at({ ...NONE, ac: 0 }).t, 1);
  assert.equal(at({ ...NONE, sg: 1 }).t, 2);
  assert.equal(at({ ...NONE, sg: 1 }).z, 0, '2 is the top of 0-2');
  assert.deepEqual(at({ ...NONE, sg: 0 }), { t: 3, z: 1, head: 'Possible PSVD or NCPF', key: 'z1' });   // 3 is the foot of 3-4
  assert.equal(at({ ...NONE, sg: 1, ac: 0 }).t, 3);
  assert.equal(at({ ...NONE, sg: 0, ac: 0 }).z, 1, '4 is the top of 3-4');
  assert.equal(at({ ...NONE, sg: 0, ac: 0 }).t, 4);
  assert.deepEqual(at({ ...NONE, hi: 0 }), { t: 5, z: 2, head: 'Definite PSVD or NCPF', key: 'z2' });   // 5 is the foot of 5+
  assert.equal(at({ sg: 0, hi: 0, ac: 0, cc: 1 }).t, 9, 'the most a patient can score');
  assert.equal(at({ sg: 0, hi: 0, ac: 0, cc: 1 }).z, 2);
  assert.equal(at({ sg: 1, hi: 0, ac: 1, cc: 0 }).t, 6, 'two and five and nothing, less one');
  // the presets: 4 (possible), 8 (definite), 2 + 2 + 1 - 1 = ... splenomegaly only
  const P = Object.fromEntries(psvdscore.presets);
  assert.deepEqual([at(P['Ascites and a minor lesion']).t, at(P['Ascites and a minor lesion']).z], [4, 1]);
  assert.deepEqual([at(P['Varices and a major lesion']).t, at(P['Varices and a major lesion']).z], [8, 2]);
  assert.deepEqual([at(P['Splenomegaly only']).t, at(P['Splenomegaly only']).z], [2, 0]);
  // (the zones' own limits are the verdict's)
  for (const z of psvdscore.zones) assert.ok(z[0] <= z[1]);
  for (const p of patientsOf(psvdscore)) { const { t, v } = scoreState(psvdscore, p), z = psvdscore.zones[v.z]; assert.ok(t >= z[0] && t <= z[1] || t < 0, `${JSON.stringify(p)}: ${t} in zone ${v.z}`); assert.equal(v.tone, z[3]); }
  const r = readingFor('psvdscore', 'z1', psvdscore.defaults);
  assert.match(r.next, /Further investigation \(biopsy, elastography\), referral to an expert vascular liver center, and follow-up for new signs\./);
  assert.equal(readingFor('psvdscore', 'z2', P['Varices and a major lesion']).next, '', 'definite has no next step in the mock');
  assert.match(readingFor('psvdscore', 'z2', P['Varices and a major lesion']).why, /^Score 8\./);
  assert.deepEqual(chipsOf('psvdscore', psvdscore.defaults), [], 'the verdict row carries the score: no chips');
  assert.equal(zoneText(psvdscore.zones[0], false), 'No PSVD or NCPF · 0–2');
  assert.equal(zoneText(psvdscore.zones[1], false), 'Possible · 3–4');
  assert.equal(zoneText(psvdscore.zones[2], false), 'Definite · ≥5');
});

test('recomp: all three criteria together (7.4); one missing is not recompensated, and the list says which', () => {
  const at = (p) => { const q = patientFor({ of: 'recomp', patient: p }), { t, v } = scoreState(recomp, q); return { t, v, key: outcomeOf('recomp', litOf('recomp', q)) }; };
  const a = at({ ca: 0, ev: 0, lf: 0 });
  assert.deepEqual([a.t, a.v.head, a.v.tone, a.v.z, a.key], [3, 'Recompensated', 'ok', 1, 'z1']);
  assert.match(a.v.next, /CSPH may also resolve with time/);
  const b = at({ ca: 0, ev: 1, lf: 0 });
  assert.deepEqual([b.t, b.v.head, b.v.tone, b.v.z, b.key], [2, 'Not recompensated yet', 'warn', 0, 'z0']);
  assert.equal(b.v.next, 'All three are needed. Missing: no events for >6 consecutive months.');
  const c = at({ ca: 1, ev: 1, lf: 1 });
  assert.deepEqual([c.t, c.v.z], [0, 0]);
  assert.equal(c.v.next, 'All three are needed. Missing: the etiology is removed, controlled or suppressed; no events for >6 consecutive months; liver function has improved.');
  assert.equal(at({ ca: 1, ev: 0, lf: 0 }).t, 2, 'each criterion is one point');
  for (const p of patientsOf(recomp)) assert.equal(scoreState(recomp, p).v.z === 1, p.ca === 0 && p.ev === 0 && p.lf === 0, JSON.stringify(p));
  assert.equal(patientsOf(recomp).length, 8);
  assert.deepEqual(chipsOf('recomp', recomp.defaults), []);
  assert.match(readingFor('recomp', 'z0', { ca: 0, ev: 0, lf: 1 }).why, /^2 of 3 met\./);
  const P = Object.fromEntries(recomp.presets);
  assert.deepEqual(Object.values(P).map((p) => at(p).v.head), ['Recompensated', 'Not recompensated yet', 'Not recompensated yet']);
  assert.deepEqual(zoneText(recomp.zones[0], true), 'Not yet');
});

test('pvtgrid: the six cells of Baveno VIII Fig. 5 and 9.10, the lit one and the row and column it stands in', () => {
  const want = { 'yes|abs': ['Consider stopping', 'acc'], 'yes|min': ['Lower-dose DOAC', 'warn'], 'yes|maj': ['Full dose, long-term', 'bad'], 'no|abs': ['Lower-dose DOAC', 'warn'], 'no|min': ['Lower-dose DOAC', 'warn'], 'no|maj': ['Full dose, long-term', 'bad'] };
  assert.equal(patientsOf(pvtgrid).length, 6);
  for (const [k, [head, tone]] of Object.entries(want)) {
    const [r, c] = k.split('|'), L = litOf('pvtgrid', { r, c });
    assert.equal(outcomeOf('pvtgrid', L), k);
    assert.deepEqual([...L].sort(), ['cell:' + k, `c:${c}`, `r:${r}`, 'root'].sort());
    const rd = readingFor('pvtgrid', k, { r, c });
    assert.deepEqual([rd.head, rd.tone], [head, tone], k);
    assert.ok(rd.why && rd.stmt === '9.10');
  }
  assert.equal(readingFor('pvtgrid', 'yes|abs', { r: 'yes', c: 'abs' }).next, 'If the factor has resolved.');
  assert.equal(readingFor('pvtgrid', 'yes|maj', { r: 'yes', c: 'maj' }).next, '', 'full dose has no second line');
  assert.equal(readingFor('pvtgrid', 'yes|maj', { r: 'yes', c: 'maj' }).why, 'A permanent major risk factor is present.');
  assert.equal(readingFor('pvtgrid', 'yes|abs', { r: 'yes', c: 'abs' }).why, 'The risk factor was reversible and nothing permanent is present.');
  assert.equal(readingFor('pvtgrid', 'no|min', { r: 'no', c: 'min' }).why, 'No permanent major risk factor.');
  assert.deepEqual(chipsOf('pvtgrid', { r: 'no', c: 'maj' }), ['No reversible factor', 'Permanent, major']);
  assert.deepEqual(chipsOf('pvtgrid', { r: 'yes', c: 'abs' }), ['Reversible factor', 'No permanent factor']);
  assert.deepEqual(OUTCOMES.pvtgrid.slice().sort(), Object.keys(want).sort());
  const P = Object.fromEntries(pvtgrid.presets);
  assert.equal(outcomeOf('pvtgrid', litOf('pvtgrid', P['Unprovoked'])), 'no|min');
  assert.equal(outcomeOf('pvtgrid', litOf('pvtgrid', P['Major permanent factor'])), 'no|maj');
});

test('ladder: each stage lights its step and says what it means; the way back is drawn from the first decompensation on', () => {
  for (let s = 0; s < 4; s++) {
    const L = litOf('ladder', { s, rc: false });
    assert.equal(outcomeOf('ladder', L), `s${s}`);
    assert.ok(!L.has('back'));
    const r = readingFor('ladder', `s${s}`, { s, rc: false });
    assert.deepEqual([r.head, r.tone], [ladder.steps[s][0], ladder.steps[s][3]]);
    assert.deepEqual(chipsOf('ladder', { s, rc: false }), [ladder.steps[s][0]]);
  }
  assert.deepEqual(ladder.steps.map((x) => x[0]), ['cACLD', 'cACLD with CSPH', 'First decompensation', 'Further decompensation']);
  assert.deepEqual(ladder.steps.map((x) => x[3]), ['n', 'warn', 'bad', 'bad']);
  assert.ok(litOf('ladder', { s: 2, rc: true }).has('back'));
  assert.ok(litOf('ladder', { s: 3, rc: true }).has('back'));
  assert.ok(!litOf('ladder', { s: 1, rc: true }).has('back'), 'a compensated patient has nothing to come back to');
  assert.deepEqual(chipsOf('ladder', { s: 2, rc: true }), ['First decompensation', 'Recompensated since']);
  assert.deepEqual(chipsOf('ladder', { s: 1, rc: true }), ['cACLD with CSPH']);
  assert.equal(patientsOf(ladder).length, 8);
  const P = Object.fromEntries(ladder.presets);
  assert.deepEqual(Object.values(P).map((p) => outcomeOf('ladder', litOf('ladder', p))), ['s1', 's2', 's3', 's2']);
  assert.match(readingFor('ladder', 's2', P['Recompensated']).next, /Recompensated since\.$/);
});

test('the layout fits the card at the Mac and the phone widths: every word and shape inside, none off the edge', () => {
  for (const a of CARDS) for (const [name, W, phone] of WIDTHS) {
    const compact = cardCompact(W, phone);
    for (const p of patientsOf(a)) {
      const { h, ops } = drawCard(a, W, compact, p, H);
      assert.ok(h > 40, `${a.id} ${name}: a body`);
      for (const o of ops) {
        if (o.k === 't') {
          const w = H.textWidth(o.text, { weight: ROLE[o.face].weight, size: ROLE[o.face].size });
          assert.ok(o.x >= -0.5 && o.x + w <= W + 0.5, `${a.id} ${name} ${JSON.stringify(p)}: "${o.text}" x ${o.x.toFixed(1)}..${(o.x + w).toFixed(1)} of ${W}`);
          assert.ok(o.y > 0 && o.y <= h + 0.5, `${a.id} ${name}: "${o.text}" baseline ${o.y} in the body ${h}`);
        } else if (o.k === 'r') {
          assert.ok(o.x >= -0.01 && o.x + o.w <= W + 0.01 && o.y >= -0.01 && o.y + o.h <= h + 0.5, `${a.id} ${name}: a box inside (${o.look} ${o.x},${o.y},${o.w},${o.h})`);
        } else if (o.k === 'd') {
          assert.ok(o.pts.every(([x, y]) => x >= -0.01 && x <= W + 0.01 && y >= -0.01 && y <= h + 0.5), `${a.id} ${name}: a shape inside (${o.look})`);
        } else {
          assert.ok(o.x1 >= -0.01 && o.x2 <= W + 0.01 && o.y1 >= -0.01 && o.y2 <= h + 0.5, `${a.id} ${name}: a line inside (${o.look})`);
        }
      }
    }
  }
  assert.equal(cardCompact(528, false), false);
  assert.equal(cardCompact(340, false), true, 'a card narrower than the wide layout needs');
  assert.equal(cardCompact(700, true), true, 'an iPad held upright is the small layout');
  assert.ok(CARD_WIDE_MIN > 340 && CARD_WIDE_MIN <= 528);
});

test('no two words of a card overlap: the lines of one body stay apart, and a pill holds its words', () => {
  for (const a of CARDS) for (const [name, W, phone] of WIDTHS.slice(0, 2)) {
    const compact = cardCompact(W, phone);
    for (const p of patientsOf(a)) {
      const { ops } = drawCard(a, W, compact, p, H), ts = ops.filter((o) => o.k === 't');
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
        const A = ts[i], B = ts[j];
        if (Math.abs(A.y - B.y) > 1.5) continue;   // (another line)
        const aw = H.textWidth(A.text, { weight: ROLE[A.face].weight, size: ROLE[A.face].size }), bw = H.textWidth(B.text, { weight: ROLE[B.face].weight, size: ROLE[B.face].size });
        const [l, r] = A.x <= B.x ? [[A, aw], [B, bw]] : [[B, bw], [A, aw]];
        assert.ok(l[0].x + l[1] <= r[0].x + 0.5, `${a.id} ${name}: "${l[0].text}" and "${r[0].text}" on one line`);
      }
      for (const o of ops.filter((x) => x.k === 'r' && x.look === 'path.opt')) {
        const inside = ts.filter((t) => t.y > o.y && t.y < o.y + o.h && t.x >= o.x - 0.5 && t.x < o.x + o.w);
        assert.ok(inside.length >= 1, `${a.id} ${name}: a pill with its words`);
        for (const t of inside) assert.ok(t.x + H.textWidth(t.text, { weight: ROLE[t.face].weight, size: ROLE[t.face].size }) <= o.x + o.w + 0.5, `${a.id} ${name}: "${t.text}" in its pill`);
      }
    }
  }
});

test('one size for every patient: the reserved height holds the tallest body at each width, and the layout never changes with the case', () => {
  for (const a of CARDS) for (const [name, W, phone] of WIDTHS) {
    const compact = cardCompact(W, phone), L = layout(a, W, compact, a.worst, H), L2 = layout(a, W, compact, null, H), L3 = layout(a, W, compact, patientFor({ of: a.id }), H);
    assert.equal(L.H, L2.H, `${a.id} ${name}: the worst patient is no taller than the tallest`);
    assert.equal(L.H, L3.H, `${a.id} ${name}: nor the default`);
    let tallest = 0;
    for (const p of patientsOf(a)) { const { h } = drawCard(a, W, compact, p, H); assert.ok(h <= L.H, `${a.id} ${name} ${JSON.stringify(p)}: ${h} within ${L.H}`); tallest = Math.max(tallest, h); }
    assert.equal(L.H, Math.ceil(tallest));
    assert.equal(L.compact, compact);
    assert.equal(L.W, W);
  }
  // (and the worst patient sits among the tallest, as the contract says: it is what the card reserves its chips for)
  for (const a of CARDS) for (const [, W, phone] of WIDTHS) {
    const compact = cardCompact(W, phone), tallest = layout(a, W, compact, null, H).H;
    if (a.kind !== 'ladder') assert.ok(Math.ceil(drawCard(a, W, compact, a.worst, H).h) >= tallest - 40, `${a.id}: the worst patient is near the tallest`);
  }
  // the small layout is taller than the wide one (a stack), never wider
  for (const a of CARDS) assert.ok(layout(a, 340, true, null, H).H >= layout(a, 528, false, null, H).H * 0.6, a.id);
});

test('pvtgrid: one shape for each answer (three, not six), every word centred in its frame and inside it, at every width', () => {
  const G = gridGroups(pvtgrid);
  assert.deepEqual(G.map((g) => [g.ce[0], g.cells.length]).sort(), [['Consider stopping', 1], ['Full dose, long-term', 2], ['Lower-dose DOAC', 3]]);
  assert.deepEqual(G.find((g) => g.ce[0] === 'Lower-dose DOAC').box, [1, 1, 0, 1], 'the lower-dose words sit in the L\'s wide foot');
  assert.deepEqual(G.find((g) => g.ce[0] === 'Full dose, long-term').box, [0, 1, 2, 2], 'full dose over both rows');
  for (const [name, W, phone] of WIDTHS) {
    const compact = cardCompact(W, phone);
    for (const p of patientsOf(pvtgrid)) {
      const { ops } = drawCard(pvtgrid, W, compact, p, H), framed = ops.filter((o) => o.k === 't' && o.box);
      assert.ok(framed.length >= 3 + 2 * 2 + 5, `${name}: the headers, the row names and the answers are framed`);
      const lines = new Map();   // the pieces of one line together (a line is one face here, but keep it general)
      for (const t of framed) { const k = `${t.box.join(',')}|${t.y.toFixed(1)}`; (lines.get(k) || lines.set(k, []).get(k)).push(t); }
      for (const ts of lines.values()) {
        const b = ts[0].box, x0 = Math.min(...ts.map((t) => t.x)), x1 = Math.max(...ts.map((t) => t.x + H.textWidth(t.text, { weight: ROLE[t.face].weight, size: ROLE[t.face].size })));
        const what = `${name} ${JSON.stringify(p)} "${ts.map((t) => t.text).join('')}"`;
        assert.ok(x0 >= b[0] - 0.5 && x1 <= b[1] + 0.5, `${what}: inside its frame (${x0.toFixed(1)}–${x1.toFixed(1)} in ${b[0].toFixed(1)}–${b[1].toFixed(1)})`);
        assert.ok(Math.abs((x0 - b[0]) - (b[1] - x1)) <= 1, `${what}: centred across`);
        assert.ok(ts[0].y - ROLE[ts[0].face].size >= b[2] - 0.5 && ts[0].y + 4 <= b[3] + 0.5, `${what}: inside its frame down`);
      }
      assert.equal(ops.filter((o) => o.k === 'd' && o.look === 'path.group').length, 3);
      assert.equal(ops.filter((o) => o.k === 'd' && o.on).length, 1, 'the patient\'s shape lit');
    }
  }
});

test('the model draws what shows: the lit pieces are the patient\'s answers, the rest is unlit', () => {
  const look = (k) => k.attrs['data-look'];
  const litOps = (a, p, compact = false, W = compact ? 340 : 528) => model(a, layout(a, W, compact, p, FAKE), p, FAKE, 0).filter((k) => k.attrs.class === 'lit');
  const all = model(psvdscore, layout(psvdscore, 528, false, psvdscore.defaults, FAKE), psvdscore.defaults, FAKE, 0);
  assert.ok(all.length > 20);
  assert.ok(all.every((k) => ['text', 'rect', 'path'].includes(k.tag) && k.attrs['data-look'].startsWith('path.')), 'every piece has a look of the card');
  assert.ok(all.filter((k) => k.tag === 'text').every((k) => typeof k.kids[0] === 'string' && k.attrs['font-size'] > 0), 'every word is a string with a size');
  for (const compact of [false, true]) {
    // a score card: one lit answer for each row, one lit zone on the bar
    for (const p of patientsOf(psvdscore)) {
      const L = litOps(psvdscore, p, compact);
      assert.equal(L.filter((k) => look(k) === 'path.opt').length, 4, JSON.stringify(p));
      assert.equal(L.filter((k) => look(k) === 'path.bar').length, 1);
      assert.ok(L.filter((k) => look(k) === 'path.zl').length >= 1, 'and its name (a line or two)');
      assert.equal(new Set(L.map((k) => k.attrs['data-p-tone'])).size >= 1, true);
    }
    // a checklist has no points drawn
    assert.equal(model(recomp, layout(recomp, 528, compact, recomp.defaults, FAKE), recomp.defaults, FAKE, 0).filter((k) => look(k) === 'path.pt').length, 0);
    assert.ok(model(psvdscore, layout(psvdscore, 528, compact, null, FAKE), psvdscore.defaults, FAKE, 0).filter((k) => look(k) === 'path.pt').length > 0);
    // a grid: one lit cell, in its own colour
    for (const p of patientsOf(pvtgrid)) {
      const L = litOps(pvtgrid, p, compact), cell = L.filter((k) => look(k) === 'path.cell');
      assert.equal(cell.length, 1);
      assert.equal(cell[0].attrs['data-p-tone'], H.TOKEN[pvtgrid.cells[`${p.r}|${p.c}`][2]]);
    }
    // a ladder: one lit step line, and the way back lit only when recompensated
    for (const p of patientsOf(ladder)) {
      const L = litOps(ladder, p, compact);
      assert.equal(L.filter((k) => look(k) === 'path.step').length, 1);
      assert.equal(L.filter((k) => look(k) === 'path.back').length, p.rc && p.s >= 2 ? 1 : 0, JSON.stringify(p));
      assert.equal(model(ladder, layout(ladder, 528, compact, p, FAKE), p, FAKE, 0).filter((k) => look(k) === 'path.back').length, p.s >= 2 ? 1 : 0, 'the way back is there from the first decompensation on');
    }
  }
  // the oy moves the whole body
  const a = model(ladder, layout(ladder, 528, false, null, FAKE), ladder.defaults, FAKE, 0), b = model(ladder, layout(ladder, 528, false, null, FAKE), ladder.defaults, FAKE, 100);
  assert.equal(a.length, b.length);
  assert.ok(a.filter((k) => k.tag === 'text').every((k, i) => b.filter((x) => x.tag === 'text')[i].attrs.y === k.attrs.y + 100));
});

test('the words rules: symbols for comparisons, no arrows, no statement numbers, Baveno VIII, Child–Pugh with an en dash, nothing the outlines lack', () => {
  const BAD_WORDS = /\b(at least|over|under|more than|less than|or more|or less|below|above|greater than|fewer than)\b/i;
  const STMT = /\b\d{1,2}\.\d{1,2}[a-z]?\b/;   // (a statement's number: 8.44, 9.10a, 1.16c)
  for (const a of CARDS) {
    for (const s of wordsOf(a)) {
      assert.doesNotMatch(s, BAD_WORDS, `${a.id}: a comparison in words in "${s}"`);
      assert.doesNotMatch(s, /→|->|↩|←|↑|↓/, `${a.id}: an arrow in "${s}"`);
      assert.doesNotMatch(s, /Baveno 8/, `${a.id}: "${s}"`);
      assert.doesNotMatch(s, /Child-Pugh/, `${a.id}: "${s}"`);
      assert.doesNotMatch(s, STMT, `${a.id}: a statement number in "${s}"`);
      assert.doesNotMatch(s, /\d[\d,.]*\+(?![\w])/, `${a.id}: "5+" style in "${s}"`);
      assert.doesNotMatch(s, /undefined|NaN|null|\[object/, `${a.id}: "${s}"`);
      assert.ok(textCovers(s), `${a.id}: the outlines have every character of "${s}"`);
    }
    assert.doesNotMatch(a.notes, /→|Baveno 8|Child-Pugh/);
    for (const k of a.outcomes) assert.ok(a.reading(k, a.worst).stmt, `${a.id}/${k} keeps its statement for the notes`);
  }
  assert.ok(textCovers('Patient is here') && textCovers('−') && textCovers('≥') && textCovers(' · '));
});

test('every outcome has a reading with a tone, for any patient, and a screen reader gets the verdict', () => {
  for (const a of CARDS) {
    const seen = new Set();
    for (const p of patientsOf(a)) {
      const k = a.outcomeOf(a.lit(p));
      assert.ok(a.outcomes.includes(k), `${a.id}: ${k}`);
      seen.add(k);
      const r = a.reading(k, p);
      assert.ok(r.head && r.why && TONES.includes(r.tone) && typeof r.next === 'string', `${a.id}/${k}`);
      assert.ok(a.lit(p).has('root') && a.lit(p).size >= 2, a.id);
    }
    assert.deepEqual([...seen].sort(), [...a.outcomes].sort(), `${a.id}: the patients reach every outcome`);
    assert.equal(a.outcomeOf(new Set(['root'])), null);
    assert.ok(litOf(a.id, a.worst).size >= 2);
  }
});

test('the faces and looks resolve in every look, lit or not, in every tone the cards use', () => {
  const ctx = (o = {}) => withCtx(makeCtx({ host: 'path', layout: 'wide', scale: { sm: 12 }, svk: 1 }), { theme: 'light', dark: false, palette: 'navy', ...o });
  const used = new Set(['rn', 'rd', 'op', 'pt', 'zl', 'gh', 'gr', 'gs', 'ct', 'ctc', 'cs', 'sn', 'yo', 'sw', 'bk', 'bb', 'rh', 'rs', 'rp', 'r', 't']);
  for (const f of used) assert.ok(ROLE[f], `a face ${f}`);
  for (const f of Object.keys(ROLE)) assert.ok(LOOKS[`path.${f}`], `a look for the face ${f}`);
  for (const k of ['opt', 'bar', 'cell', 'group', 'step', 'back', 'rule']) assert.ok(LOOKS[`path.${k}`], `a look for ${k}`);
  for (const theme of ['light', 'soft', 'dark']) for (const k of Object.keys(LOOKS).filter((x) => x.startsWith('path.'))) for (const lit of [false, true]) for (const tone of ['text', 'ok', 'caution', 'danger', 'accent']) {
    const p = resolveProps(LOOKS[k], ctx({ theme, dark: theme === 'dark' }), { lit }, { tone });
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme} ${tone} lit ${lit}`);
  }
  const at = (k, lit, tone = 'danger') => resolveProps(LOOKS[k], ctx(), { lit }, { tone });
  assert.ok(at('path.opt', true).width > at('path.opt', false).width, 'a lit answer has the thicker border');
  assert.notEqual(at('path.opt', true, 'danger').stroke, at('path.opt', true, 'ok').stroke, 'a lit answer takes the verdict\'s colour');
  assert.equal(at('path.opt', false, 'danger').stroke, at('path.opt', false, 'ok').stroke, 'an unlit one is the quiet grey');
  assert.equal(at('path.opt', false).opacity, 0.4, 'unlit at 40%');
  assert.equal(at('path.opt', true).opacity, 1);
  assert.equal(at('path.op', false).opacity, 0.4);
  assert.notEqual(at('path.cell', true, 'accent').fill, at('path.cell', true, 'danger').fill, 'a lit cell is in its own colour');
  assert.notEqual(at('path.group', false, 'accent').stroke, at('path.group', false, 'danger').stroke, 'an answer\'s shape keeps its colour at rest');
  assert.ok(at('path.group', true).width > at('path.group', false).width, 'the patient\'s shape has the thicker edge');
  assert.equal(at('path.rn', false).opacity ?? 1, 1, 'a row\'s name is plain ink, at rest');
  assert.ok(at('path.step', true).width === at('path.step', false).width);
});

test('the card draws the new kinds on the GPU, with no page text and no layout read, and the head, rule and foot stay the card\'s', () => {
  const card = read('src/ui/path-cards.js'), path = read('src/ui/tool-path.js');
  for (const src of [card, path]) assert.doesNotMatch(src, /requestAnimationFrame|getBoundingClientRect|getComputedStyle|createElementNS|getContext|clientWidth|offsetWidth|offsetHeight|readMetric|readBox|textContent|innerHTML|innerText/, 'no raw frame, no layout read, no canvas 2D, no SVG DOM, no page words');
  assert.match(path, /cardLayout\(spec\.algo, Wv, compact, base, CARD_HELPERS\)/);
  assert.match(path, /cardModel\(spec\.algo, lay\.card, patient, CARD_HELPERS, oy\)/);
  assert.match(path, /gl\.show\(/);
  assert.match(path, /the answers lit, the width and layout, the chips, and the reading's words/, 'the paint key holds all that shows');
  assert.match(read('src/ui/path-data.js'), /psvdscore, recomp, pvtgrid, ladder\]/);
});
