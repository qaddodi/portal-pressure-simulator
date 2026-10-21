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
  const ok = fn('gutPicOk'), pick = fn('gutPicFor');
  assert.match(ok, /plateOn\(\)/);
  assert.match(ok, /const pic = gutPicFor\(vdpr \* CTM\.sc\);\n\s+if \(!pic\) return false;/);
  // Each kept picture: of the art and colours now, near its resolution (never more than 1.15x softer or 2x sharper).
  assert.match(pick, /if \(p\.mut !== gutMut \|\| p\.look !== gutLook\(\)\) continue;\n\s+if \(p\.win\) \{ if \(!win \|\| p\.k \* 1\.15 < win\.scale \|\| p\.k > need \* 2 \|\| !gutWinHolds\(p, win\)\) continue; \}\n\s+else if \(p\.k \* 1\.15 < need \|\| p\.k > need \* 2\) continue;/);
  // Past the cap, a picture of the view's part of the gut, as sharp as the organs' own picture of the view, while it holds the view.
  assert.match(pick, /const win = need > GUT_CAP \* 1\.15 \? gutWin\(0\) : null;/);
  // Eight are kept at most: the new one and the seven before, of the same art and colours (the rest are let go): every zoom step,
  // and of the view's part only the newest.
  const mk = fn('makeGutPic');
  assert.match(mk, /const kept = gutPics\.filter\(\(p\) => p\.mut === mut && p\.look === look && \(p\.win \? !win : p\.k !== k\)\)\.slice\(-7\);/);
  assert.match(mk, /const k = Math\.min\(g\.scale, 4094 \/ w, 4094 \/ h, Math\.sqrt\(4\.2e6 \/ \(w \* h\)\)\);/, 'a texture side within 4096, within 4.2 MP');
  assert.match(mk, /for \(const p of gutPics\) if \(!kept\.includes\(p\)\) for \(const r of p\.runs\) URL\.revokeObjectURL\(r\.url\);\n\s+gutPics = \[\.\.\.kept, gutPic\];/);
  assert.match(fn('syncGutPic'), /const pic = gutPicFor\(vdpr \* CTM\.sc\);\n\s+if \(pic !== gutPic\) \{ gutPic = pic; gGutPics\.replaceChildren\(\.\.\.pic\.runs\.map\(\(r\) => r\.img\)\); \}/);
  assert.match(ok, /r\.kids\.every\(\(k\) => trOf\(k\) === trOf\(r\.kids\[0\]\)\)/, 'groups drawn as one image move together');
  assert.match(fn('syncGutPic'), /organDimMatrix\(1, plateSat\)/, 'the live grey of a lens is applied to the picture too');
  for (const f of ['drawVeins', 'syncPlateLook']) assert.match(fn(f), /syncGutPic\(\)/, f);
});

test('the picture is made at rest from the plate copy, never baked into the plate, and never measured by Fit', () => {
  const mk = fn('makeGutPic');
  assert.match(mk, /if \(!gGut \|\| !plateOn\(\) \|\| !CTM \|\| morphTarget !== 0 \|\| morph > 0 \|\| !plateCopy\?\.gut\?\.length \|\| plateCopy\.key !== plateStateKey\(\) \|\| plateCopy\.gutMut !== gutMut\) return;/);
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

test('the rectum fades out at its end through a mask on the colon\'s own group, so the plate copy, the GPU raster and the gut picture all show it', () => {
  // (As the esophagus's esoFade: the mask rides on the organ's group, so every copy of the group carries it.)
  assert.match(stage, /<linearGradient id="rectFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="\$\{RECTUM_FADE\[0\]\}" x2="0" y2="\$\{RECTUM_FADE\[1\]\}"><stop offset="0" stop-color="#fff"\/><stop offset="1" stop-color="#fff" stop-opacity="0"\/>/);
  assert.match(stage, /<mask id="rectFade" maskUnits="userSpaceOnUse" x="0" y="0" width="\$\{VIEW\.w\}" height="1100"><rect [^>]*fill="url\(#rectFadeG\)"\/>/);
  assert.match(stage, /if \(o\.id === 'colon'\) g\.setAttribute\('mask', 'url\(#rectFade\)'\);/);
  // The gut's mask no longer cuts the rectum off at 1040: it runs to 1080, past the end of the art and the fade.
  assert.match(stage, /<mask id="gutHide"[^>]*height="660"><rect [^>]*height="660" fill="#fff"\/>/);
  const rect = stage.match(/const GUT_RECT = \[(\d+), (\d+), (\d+), (\d+)\]/).slice(1).map(Number);
  const [, y1] = readFileSync(new URL('../src/ui/anatomy.js', import.meta.url), 'utf8').match(/RECTUM_FADE = \[(\d+), (\d+)\]/).slice(1).map(Number);
  assert.equal(y1, 1075);
  assert.ok(rect[1] + rect[3] >= y1, 'the gut picture reaches the end of the fade');
  // the outlines and glows over the rectum fade on the same span: every organ outline draw carries it, and the shader reads it
  assert.equal((stage.match(/endFade: RECTUM_FADE/g) || []).length, 2, 'warm glow, and the outline and glow passes');
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /uniform vec2 endFade;/);
  assert.match(gl, /gl\.uniform2f\(U\.endFade, d\.endFade \? d\.endFade\[0\] : 0/);
});

test('the gut pictures for the zooms further out, down to the whole figure, are made too', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  // (Mohammad's iPhone ?perf recording, 21 Oct: a slide's camera glided out while the organs eased: "zoomed out past it".)
  assert.match(stage, /makeGutPic\(\)\.then\(gutPicsOut\)/);
  const out = stage.slice(stage.indexOf('async function gutPicsOut'), stage.indexOf('async function makeGutPic'));
  assert.match(out, /const lo = gutStep\(vdpr \* CTM\.sc \/ vt\.k \* Math\.min\(1, homeAt\?\.k \?\? 1\), GUT_CAP\);/);
  assert.match(out, /const top = vdpr \* CTM\.sc > GUT_CAP \* 1\.15 \? GUT_CAP \* Math\.SQRT2 : gutStep\(vdpr \* CTM\.sc, GUT_CAP\);/);
  assert.match(out, /for \(let k = top \/ Math\.SQRT2; k >= lo \* 0\.99; k \/= Math\.SQRT2\) \{ if \(!leftAlone\(1000\)\) return; await makeGutPic\(k \/ 1\.01\); \}/);
});
