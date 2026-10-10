import test from 'node:test';
import assert from 'node:assert/strict';
import { handoutHTML } from '../src/ui/handout.js';
import { DECKS } from '../src/ui/decks.js';

test('the notes handout has a row per slide with its notes and question, for every deck', () => {
  for (const d of DECKS) {
    const html = handoutHTML(d);
    assert.equal(html.match(/<li>\n/g).length, d.slides.length + 1, d.id);   // (the opening outline slide, then the deck's own)
    for (const s of d.slides) {
      if (s.ask?.[0]) assert.ok(html.includes(s.ask[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')), `${d.id}/${s.id} ask`);
    }
  }
});

test('the handout escapes a script\'s own text', () => {
  const html = handoutHTML({ title: '<b>x</b>', mine: true, slides: [{ title: 'a<script>', notes: '"n"', ask: ['q&', 'a'] }] });
  assert.ok(!html.includes('<script>') && html.includes('a&lt;script&gt;') && html.includes('q&amp;'));
});
