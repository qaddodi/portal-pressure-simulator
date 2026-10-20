// Zooming into a sinusoid, the neighbouring lobules come up to full around the lobule rather than the lobule view's faded
// surround being carried across the screen: the zoom showed the lobule's own edges over a blank page, a cut-out (20 Oct, Mohammad).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const pt = js.slice(js.indexOf('function paintTissue('), js.indexOf('function diveCopy('));

test('the neighbours ease to full on the way into a sinusoid and back to quiet as the way out lands, never at once', () => {
  assert.match(js, /const sw = sinTo === 1 \|\| sinU > 0\.2 \? 1 : 0;/);
  assert.match(js, /surK = reduce\.matches \? sw : sw \? Math\.min\(1, surK \+ dtm \/ 300\) : Math\.max\(0, surK - dtm \/ 300\);/);
  assert.match(js, /if \(fade === 0 && was > 0\) \{ surK = 0;/, 'a closed lobule opens with its quiet surround');
});

test('the scaled lobule is redrawn while the neighbours ease, then left to the compositor', () => {
  assert.match(js, /if \(scaled && diveDrawn && flowA <= 0 && !surEasing\(\)\) return false;/);
  assert.match(js, /flowA\.toFixed\(2\), surK\.toFixed\(3\)\]\.join\('\|'\)/, 'each step of the ease is a new picture');
  assert.match(js, /\(flowA === 0 \|\| flowA === 1\) && !surEasing\(\)\) \{/, 'the loop keeps asking for frames while it eases');
  assert.match(pt, /Object\.values\(fieldState\(\)\)\.join\(','\), surK\.toFixed\(3\),/, 'the tissue is drawn again at each step');
});

test('at full, the whole screen past the lobule is the neighbouring tissue, and at rest the surround is unchanged', () => {
  // Inside the fade's edge the unquieted tile over the quiet one, past it over the page's colour, both at sk.
  assert.match(pt, /if \(sk && t\.cv\?\.width\) \{ c\.globalAlpha = sk; fieldFill\(c, t, sx \* dpr, sy \* dpr, rd, W \* dpr, H \* dpr\); c\.globalAlpha = 1; \}/);
  assert.match(pt, /if \(sk && reach > fOut \+ 1\) \{/);
  assert.match(pt, /c\.clip\('evenodd'\); c\.globalAlpha = sk; fieldFill\(c, t, ocx \* dpr, ocy \* dpr, rdv, W \* dpr, H \* dpr\); c\.restore\(\);/);
  // The focus fade into the page gives way as they come up.
  assert.match(pt, /c\.globalAlpha = 1 - sk; if \(fIn - 1 < reach\) fieldFade\([^\n]*\); c\.globalAlpha = 1;/);
});
