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

test('the lobule counts a wheel and a trackpad pinch as a hand, as a scroll', () => {
  assert.match(lobule, /const handOn = \(\) => touches\.size > 0 \|\| !!cancelFlick \|\| \(!!wheelKind && performance\.now\(\) - wheelAt < 250\);/);
});

test('a trackpad pinch (Ctrl/⌘ + wheel) marks wheelAt, so the anatomy counts it as a hand like a wheel zoom or a pan', () => {
  const w = body(stage, 'const onWheel = ');
  const zoomBranch = w.slice(w.indexOf('if (ev.ctrlKey || ev.metaKey) {'), w.indexOf('if (now - wheelAt > 250) {\n      panFit = null;\n      const pad'));
  assert.match(zoomBranch, /wheelAt = now;\n\s+zoomAt\(ev\.clientX, ev\.clientY, Math\.exp\(-clamp\(dy, -50, 50\) \* 0\.01\), true\)/);
});
