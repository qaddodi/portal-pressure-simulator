// The gallery's specimens opened in Node, in seconds, on every push (plan step 2: /mnt/project-files/card-gallery-plan/faster-checks-recs.md).
// Each teaching-card specimen of src/ui/gallery/catalog.js is put up as the presenter puts a slide up: the instrument in the data card, the readout tiles, the
// slide's words, on the page's own DOM (jsdom, tests/gallery-node.js) with a WebGL context that draws nothing and a clock the harness moves. Each must:
//   • open without a throw, a console error, or an error the app catches and goes on from (caught.js);
//   • say nothing the wording rules forbid, in the words as the page puts them in (tokens filled, tiles written, aria-labels), and print no NaN, undefined,
//     "{token}" or a second copy of a number that disagrees with the model: every tile and header reading is the fingerprint's number, formatted as the tile table says;
//   • let go of what it made on the GPU when it closes: the same specimen opened and closed twice leaves the page's live GPU objects exactly as the first close did.
// What this cannot say: that anything fits (jsdom has no layout), that a shader compiles (scripts/glsl-compile.mjs), how it looks or how fast it is.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { galleryDeck } from '../src/ui/gallery/deck.js';
import { CATALOG } from '../src/ui/gallery/catalog.js';
import { check } from '../scripts/clinical-wording.mjs';
import { deckStatesFull } from './deck-states.js';
import { slideRig, watching, liveContexts, madeAt } from './gallery-node.js';
import { snapshotLive } from './gl-live.js';

const deck = galleryDeck();
const entries = CATALOG.filter((e) => e.kind === 'slide');
let rig, states;

// The standing text rules that are not in clinical-wording.mjs (the owner's, 18 Nov 2026): Baveno VIII only, the PPG named with a minus sign.
const MORE = [
  ['baveno-vii', /Baveno\s+VII(?!I)/, 'Baveno VIII only, never VII'],
  ['ppg-label', /PPG\s*\(\s*PV\s*[-–]\s*IVC\s*\)/, 'write "PPG (PV − IVC)" with the minus sign'],
  ['no-number', /\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b|\[object /, 'a value that was never worked out reached the page'],
  ['open-token', /\{[#\w@.-]+\}/, 'a {token} the page did not fill'],
];
// (A lone "—" in a card is the app's mark for a number it has none for, tile and monitor alike: it is no sentence's dash.)
const rules = (text, prose = true) => [...check(prose ? text : text.replace(/(^|\s)—(?=\s|$)/g, '$1(none)')).map((r) => `${r.rule}: "${r.match}"`), ...MORE.filter(([, re]) => re.test(text)).map(([n, re, fix]) => `${n}: "${text.match(re)[0]}" (${fix})`)];

before(async () => {
  states = await deckStatesFull(deck);
  rig = await slideRig(deck, states);
}, { timeout: 280000 });

const KINDS = ['texture', 'framebuffer', 'renderbuffer', 'buffer', 'vao', 'program', 'shader', 'contexts'];
const held = (a, b) => KINDS.filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]} -> ${b[k]}`);

for (const e of entries) {
  test(`${e.id} opens, reads right and lets go`, { timeout: 120000 }, async () => {
    const i = deck.slides.findIndex((s) => s.id === e.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
    assert.ok(i >= 0, 'the gallery deck has this specimen');
    // First open: what it says and what it throws.
    const first = await watching(async () => {
      const o = await rig.open(i);
      const said = o.read();
      await o.close();
      return said;
    });
    assert.equal(first.threw, null, `threw: ${first.threw?.stack || first.threw}`);
    assert.deepEqual(first.said, [], 'the page logged errors while it opened');
    const w = first.value;
    const problems = [];
    for (const [where, text, prose] of [['title', w.title, true], ['kicker', w.kicker, true], ['line', w.line, true], ['notes', w.notes, true], ['card', w.tool, false], ['tiles', w.tiles, false], ...w.labels.map((l) => ['aria-label', l, true])]) {
      for (const r of rules(String(text), prose)) problems.push(`${where}: ${r}`);
    }
    for (const t of w.tileRows.filter((r) => r.key !== 'scope')) {   // (the endoscopic view is a picture, with no number)
      if (t.shown !== t.wanted) problems.push(`tile ${t.key} shows "${t.shown}", the model's number is "${t.wanted}"`);
      if (t.head && t.head !== t.wanted) problems.push(`header reading ${t.key} shows "${t.head}", the model's number is "${t.wanted}"`);
    }
    assert.deepEqual(problems, [], `${e.id}: ${problems.length} problem(s)`);
    // Second open and close: the GPU holds what the first close left, and no more.
    const a = snapshotLive(), had = new Set(liveContexts());
    const again = await watching(async () => { const o = await rig.open(i, { quick: true }); await o.close(); });
    assert.equal(again.threw, null, `threw on the second open: ${again.threw?.stack || again.threw}`);
    const b = snapshotLive();
    const left = held(a, b);
    assert.deepEqual(left, [], `${e.id}: opened and closed twice, the GPU holds more after the second close (a resource kept per open). Contexts still held, made at: ${liveContexts().filter((g) => !had.has(g)).map(madeAt).join(' | ') || 'none new (its objects are in a context that stays)'}`);
  });
}
