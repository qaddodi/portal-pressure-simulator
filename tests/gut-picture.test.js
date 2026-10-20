import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// While the plate is down (the liver, spleen or fluid easing), the gut's mask follows the liver every frame, and a mask that
// changes repaints everything under it: the gut's 1,201 paths. So the gut shows as a picture of itself then, made at rest
// from the plate's copy, under the same live mask and opacity (Mohammad, 20 Oct: "why is it redrawing if there is nothing
// happening there").
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const fn = (name) => { const i = stage.indexOf(`function ${name}(`); assert.ok(i > 0, name); return stage.slice(i, stage.indexOf('\n  }\n', i)); };

test('the gut picture sits inside the gut group, under its mask and opacity, and hides the drawn groups only while it shows', () => {
  assert.match(stage, /const gGutPics = s\('g', \{ class: 'gut-pics', 'pointer-events': 'none', style: 'display:none' \}\);\n\s+gGut\?\.append\(gGutPics\);/);
  assert.match(css, /#organs > \.organ-gut\.gut-pic-on > \.organ \{ visibility: hidden; \}/);
  assert.match(stage, /mask: 'url\(#gutHide\)'/, 'the liver and spleen cuts stay live over the picture');
});

test('the picture is used only while the plate is down, in the look and art it was made from, near its resolution', () => {
  const ok = fn('gutPicOk');
  assert.match(ok, /plateOn\(\)/);
  assert.match(ok, /gutPic\.mut !== gutMut/);
  assert.match(ok, /gutPic\.look !== gutLook\(\)/);
  assert.match(ok, /if \(gutPic\.k \* 1\.15 < need \|\| gutPic\.k > need \* 2\) return false;/);
  assert.match(ok, /r\.kids\.every\(\(k\) => trOf\(k\) === trOf\(r\.kids\[0\]\)\)/, 'groups drawn as one image move together');
  assert.match(fn('syncGutPic'), /organDimMatrix\(1, plateSat\)/, 'the live grey of a lens is applied to the picture too');
  for (const f of ['drawVeins', 'syncPlateLook']) assert.match(fn(f), /syncGutPic\(\)/, f);
});

test('the picture is made at rest from the plate copy, never baked into the plate, and never measured by Fit', () => {
  const mk = fn('makeGutPic');
  assert.match(mk, /if \(!gGut \|\| !plateOn\(\) \|\| !CTM \|\| !plateCopy\?\.gut\?\.length \|\| plateCopy\.key !== plateStateKey\(\) \|\| plateCopy\.gutMut !== gutMut\) return;/);
  assert.match(mk, /await keep\.decode\(\);/, 'decoded before it can show');
  const build = fn('plateBuild');
  assert.match(build, /if \(gGut\.children\[i\] === gGutPics\) k\.setAttribute\('data-pc', 'drop'\); else k\.setAttribute\('data-gut', i\);/);
  assert.match(stage, /gGut \? gutKids\(\) : \[\]\)\) \{/);
  assert.match(stage, /schedulePlateView\(\); gutPicSoon\(\);/);
});

test('only the bowel floats on the fluid, so it is a run of its own', () => {
  assert.match(fn('gutRuns'), /k === organG\.bowel \|\| prev === organG\.bowel/);
  assert.match(stage, /putA\(organG\.bowel, 'transform', `translate\(0 \$\{/);
});
