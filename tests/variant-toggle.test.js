// Every variant toggle on a teaching card says what it changes (play-test, 16 Nov 2026, Carvedilol slide 5: None / Usual / Strong with no label).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleLabels } from '../src/ui/variant-toggle.js';
import { responseButtons } from '../src/ui/nsbb-response.js';
import { DECKS } from '../src/ui/decks.js';

test('the beta-blocker response toggle is named for what it changes', () => {
  const l = toggleLabels(responseButtons({ params: {} }));
  assert.equal(l.caption, 'Beta-blocker response');
  assert.match(l.aria, /beta-blocker works/);
});

test('each kind of toggle has a short caption and a longer spoken label', () => {
  const kinds = {
    lens: [{ label: 'Pressure', lens: 'pressure' }], gate: [{ label: 'Stent', gate: 1 }], tool: [{ label: 'Red', tool: { red: false } }],
    fenestrae: [{ label: 'Open', params: { fenestrae: 1 } }], treatment: [{ label: 'Stent', params: { tips: { on: true } } }],
  };
  const seen = new Set();
  for (const [k, compare] of Object.entries(kinds)) {
    const l = toggleLabels(compare);
    assert.ok(l.caption.length > 2 && l.caption.length <= 24 && l.aria.length >= l.caption.length, k);
    seen.add(l.caption);
  }
  assert.equal(seen.size, 5, 'one caption per kind');
});

test('every compare slide in every deck gets a caption (none is left with bare buttons)', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides || []) {
    const compare = s.compare || (s.response ? responseButtons(s) : null);
    if (!compare?.length) continue;
    n++;
    assert.ok(toggleLabels(compare).caption, `${d.id}: ${s.id}`);
  }
  assert.ok(n > 10, `found ${n} compare slides`);
});
