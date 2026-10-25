// A card that is the same on the next slide stays on screen (Mohammad, 25 Oct: "If the instrument data card on a deck is gonna stay
// the same for the next slide and only teaching card is changed or other way around we shouldn't reload the data card or vice versa
// keep it while you load the other card"). The decision is pure (card-keep.js); the presenter's part is read from its source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dataPlan, textPlan, keepData, keepText, eases, cardSnap, cardChanged, cardBack } from '../src/ui/card-keep.js';
import { DECKS, withOverview } from '../src/ui/decks.js';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const run = src.slice(src.indexOf('async function transitionRun('), src.indexOf('const reFit = '));
const O = { keys: ['hvpg'], ref: false, title: 'Endoscopy', ghost: null, under: false, sin: false };

const scope = (extra = {}) => ({ title: 'A', line: 'Words', data: 'tiles', tiles: ['hvpg'], key: ['hvpg'], tool: { kind: 'scope' }, ...extra });

test('two slides with the same instrument, tiles and layout have the same data card plan; a highlight or the words do not matter', () => {
  const a = scope(), b = scope({ title: 'B', line: 'Other words', key: [] });
  assert.equal(dataPlan(a, O), dataPlan(b, O));
  assert.notEqual(dataPlan(a, O), dataPlan(scope({ tool: { kind: 'scope', grid: true } }), O), 'an option of the instrument changes the card');
  assert.notEqual(dataPlan(a, O), dataPlan(scope({ tool: { kind: 'fibroscan' } }), O), 'another instrument');
  assert.notEqual(dataPlan(a, O), dataPlan(a, { ...O, keys: ['hvpg', 'ppg'] }), 'other tiles are another card');
  assert.notEqual(dataPlan(a, O), dataPlan(a, { ...O, ref: true }), 'tiles with a ring for where they started are built apart from those without');
  assert.notEqual(dataPlan(a, O), dataPlan(a, { ...O, title: 'Other' }));
  assert.notEqual(dataPlan(a, O), dataPlan(a, { ...O, ghost: { label: 'Before', value: '9 kPa' } }));
  assert.equal(dataPlan({ title: 'x' }, O), null, 'no card');
  assert.equal(dataPlan({ visual: 'table', data: 'tiles' }, O), null, 'a visual has its own panel');
});

test('the data card is kept for a slide with the same plan, with the same patient or a new one', () => {
  const a = scope(), b = scope({ title: 'B' }), p = dataPlan(a, O);
  assert.equal(keepData({ from: p, to: p, prev: a, next: b }), true);
  assert.equal(keepData({ from: p, to: p, prev: a, next: b, swap: true }), true, 'its readings ease to the new patient');
  assert.equal(keepData({ from: p, to: p, prev: a, next: b, again: true }), false, 'the same slide drawn again (a new text size) builds its cards afresh');
  assert.equal(keepData({ from: p, to: dataPlan(a, { ...O, keys: ['ppg'] }), prev: a, next: b }), false);
  assert.equal(keepData({ from: null, to: p, prev: a, next: b }), false, 'nothing on screen');
  assert.equal(keepData({ from: p, to: undefined, prev: a, next: b }), false, 'a plan not yet known keeps nothing');
});

test('an instrument that records the patient, or a chart drawn from the deck\'s states, is kept only while the patient stays', () => {
  for (const tool of [{ kind: 'doppler', vessel: 'PV_TRUNK' }, { kind: 'trace', range: 'beats' }, { kind: 'trace', range: 'talk' }, { kind: 'flowtime' }]) {
    const a = scope({ tool }), b = scope({ tool, title: 'B' }), p = dataPlan(a, O);
    assert.equal(eases(tool), false, tool.kind);
    assert.equal(keepData({ from: p, to: p, prev: a, next: b }), true, `${tool.kind} stays with the same patient, still recording`);
    assert.equal(keepData({ from: p, to: p, prev: a, next: b, swap: true }), false, `${tool.kind} is built again for a new one`);
  }
  for (const kind of ['scope', 'fibroscan', 'abdomen', 'wall', 'profile', 'flows', 'fluid', 'lumen']) assert.equal(eases({ kind }), true, kind);
  assert.equal(eases(undefined), true, 'tiles alone ease');
});

