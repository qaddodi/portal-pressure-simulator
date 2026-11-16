// A deck must always open: the words of every slide of every deck are typeset (presenter-words.js rich) with that slide's own numbers, and
// each typesetting returns at once, never throws, and leaves no {token} unread. A line that cannot be typeset would stop the first slide
// of a talk from landing (16 Nov 2026: every deck stopped on its empty first slide, Next did nothing; the cause was thought to be a
// line's new {sin} value, so one line's text must never be able to do that). A token is a live tile ({pv}), {x:0}, {x@slide-id}, a step
// marker {#n}, or a typed number or cut-off ({>=10 mmHg}); anything else prints its own letters in a pill and is a typo.
import { JSDOM } from 'jsdom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

// (A real document for the typesetting, then the app's modules, which read the browser as they load.)
const dom = new JSDOM('<!doctype html><body></body>');
for (const k of ['document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'DocumentFragment']) globalThis[k] ??= dom.window[k];
await import('./dom-shim.js');
const { deckStates } = await import('./deck-states.js');
const { rich } = await import('../src/ui/presenter-words.js');
const { TILE } = await import('../src/ui/table-marks.js');

const DIR = new URL('../src/ui/decks/', import.meta.url);
const TEXT = ['title', 'line', 'question', 'caseQ'];
const texts = (s) => [...TEXT.map((k) => s[k]), ...(s.sides || []).map((x) => x.text)].filter((t) => typeof t === 'string');

test('every slide line of every deck typesets at once, with every {token} a reading, a marker or a typed number', async () => {
  const bad = [];
  let lines = 0;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (!d) continue;
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      for (const t of texts(s)) {
        lines++;
        const t0 = performance.now();
        try { rich(t, s, fps[i], false); } catch (e) { bad.push(`${d.id}/${s.id}: throws ${e.message}`); }
        if (performance.now() - t0 > 250) bad.push(`${d.id}/${s.id}: took ${Math.round(performance.now() - t0)} ms to typeset`);
        for (const [, mk] of t.matchAll(/\{([^}]+)\}/g)) {
          if (/^#\d+$/.test(mk) || /^[<>≥≤]/.test(mk) || /^\d/.test(mk)) continue;
          const k = mk.replace(/@[\w-]+$/, '').replace(/:0$/, '');
          if (!TILE[k]) bad.push(`${d.id}/${s.id}: {${mk}} is no reading`);
        }
      }
    });
  }
  assert.ok(lines > 500, `${lines} lines typeset`);
  assert.deepEqual(bad, []);
});
