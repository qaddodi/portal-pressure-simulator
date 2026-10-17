// Repaint audit fixes A, E and D (17 Oct, review/repaint-audit-17oct.md): work that ran each frame for nothing on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('A: the new cards waiting unseen for the camera take their numbers at once, not counting through the glide', () => {
  const js = read('../src/ui/presenter.js');
  assert.match(js, /const ms = fresh \|\| \(bare && ui\.root\.classList\.contains\('pz-prep'\)\) \? 0 : undefined;/);
  // (bare is set before the words come in, so wordsIn sees it)
  assert.ok(js.indexOf('bare = !booting && !!ui && !ct;') < js.indexOf('wordsIn(s, said, to, swap, lap, st);'));
});

test('E: while the view moves the outlines are drawn straight onto the whole repaint, and their layer is made again once still', () => {
  const js = read('../src/ui/veins-gl.js');
  const body = js.slice(js.indexOf('    composite(look'), js.indexOf('get canLines()'));
  assert.match(body, /const moving = mk !== lastMk;/);
  assert.match(body, /layer = hard && !cath && !moving/);
  assert.match(body, /else if \(moving\) \{ lineKey = ''; full = true; \}/, 'a moving frame is a whole repaint, and the layer is rebuilt when still');
  assert.match(body, /if \(hard && !layer\) gpuProbe\.time\(gl, 'outlines', \(\) => drawLines\(m, false\)\);/, 'drawn last, over the picture');
});

test('D: Doppler and FibroScan learn whether they are on screen from an observer, and a hidden Doppler never draws', () => {
  const dop = read('../src/ui/doppler.js'), fib = read('../src/ui/fibroscan.js');
  for (const js of [dop, fib]) {
    assert.match(js, /new IntersectionObserver/);
    assert.doesNotMatch(js.slice(js.indexOf('function loop(')), /offsetParent\)/, 'the loop no longer reads offsetParent itself');
  }
  assert.match(dop, /if \(!frame \|\| !shown\(\)\)/);
  assert.match(dop, /Number\.isFinite\(t\) &&/, 'a strip with no word laid out keeps its height');
  assert.match(dop, /!Number\.isFinite\(H\)/, 'never an image of infinite height');
  assert.doesNotMatch(dop, /\$\{report\.clientWidth\}\|\$\{cv\.clientWidth\}/, 'the strip key reads the observed widths');
  assert.match(fib, /sized\.r = w \/ cv\.clientWidth \|\| 1;/);
  assert.doesNotMatch(fib, /\(w \/ cv\.clientWidth \|\| 1\)/, 'the ratio is read with the size, not every frame');
});