test('slides with their own order of cards keep nothing: the catheter, a case card, a question, a held answer (and a time-lapse keeps no words)', () => {
  const a = scope(), p = dataPlan(a, O);
  for (const k of ['visual', 'lapse', 'cath', 'monitor', 'procedure', 'vignette', 'question', 'hold']) {
    const x = scope({ [k]: k === 'lapse' ? { seconds: 8 } : k === 'visual' ? 'table' : 'x' });
    if (k !== 'lapse') {
      assert.equal(keepData({ from: p, to: p, prev: a, next: x }), false, `${k} ahead`);
      assert.equal(keepData({ from: p, to: p, prev: x, next: a }), false, `${k} behind`);
    }
    assert.equal(keepText({ from: textPlan(a), to: textPlan(a), prev: a, next: x }), false, `${k} ahead (words)`);
    assert.equal(keepText({ from: textPlan(a), to: textPlan(a), prev: x, next: a }), false, `${k} behind (words)`);
  }
});

test('a time-lapse keeps a matching data card that reads the live model, with the same patient; the words, recorders, drawn charts and a lapse with a patient of its own do not', () => {
  const lapse = { seconds: 8 };
  for (const tool of [undefined, { kind: 'fibroscan' }, { kind: 'profile' }, { kind: 'flows' }]) {
    const a = scope({ tool }), b = scope({ tool, title: 'B', lapse }), p = dataPlan(a, O);
    assert.equal(keepData({ from: p, to: p, prev: a, next: b }), true, `${tool?.kind || 'tiles'}: the card stays into the lapse and climbs with its days`);
    assert.equal(keepData({ from: p, to: p, prev: b, next: scope({ tool, title: 'C' }) }), true, `${tool?.kind || 'tiles'}: and out of it`);
    assert.equal(keepData({ from: p, to: p, prev: b, next: scope({ tool, title: 'C', lapse }) }), true, `${tool?.kind || 'tiles'}: and through one lapse into the next`);
    assert.equal(keepData({ from: p, to: p, prev: a, next: b, swap: true }), false, `${tool?.kind || 'tiles'}: a lapse that opens on a patient of its own builds its card (the follow would land on the lapse's start)`);
    assert.equal(keepData({ from: p, to: p, prev: b, next: scope({ tool, title: 'C' }), swap: true }), true, `${tool?.kind || 'tiles'}: after a lapse a new patient rides in as it does anywhere`);
    assert.equal(keepData({ from: p, to: p, prev: a, next: b, again: true }), false);
    assert.equal(keepText({ from: textPlan(a), to: textPlan(a), prev: a, next: b }), false, 'the words are built afresh: the lapse bar is in them');
  }
  // A recorder starts its trace over and a drawn chart starts empty for the days, so they are built for the lapse as before.
  for (const tool of [{ kind: 'doppler', vessel: 'PV_TRUNK' }, { kind: 'vitals' }, { kind: 'trace', range: 'beats' }, { kind: 'flowtime' }, { kind: 'trace', range: 'talk' }]) {
    const a = scope({ tool }), b = scope({ tool, title: 'B', lapse }), p = dataPlan(a, O);
    assert.equal(keepData({ from: p, to: p, prev: a, next: b }), false, `${tool.kind} into a lapse`);
    assert.equal(keepData({ from: p, to: p, prev: b, next: a }), false, `${tool.kind} out of one`);
  }
  // The other fields that give a slide its own order of cards still do, lapse or not.
  const a = scope(), p = dataPlan(a, O);
  for (const k of ['cath', 'monitor', 'procedure', 'vignette', 'question', 'hold']) assert.equal(keepData({ from: p, to: p, prev: a, next: scope({ lapse, [k]: 'x' }) }), false, `${k} with a lapse`);
});

