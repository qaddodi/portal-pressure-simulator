// Zooming and panning in the circuit and the lobule lagged (Mohammad, 25 Oct): per-frame work a hand's zoom did that it need not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const lobule = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const body = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); return src.slice(i, src.indexOf('\n  }\n', i)); };

test('a wheel or trackpad zoom finds the point under the pointer by arithmetic, never by getScreenCTM', () => {
  for (const head of ['function zoomAt(', 'function animZoomAt(']) {
    const fn = body(stage, head);
    assert.match(fn, /clientToVBFast\(cx, cy\)/, head);
    assert.doesNotMatch(fn, /clientToVB\(|\.getScreenCTM\(\)/, head);
  }
});

test('the figure\'s labels are carried further during a hand\'s zoom, never onto each other, and solved once it is let go', () => {
  assert.match(stage, /const SOLVE_ZOOM_HAND = 0\.35;/);
  const ul = body(stage, 'function updateLabels(');
  assert.match(ul, /hand = dz > SOLVE_ZOOM && gestureOn\(\)/);
  assert.match(ul, /dz > \(hand \? SOLVE_ZOOM_HAND : SOLVE_ZOOM\)/);
  assert.match(ul, /else if \(hand \|\| reslotted\) labelSettleSoon\(\);/);
  // (A carry past 5 % that would put a label on another, or on a callout, is solved at once.)
  assert.match(stage, /if \(carryClear && \(placed\.some\(\(p\) => !p\.dot && hits\(rectOf\(it\), p\)\) \|\| callouts\.some\(\(b\) => hits\(rectOf\(it\), b\)\)\)\) \{ stale = true; return false; \}/);
  // (Settled: solved again once no hand is on it, the labels gliding to their spots: labelGlide.)
  assert.match(body(stage, 'function labelSettleSoon('), /if \(gestureOn\(\)\) \{ labelSettleT = setTimeout\(settle, 120\); return; \}/);
});

test('the lobule counts a wheel and a trackpad pinch as a hand, as a scroll', () => {
  assert.match(lobule, /const handOn = \(\) => touches\.size > 0 \|\| !!cancelFlick \|\| \(!!wheelKind && performance\.now\(\) - wheelAt < 250\);/);
});

test('a hand\'s zoom carries the lobule\'s labels while every layout rule still holds, and lays them out once let go', () => {
  const ll = body(lobule, 'function layoutLabels(');
  assert.match(ll, /if \(follow\?\.ride && bKey === follow\.b && V\.k !== follow\.k && handOn\(\) && rideHolds\(fr0\)\) \{/);
  assert.match(ll, /follow\.ride = \{ labs:/);
  assert.match(lobule, /if \(labels\.style\.transform \|\| rough \|\| rides\) \{ rough = false;/);
  const rh = body(lobule, 'function rideHolds(');
  // (No label on another, on a zone's name or chip, on another's leader, on a structure or a card; leaders uncrossed; inside the free space.)
  for (const re of [/overlap\(boxes\[i\], boxes\[j\]\)/, /crosses\(\.\.\.leads\[i\], boxes\[j\]\)/, /cut\(\.\.\.leads\[i\], \.\.\.leads\[j\]\)/,
    /overlap\(boxes\[i\], o\) > 0 \|\| crosses\(\.\.\.leads\[i\], o\)/, /keep\.some\(\(q\) => into\(q, b\) > 0\)/, /R\.cards\.some\(\(c\) => overlap\(b, c\) > 0\)/,
    /R\.chips\.some\(\(c\) => inFree\(mv\(c\.a\)\)\)/, /if \(call && callRingAt\(fr\)\) return false;/]) assert.match(rh, re);
});
