// R02: a superseded move gives back what it took but changes nothing shared; zoom-close continuations check their change and deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const between = (a, b) => PZ.slice(PZ.indexOf(a), PZ.indexOf(b, PZ.indexOf(a)));

test('transition: its holds are leases given back always; shared visible state only while it is the current change of the same talk', () => {
  const tr = between('async function transition(to) {', 'async function transitionRun(');
  assert.match(tr, /const homeOff = homeLease\.take\(\), creditOff = creditLease\.take\(\);/);
  const fin = tr.slice(tr.indexOf('} finally {'));
  assert.ok(fin.includes('homeOff();') && fin.includes('creditOff();'), 'both holds are given back whatever ended the move');
  assert.match(fin, /const mine = !!tx\?\.live\(\) && deck === deck0 && ui === ui0;/);
  for (const shared of ['caseShut()', 'cardsIn()', 'figureIn()', 'turnDone()', 'tx.end()', 'keepNow = NO_KEEP']) {
    const at = fin.indexOf(shared);
    assert.ok(at > 0, shared);
    assert.match(fin.slice(Math.max(0, at - 110), at), /mine/, `${shared} is gated by ownership`);
  }
  assert.doesNotMatch(fin, /stage\.holdHome\(false\)|creditHolds/, 'no uncounted release');
});

test('a zoom-close continuation of go() and toBeat() does nothing for a change or deck that is gone', () => {
  assert.match(between('function go(i) {', 'const PREP_MS'), /const d0 = deck; ui\.zoom\.close\(\)\.then\(\(\) => \{ if \(deck !== d0 \|\| !txnLive\(tx\) \|\| txn !== tx\) return;/);
  assert.match(between('function toBeat(k) {', 'async function run() {'), /if \(deck !== d0 \|\| txn !== t0 \|\| !txnLive\(t0\)\) return;/);
});

test('the camera and credit holds of a beat, a flip and a zoom glide are leases too', () => {
  assert.doesNotMatch(PZ, /creditHolds/);
  assert.equal([...PZ.matchAll(/stage\.holdHome\(/g)].length, 2, 'only the lease itself holds and lets go of the home');
  assert.equal([...PZ.matchAll(/homeLease\.take\(\)/g)].length, 3);
});

test('a talk that ends shuts its own case card', () => {
  assert.match(between('  function stopNow(', '  // When the show ends, the app returns'), /throwStop\(el\);\n\s+caseShut\(\);/);
});
