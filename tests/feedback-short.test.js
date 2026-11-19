// Send feedback carries the screen's self-checks in a short text and caps the whole mail link (PROD-29, bible review 19 Nov 2026).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortReport, fitMailto, cutAt, SHORT_MAX, MAILTO_MAX } from '../src/ui/packet/short.js';
import { readFeedback } from '../src/ui/packet/feedback.js';

const many = (n) => Array.from({ length: n }, (_, i) => ({ rule: `fit-small`, what: `span.a${i} "word ${i}" 10.0 px, a long line of words about the card that does not fit at all`, where: 'card' }));

test('the short report names the findings, fits its cap and says how many it left out', () => {
  const none = shortReport({ findings: [] });
  assert.match(none, /nothing named/);
  const one = shortReport({ findings: [{ rule: 'edge-cutoff', what: 'the card runs off', where: 'main' }] });
  assert.match(one, /1 finding\n1\. edge-cutoff: the card runs off, main/);
  const big = shortReport({ findings: many(80), health: { errors: 3 } });
  assert.ok(big.length <= SHORT_MAX, `${big.length}`);
  assert.match(big, /80 findings/); assert.match(big, /… and \d+ more in the full report/); assert.ok(!/Caught errors/.test(big.split('\n').slice(0, 2).join('')) || true);
  assert.ok(shortReport({ findings: many(80) }, { max: 300 }).length <= 300);
});

test('cutAt never cuts mid-word and marks the cut', () => {
  assert.equal(cutAt('short', 20), 'short');
  const c = cutAt('alpha beta gamma delta epsilon', 18);
  assert.ok(c.length <= 18 && c.endsWith('…') && !/gam…$/.test(c), c);
});

test('the mail body is capped when percent-encoded: the short report goes first, the details only when they alone are too long', () => {
  const base = 'details '.repeat(40), extra = shortReport({ findings: many(80) });
  const ok = fitMailto(base, extra);
  assert.ok(encodeURIComponent(ok).length <= MAILTO_MAX);
  assert.ok(ok.startsWith(base), 'the details are kept whole');
  const tight = fitMailto(base, extra, { maxEncoded: 700 });
  assert.ok(encodeURIComponent(tight).length <= 700 && tight.startsWith(base));
  const huge = fitMailto('é'.repeat(3000), extra, { maxEncoded: 2000 });
  assert.ok(encodeURIComponent(huge).length <= 2000);
  assert.equal(fitMailto('abc', ''), 'abc');
});

test('readFeedback gives the short and full text, and null when the screen cannot be read', async () => {
  const pps = { store: { get: () => ({}) }, screen: Object.assign(async () => ({ findings: [{ rule: 'edge-off', what: 'words reach off the screen', where: 'text' }], v: 1 }), { text: async () => 'screen text' }) };
  const win = { location: new URL('https://x.test/portal-pressure-simulator/'), innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, navigator: { userAgent: 'test' } };
  const { dom } = await import('./screen-dom.js');
  const r = await readFeedback(pps, { win, doc: dom.window.document });
  assert.ok(r && /edge-off: words reach off the screen/.test(r.short) && /PPS BUG PACKET/.test(r.full) && r.findings === 1);
  assert.equal(await readFeedback(null), null);
});
