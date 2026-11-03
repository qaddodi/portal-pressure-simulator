// The dock glide (2 Nov 2026, alloc thread): the card's glide to and from its dock is one animation of its translate (and its handle's),
// played by the browser, not a style string written each frame. Its level is read from the animation's clock; a finger, a resize, a new
// glide and the teardown each end it where it stands (dockHalt). A reduced-motion jump and a wide screen's glide (the translate keeps its
// rise in a calc) are still stepped by the frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('the dock glide is one animation per card and handle, its level read from the animation\'s clock', () => {
  assert.match(pz, /get lvl\(\) \{ return glide \? glideLvl\(\) : lvlSet; \}, set lvl\(v\) \{ if \(glide\) dockHalt\(\); lvlSet = v; \}/);
  assert.match(pz, /const u = ct > 0 \? Math\.min\(1, ct \/ g\.ms\) : 0;\n\s+return g\.from \+ \(g\.to - g\.from\) \* ease\(u\);/, 'the same ease as the stepped glide');
  assert.match(pz, /glide = \{ from, to, ms, a: d\.animate\(dockKeys, dockTiming\), b: l && d\.classList\.contains\('pz-sheet'\) \? l\.animate\(dockKeys, dockTiming\) : null \};/);
  assert.match(pz, /for \(let i = 0; i <= DOCK_KEYS; i\+\+\) dockEase\[i\] = ease\(i \/ DOCK_KEYS\);/, 'sampled from the stepped glide\'s own ease');
  assert.doesNotMatch(pz, /dockTiming = \{[^}]*easing/, 'linear between the samples');
});

test('the card rests at the glide\'s end while it plays, and a glide interrupted leaves it where it stood', () => {
  assert.match(pz, /ui\.data\.style\.translate = dockPos\(glide \? glide\.to : dock\.lvl\);/);
  const halt = pz.slice(pz.indexOf('function dockHalt() {'), pz.indexOf('function dockGlide('));
  assert.match(halt, /cancelFrame\(dock\.raf\)/);
  assert.match(halt, /lvlSet = v;/);
  assert.match(halt, /g\.a\.cancel\(\); g\.b\?\.cancel\(\);/);
  assert.match(halt, /ui\.data\.style\.translate = dockPos\(v\); lipPaint\(\);/);
  for (const where of ["{ dockHalt(); dock.to = 0; dock.lvl = 0;", 'g.on = true; dock.drag = true; dockHalt();', 'clearTimeout(dock.fit); dockHalt(); dock.lvl = 0;']) {
    assert.ok(pz.includes(where), where);
  }
  assert.match(pz, /function dockTo\(to, ms = 380\) \{\n\s+dockHalt\(\);/);
});

test('a reduced-motion jump, a wide screen and a glide with nowhere to go are stepped by the frames', () => {
  assert.match(pz, /if \(ms && from !== to && ui && !ui\.data\.hidden && ui\.data\.animate && !wideSheet\(ui\.data\)\) \{/);
  assert.match(pz, /lvlSet = from \+ \(to - from\) \* ease\(u\);\n\s+dockPaint\(\);/);
});