test('the words stay when they are the same and the patient is: whatever only the data card, the figure or the model read does not count', () => {
  const a = scope({ cam: 'fit', labels: ['PV'], notes: 'n1' }), b = scope({ cam: 'liver', labels: ['IVC'], notes: 'n2', tool: { kind: 'fibroscan' }, tiles: ['lsm'], key: ['hvpg'], params: { x: 1 } });
  assert.equal(textPlan(a), textPlan(b));
  assert.equal(keepText({ from: textPlan(a), to: textPlan(b), prev: a, next: b }), true);
  assert.equal(keepText({ from: textPlan(a), to: textPlan(b), prev: a, next: b, swap: true }), false, 'its numbers would change with the patient');
  assert.equal(keepText({ from: textPlan(a), to: textPlan(b), prev: a, next: b, again: true }), false);
  assert.notEqual(textPlan(a), textPlan(scope({ line: 'Other' })), 'a word changes it');
  assert.notEqual(textPlan(a), textPlan(scope({ lens: 'velocity' })), 'the colour key under the line');
  assert.notEqual(textPlan(a), textPlan(scope({ key: [] })), 'the key words are bold in the line');
  assert.equal(textPlan({ visual: 'table', title: 'x' }), null);
  // what the viewer may have changed on the slide before is never kept
  for (const k of ['compare', 'whatIf', 'column', 'scales', 'ask']) {
    const x = scope({ [k]: ['x'] });
    assert.equal(keepText({ from: textPlan(x), to: textPlan(x), prev: x, next: x }), false, k);
  }
});

// A stand-in for a card: classes, attributes, style, size and top, as the checks read and put them back.
function fakeCard(o = {}) {
  const attrs = new Map(Object.entries(o.attrs || {})), style = new Map(Object.entries(o.style || {}));
  const el = {
    className: o.cls || 'pz-data col', offsetWidth: o.w ?? 400, offsetHeight: o.h ?? 300, offsetTop: o.top ?? 200,
    get attributes() { return [...attrs].map(([name, value]) => ({ name, value })); },
    getAttribute: (k) => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k),
    style: {
      [Symbol.iterator]: () => [...style.keys()][Symbol.iterator](),
      getPropertyValue: (p) => style.get(p) ?? '',
      get cssText() { return [...style].map(([k, v]) => `${k}: ${v};`).join(' '); },
      set cssText(t) { style.clear(); for (const m of t.matchAll(/([\w-]+): ([^;]*);/g)) style.set(m[1], m[2]); },
      set: (p, v) => style.set(p, v), drop: (p) => style.delete(p),
    },
  };
  return el;
}

test('a kept card the layout leaves alone is kept; a changed class, size, fit or attribute is not', () => {
  const el = fakeCard({ style: { left: '20px', width: '400px', top: '300px', 'max-height': '500px', '--pz-fit': '0.9' }, attrs: { 'data-safe': 'right' } });
  const sn = cardSnap(el);
  assert.equal(cardChanged(sn, true), false, 'untouched');
  el.style.set('top', '340px'); el.style.set('max-height', '470px'); el.offsetTop = 340;
  assert.equal(cardChanged(sn, true), false, 'the data card may stand lower or higher: its top eases there');
  assert.equal(cardChanged(sn, false), true, 'the words\' card may not move');
  el.style.set('--pz-fit', '0.8');
  assert.equal(cardChanged(sn, true), true, 'a different fit is a different card');
  cardBack(sn);
  assert.equal(cardChanged(sn, true), false, 'put back');
  assert.equal(el.style.getPropertyValue('--pz-fit'), '0.9');
  el.className = 'pz-data col pz-folds';
  assert.equal(cardChanged(sn, true), true, 'folded');
  cardBack(sn); assert.equal(el.className, 'pz-data col');
  el.offsetHeight = 270;
  assert.equal(cardChanged(sn, true), true, 'shorter');
  el.offsetHeight = 300; el.setAttribute('data-colswap', ''); el.setAttribute('data-safe', 'top');
  assert.equal(cardChanged(sn, true), true, 'an attribute');
  cardBack(sn);
  assert.equal(el.getAttribute('data-safe'), 'right'); assert.equal(el.getAttribute('data-colswap'), null, 'an attribute the layout added is taken off again');
  assert.equal(cardChanged(sn, true), false);
});

