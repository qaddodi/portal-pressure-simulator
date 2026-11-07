// The dock glide (3 Nov 2026, cards trailing): the card's glide to and from its dock is its translate (and its handle's) written by the
// frames on the eases' clock, in the frame the GPU glass reads it in. (As one animation each, 2 Nov, the browser's compositor moved the
// card from a clock of its own, which can stand a display frame from the page's time, and the glass trailed or led it by that frame.)
// A finger, a resize, a new glide and the teardown each end it where it stands (dockHalt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('the dock glide is written by the frames: the card and its handle take one translate each frame, no animation', () => {
  assert.match(pz, /get lvl\(\) \{ return glide \? glideLvl\(\) : lvlSet; \}, set lvl\(v\) \{ if \(glide\) dockHalt\(\); lvlSet = v; \}/);
  const glideSrc = pz.slice(pz.indexOf('function glideLvl() {'), pz.indexOf('function dockTo('));
  assert.doesNotMatch(glideSrc, /\.animate\(/, 'no compositor animation of the card');
  assert.match(glideSrc, /return g\.from \+ \(g\.to - g\.from\) \* ease\(u\);/, 'the same ease as the stepped glide');
  assert.match(glideSrc, /ui\.data\.style\.translate = t;\n\s+if \(g\.lip && ui\.lip\) ui\.lip\.style\.translate = t;\n\s+dock\.raf = nextFrame\(glideStep\);/);
  assert.match(glideSrc, /glide = \{ from, to, ms, t0: easeNow\(\), lip: !!\(l && d\.classList\.contains\('pz-sheet'\)\) \};/);
  assert.doesNotMatch(glideSrc, /get(Attribute|ComputedStyle|BoundingClientRect)|offset(Width|Height|Left|Top)/, 'a frame of the glide reads nothing');
});

test('a glide interrupted leaves the card where it stood, and a landed one where it was going', () => {
  const halt = pz.slice(pz.indexOf('function dockHalt() {'), pz.indexOf('function dockGlide('));
  assert.match(halt, /cancelFrame\(dock\.raf\)/);
  assert.match(halt, /lvlSet = v;/);
  assert.match(halt, /ui\.data\.style\.translate = dockPos\(v\); lipPaint\(\);/);
  const end = pz.slice(pz.indexOf('function glideEnd() {'), pz.indexOf('const lipSoon'));
  assert.match(end, /lvlSet = g\.to;/);
  assert.match(end, /ui\.data\.style\.translate = dockPos\(g\.to\); lipPaint\(\);/);
  for (const where of ["{ dockHalt(); dock.to = 0; dock.lvl = 0;", 'g.on = true; dock.drag = true; dockHalt();', 'clearTimeout(dock.fit); dockHalt(); dock.lvl = 0;']) {
    assert.ok(pz.includes(where), where);
  }
  assert.match(pz, /function dockTo\(to, ms = 380\) \{\n\s+dockHalt\(\);/);
});

test('a reduced-motion jump, a wide screen and a glide with nowhere to go are stepped by the frames as before', () => {
  assert.match(pz, /if \(ms && from !== to && ui && !ui\.data\.hidden && !wideSheet\(ui\.data\)\) \{/);
  assert.match(pz, /lvlSet = from \+ \(to - from\) \* ease\(u\);\n\s+dockPaint\(\);/);
  assert.match(pz, /ui\.data\.style\.translate = dockPos\(dock\.lvl\);/, 'a paint during a glide writes where the frames have the card now');
});
