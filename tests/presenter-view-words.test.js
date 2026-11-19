// The presenter's notes window prints the slide's words with the slide's own values in them (bible review 19 Nov 2026, CRD-10: it printed "the HVPG is hvpg,
// with large varices. Portal inflow falls to pvFlow."). The same resolver the handout uses fills them; this walks every deck as the presenter computes it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates } from './deck-states.js';
import { slideView, plain } from '../src/ui/presenter-view.js';
import { lineText } from '../src/ui/handout.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const TOKEN = /\{(\w+)(?:@[\w-]+)?(?::0)?\}/g;

test('no line of the notes window carries a token name or a brace, in any deck', async () => {
  const bad = [];
  let tokens = 0, oldBare = 0;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    const fps = await deckStates(d);
    const own = fps.map((_, i) => fps[i]);   // (deckStates already gives each slide the state it shows)
    const at = (id) => own[d.slides.findIndex((x) => x.id === id)] ?? null;
    d.slides.forEach((s, i) => {
      const say = (t) => plain(lineText(t, own[i], at));
      const v = slideView(s, say), old = slideView(s);
      for (const m of String(s.line ?? '').matchAll(TOKEN)) {
        tokens++;
        const value = plain(lineText(m[0], own[i], at));
        if (new RegExp(`\\b${m[1]}\\b`).test(old.line) && m[1] !== 'varix') oldBare++;
        assert.ok(v.line.includes(value), `${d.id}/${s.id}: the notes window lacks "${value}" for ${m[0]} in "${v.line.slice(0, 120)}"`);
      }
      for (const t of [v.kicker, v.title, v.line, ...(v.ask || [])]) if (/[{}]/.test(t)) bad.push(`${d.id}/${s.id}: a brace is left in "${t.slice(0, 100)}"`);
    });
  }
  assert.deepEqual(bad, []);
  assert.ok(tokens > 100, `only ${tokens} value tokens found`);
  assert.ok(oldBare > 50, `the unresolved view should print bare token names (${oldBare}), or this test checks nothing`);
});
