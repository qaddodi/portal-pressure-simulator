// Progressive reveal of a slide's line (N3, reveal.js): the cuts, the count of views, which terms each view names, and the presenter's wiring.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';
import { clausesOf, plainLine, revealCount, shownLine, revealProblems } from '../src/ui/reveal.js';
import { beatCount, beatView, beatProblems } from '../src/ui/slide-beats.js';
import { slideTargets } from '../src/ui/presenter.js';

const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const fn = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, `${head} is there`); return src.slice(i, src.indexOf('\n  }\n', i)); };

test('a line is cut after commas, semicolons and full stops, and the clauses join back into the line', () => {
  const line = 'Pressure backs up in the portal vein, the spleen swells; collaterals open around the liver. Blood bypasses it.';
  const cl = clausesOf(line);
  assert.deepEqual(cl.map((c) => c.trim()), ['Pressure backs up in the portal vein,', 'the spleen swells;', 'collaterals open around the liver.', 'Blood bypasses it.']);
  assert.equal(cl.join(''), line, 'nothing lost, nothing added');
});

test('no cut inside a number, a {value}, a [term](link), brackets or an abbreviation; stubs join a neighbour', () => {
  assert.deepEqual(clausesOf('The wedge reads 22.5 mmHg and the free reading is 8,000 units here.').length, 1);
  assert.deepEqual(clausesOf('Raised, above {>=10 mmHg, a cut-off}, in the [portal vein, main](pv) and (e.g. this one, that), then more words here.').map((c) => c.trim()),
    ['Raised, above {>=10 mmHg, a cut-off},', 'in the [portal vein, main](pv) and (e.g. this one, that),', 'then more words here.'], 'the commas inside braces, brackets and parentheses are not cuts; the stub "Raised," leads on');
  assert.deepEqual(clausesOf('Use the wedge, e.g. the balloon reading taken at the hepatic vein, and the free reading').map((c) => c.trim()), ['Use the wedge,', 'e.g. the balloon reading taken at the hepatic vein,', 'and the free reading'], 'e.g. is no stop');
  const stub = clausesOf('Yes. The pressure rises in the portal vein and the spleen swells up.');
  assert.equal(stub.length, 1, 'a short opening clause leads into the next');
  assert.equal(clausesOf('The pressure rises in the portal vein and the spleen swells up. Ok.').length, 1, 'a short last clause trails the one before');
});

test('explicit bars cut the line wherever the author says, and do not show', () => {
  const cl = clausesOf('Portal pressure rises | and the spleen swells | and collaterals open.');
  assert.equal(cl.length, 3);
  assert.equal(plainLine('Portal pressure rises | and the spleen swells'), 'Portal pressure rises and the spleen swells');
});

test('a slide that reveals has one view per clause, and the first Next brings in the second', () => {
  const s = { title: 'T', reveal: true, line: 'Pressure backs up in the portal vein, the spleen swells; collaterals open.' };
  assert.equal(revealCount(s), 3); assert.equal(beatCount(s), 3);
  assert.deepEqual([0, 1, 2].map((b) => beatView(s, b).revealed), [1, 2, 3]);
  assert.equal(beatView(s, 9).revealed, 3, 'never past the last clause');
  assert.equal(shownLine(s, 2), 'Pressure backs up in the portal vein, the spleen swells;');
  assert.equal(shownLine(s), s.line, 'no count: the whole line');
  assert.equal(beatCount({ ...s, reveal: false }), 1); assert.equal(beatCount({ ...s, line: 'One clause only here.' }), 1);
});

test('each view lights only the terms the clauses shown so far name', () => {
  const s = { title: 'T', reveal: true, terms: ['pv', 'sv'], line: 'Pressure backs up in the portal vein, then the splenic vein swells; the spleen follows the congestion.' };
  const nodes = (b) => slideTargets(beatView(s, b)).labels;
  assert.deepEqual(nodes(0), ['CONF']);
  assert.deepEqual(nodes(1).sort(), ['CONF', 'SV']);
  assert.deepEqual(nodes(2).sort(), ['CONF', 'SV'], 'the third clause names nothing more');
  assert.deepEqual(slideTargets(s).labels.sort(), ['CONF', 'SV'], 'the slide as a whole names them all');
  assert.ok(slideTargets(beatView(s, 0)).glow.every((g) => !/SV_/.test(g.id)), 'and the splenic glow waits for its clause');
});

test('a reveal that cannot work is named; no built-in slide reveals by accident', () => {
  assert.deepEqual(revealProblems({ reveal: true, line: 'Pressure rises in the portal vein, then the spleen swells.' }), []);
  const bad = [[{ reveal: 'yes', line: 'a b, c d e f g h i.' }, /true or left out/], [{ reveal: true }, /needs a line/], [{ reveal: true, line: 'One clause only.' }, /one clause/],
    [{ reveal: true, line: 'Pressure rises in the portal vein, then the spleen swells.', beats: [{}] }, /camera beats/], [{ reveal: true, line: 'Pressure rises in the portal vein, then the spleen swells.', procedure: {} }, /procedure/]];
  for (const [s, re] of bad) assert.ok(revealProblems(s).some((p) => re.test(p)), JSON.stringify(s));
  for (const d of DECKS) for (const s of d.slides) { assert.deepEqual(revealProblems(s), [], `${d.id}/${s.id}`); assert.deepEqual(beatProblems(s, {}).filter((p) => /reveal/.test(p)), []); }
});

test('the presenter types the whole line once, shows the clauses by class, and lights the figure without moving the camera or the cards', () => {
  assert.match(PZ, /rv \? revealLine\(s, st\?\.fp, !!st\?\.params\?\.tips\?\.on, Math\.min\(beat, lastBeat\(i\)\) \+ 1\)/, 'a slide opens with the clauses its view shows');
  assert.match(fn(PZ, 'async function beatMove('), /if \(revealCount\(slides\[i\]\)\) return revealMove\(i, k\);/, 'a Next inside the line is a reveal, not a camera beat');
  const mv = fn(PZ, 'async function revealMove(');
  assert.match(mv, /paintClauses\(ui\.text\.querySelector\('\.pz-line'\), k \+ 1\);\n\s*paintOverlays\(v, i,/, 'the clause comes in, the figure lights its terms');
  assert.ok(!/camera\(|cardsIn|layout\(|wordsIn|textIn|reFit|fitNow/.test(mv), 'no camera move, no card change, no refit');
  assert.match(mv, /hush\(\);/, 'in the liver a change of the lit labels is hushed as a slide change is');
  assert.match(CSS, /\.pz-cl:not\(\.on\) \{ opacity: 0; \}/); assert.match(CSS, /\.pz-cl \{ transition: opacity var\(--d-small\)/, 'a fade on the compositor, nothing else');
});