test('the presenter decides before the cards leave and falls back if the layout would change a kept card', () => {
  const out = run.indexOf('keepNow = keepFor('), words = run.indexOf('outMs = wordsOut(s)');
  assert.ok(out > 0 && out < words, 'chosen as the change begins, before any card fades');
  // (A time-lapse changes the patient as transitionRun counts it: from the slide before's state, or from a start of its own.)
  assert.match(run, /const si = lap \|\| holdQ \? stateOf\[to - 1\] : stateOf\[to\];\n\s+keepNow = keepFor\(was && slides\[was\.i\], s, to, si !== shownState \|\| liveOff \|\| \(lap && !!states\[stateOf\[to\]\]\?\.start\), \{ again: !was \|\| was\.i === to \}\)/);
  assert.equal(run.split('const si = ').length, 2, 'one count of the patient');
  // (a kept card is not built; its fall back is checked after each layout of the unseen cards, before they come in)
  assert.match(src, /if \(!keepNow\.text\) textIn\(s, st, i\);\n\s+if \(keepNow\.data\) dataKept\(s, i, now\); else dataIn\(s, st, i, fresh, lap, now\);\n\s+layout\(\);\n\s+keepNote\(\);/);
  // (the settle lays the unseen cards out once more, and ends by letting a kept card that layout changed fall; the cards come in after it)
  const settle = run.indexOf('await settleRun();'), cards = run.indexOf('cardsIn({ i: to, gen: g })');
  assert.ok(settle > 0 && settle < cards);
  assert.match(src, /async function settleRun\(\) \{[\s\S]*?\n\s+layout\(\);\n\s+await keepFall\(keepCut\);/);
  assert.match(run, /keepNow = keepFor\([^\n]*; keepCut = cut;/, 'the settle cuts with the move that chose the cards');
  // (and once more at the last gate before the cards come in, after the unseen cards' own last layout)
  assert.match(src, /async function caseEnd\(cut\) \{\n\s+await keepFall\(cut\);[^\n]*\n\s+if \(cut\(\)\) return;/);
  // (a kept card is put back as it stood before it leaves)
  assert.match(src, /async function keepFall\(cut\) \{\n\s+keepNote\(\);/);
  assert.match(src, /cardBack\(sn\);\n\s+if \(k === 'data'\) \{ clearTimeout\(colT\); colT = 0; \}/, 'a move the layout began for the card is cancelled');
});

test('a card that stays does not fade, and the other one still does', () => {
  const out = src.slice(src.indexOf('function wordsOut(next) {'), src.indexOf('return 340;'));
  assert.match(out, /const out = \[ui\.text, ui\.panel\]\.filter\(\(el\) => !\(keepNow\.text && el === ui\.text\)\)/);
  assert.match(out, /const dataOut = !keepNow\.data && !data\.hidden && !data\.classList\.contains\('pz-hide'\);/);
  assert.match(out, /if \(!keepNow\.text\) ui\.scl\.classList\.add\('pz-leave'\);/);
  // (the unseen words are held out only when they are being built)
  assert.match(run, /if \(keepNow\.text\) \{[^\n]*\}\n\s+else if \(bare \|\| caseCard\) \{ ui\.text\.classList\.add\('pz-leave'\); ui\.root\.dataset\.bare = ''; \}/);
});

test('a kept data card rides the model through a new patient and lands on the slide\'s numbers; with the same patient it takes them in place', () => {
  assert.match(run, /if \(later && keepNow\.data && keepNow\.swap\) followData\(s, to, st, cut\);\n\s+if \(later\) \{ if \(!await morphTo\(st, cut\)\) return; shownState = own \? -1 : si; \}/);
  const kept = src.slice(src.indexOf('function dataKept('), src.indexOf('function followData('));
  assert.match(kept, /if \(keepNow\.swap\) return;/, 'with a new patient nothing jumps ahead of the figure');
  assert.match(kept, /ui\.tiles\.set\(respFp\(s, now\.fp\), tileKeys\(s\), s\.key \|\| \[\], refOf\(s, i\), undefined, now\.params\?\.tips\?\.on\);/, 'the tiles count (an undefined ease is theirs)');
  const follow = src.slice(src.indexOf('function followData('), src.indexOf('// Each row of a table still computing'));
  assert.match(follow, /dataTo\(s, liveFp\(fr\), ref, 280\)/);
  assert.match(follow, /if \(shownState === stateOf\[to\]\) \{ if \(s\.tool\) showTool\(s, to\); dataTo\(s, st\.fp, ref, 280\); return; \}/, 'landed: the slide\'s own numbers, and done');
});

test('nothing is kept after a start or a stop, and each change decides afresh', () => {
  assert.match(src, /ui = build\(\);\n\s+dataOn = textOn = null; keepNow = NO_KEEP;/);
  assert.match(src, /dataOn = textOn = null; keepNow = NO_KEEP; keepSnap = null; keepBad = \[\]; keepArgs = null;\n\s+pillW = 0;/);
  assert.match(src, /try \{ await transitionRun\(to\); \} finally \{\n\s+keepNow = NO_KEEP;/);
  // a change cut short, a card on its way in or out, and the states a tile's ring counts from not yet in keep nothing
  assert.match(src, /const dataStands = \(\) => /);
  assert.match(src, /!states\[stateOf\[to\]\] \|\| \(to > 0 && !states\[stateOf\[to - 1\]\]\)\) return NO_KEEP;/);
});

test('in the shipped decks the rule keeps cards between consecutive slides, and never one that is not the same card', () => {
  let kept = 0, swapKept = 0, pairs = 0;
  const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
  for (const d of DECKS) {
    const sl = withOverview(d).slides;
    for (let i = 1; i < sl.length; i++) {
      const a = sl[i - 1], b = sl[i];
      pairs++;
      const O2 = (s) => ({ keys: s.tiles || [], ref: false, title: String(s.dataTitle || ''), ghost: null });
      // (A time-lapse changes the patient only when it opens on a start of its own: params with its days. Its days are the live model's.)
      const swap = b.lapse ? !!(b.params || b.preset) : MODEL.some((k) => b[k]);
      const pa = dataPlan(a, O2(a)), pb = dataPlan(b, O2(b));
      if (keepData({ from: pa, to: pb, prev: a, next: b, swap })) {
        kept++; if (swap) swapKept++;
        assert.deepEqual(a.tool || null, b.tool || null, `${d.id} ${i}: kept cards hold the same instrument and options`);
        assert.deepEqual(a.tiles || [], b.tiles || [], `${d.id} ${i}: and the same tiles`);
        assert.ok(!a.vignette && !b.vignette && !a.cath && !b.cath, `${d.id} ${i}: no slide with its own order of cards`);
        // (A time-lapse keeps only a card that reads the live model, with the patient staying into it.)
        if (a.lapse) assert.ok(eases(a.tool), `${d.id} ${i}: a time-lapse's card that stays reads the live model`);
        if (b.lapse) assert.ok(!swap && eases(b.tool), `${d.id} ${i}: a time-lapse keeps its card only with the patient staying and a card that eases`);
        if (swap) assert.ok(eases(b.tool), `${d.id} ${i}: a recording instrument is never kept through a new patient`);
      }
    }
  }
  assert.ok(pairs > 300);
  assert.ok(kept > 0, 'there are slides that keep their data card');
  assert.ok(swapKept <= kept);
});
