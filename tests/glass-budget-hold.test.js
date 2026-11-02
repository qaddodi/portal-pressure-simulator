// Bug sweep, 2 Nov 2026: over the GPU memory envelope, hold() let go of the cards' shared blur before its first use; the throw that
// followed took the glass out of the figure's (and the sinusoid's) canvas for the session, and every card stayed solid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('a shared blur in use this frame is never freed by the budget under it', () => {
  const g = src('glass-gl.js');
  const run = g.slice(g.indexOf('  function runShare(S, cr) {'), g.indexOf('  function drawInto('));
  const using = run.indexOf('S.usedIn = frameCount();');
  assert.ok(using > 0, 'marked in use for the frame');
  assert.ok(using < run.indexOf('S.hold = hold('), 'marked before hold() can look at the budget');
  assert.ok(using < run.indexOf('if (plan.same && S.t)'), 'marked on the kept path too');
  assert.match(run, /S\.hold = null;\n\s*if \(S\.usedIn === frameCount\(\)\) return;\n\s*freeShare\(G\)\(mine\);/);
});

test('a hook drawn over the figure or the sinusoid that throws once is kept', () => {
  for (const f of ['veins-gl.js', 'sinusoid-gl.js']) {
    const s = src(f);
    assert.doesNotMatch(s, /catch \(e\) \{ console\.warn\([^)]*\); tops\.splice/, `${f}: no hook taken out on one throw`);
    assert.match(s, /const TOP_FAILS = 30;/);
    assert.match(s, /try \{ t\.draw\(\); t\.fails = 0; \} catch \(e\) \{ topFailed\(t, e\); \}/);
  }
});
