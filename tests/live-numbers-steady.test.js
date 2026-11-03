// Live numbers keep one width and are never blank (2 Nov 2026: "the HVPG and PPG numbers disappear now and then and change size as
// they change number", the bottom bar and "a lot of places").
//
// Causes found, each pinned here (tests/e2e/live-numbers.mjs walks the same frame by frame in a real browser):
//  1. The GPU words set a "." 0.6 em wide where the page's tabular figures set it 0.55 em wide (Inter's tnum feature swaps the full stop,
//     comma, colon, signs, brackets and space too, not only the figures): a number drawn by the GPU was a pixel or two wider than the same
//     number in the page, so it shrank as it landed.
//  2. A readout the GPU words own was rolled by countTo's digit strips, which replace the element's children: the picture's canvases left
//     the page while the page's words were made clear, and the number was blank until the words landed (the QUIET wait).
//  3. Landing cleared the picture a frame after it showed the page's words: both at once (a wider number under a narrower one).
//  4. A draw into a box whose canvases had left the page reported "drawn": the words were made clear over nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGlyphs, loadMetrics, textWidth, layoutParagraph } from '../src/ui/text-gl.js';
import { GLYPHS, UPM } from '../src/ui/glyph-data.js';
import { METRICS } from '../src/ui/glyph-metrics.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const strip = (t) => t.replace(/\/\/.*$/gm, '');

test('tabular figures: every character the font sets on their pitch is on it, in the outlines and in the paragraph metrics', () => {
  for (const w of Object.keys(GLYPHS)) {
    const t = GLYPHS[w].tnum;
    for (const ch of '0123456789') assert.ok(t[ch], `figure ${ch} at ${w}`);
    // (A full stop, comma, colon and space are 550 units wide in the tabular set, not the 596 to 653 of the plain one; signs and
    // brackets sit on the figures' pitch.)
    for (const ch of '.,:; ') assert.equal(t[ch][0], 550, `"${ch}" at ${w} is 550 wide when tabular`);
    for (const ch of '+<=>~−×') assert.ok(t[ch][0] > 1300 && t[ch][0] < 1340, `"${ch}" at ${w} sits on the figures' pitch`);
    assert.ok(GLYPHS[w].chars['.'][0] > 550, 'the plain full stop is wider');
    for (const ch of Object.keys(t)) assert.ok(METRICS[w].tnum[ch] !== undefined, `"${ch}" is tabular in the paragraph metrics too`);
    assert.equal(METRICS[w].tnum['.'], 550, 'one width at every optical size');
  }
  assert.equal(UPM, 2048);
});

test('a tabular number is one width whatever its digits are, at every size and weight the bar and the cards use', async () => {
  await loadGlyphs();
  for (const weight of [400, 500, 600, 700]) {
    for (const size of [12, 14, 16, 18, 20, 24, 32]) {
      const o = { weight, size, tnum: true, ls: weight === 600 && size === 20 ? -0.3 : 0 };
      const ref = textWidth('0.0', o);
      for (const d of ['1.1', '2.4', '4.2', '6.9', '8.8', '9.9']) assert.equal(textWidth(d, o), ref, `${d} at ${weight}/${size}`);
      for (const d of ['10.0', '18.8', '99.9']) assert.equal(textWidth(d, o), textWidth('11.1', o), `${d} at ${weight}/${size}`);
      for (const d of ['−0.1', '−8.8']) assert.equal(textWidth(d, o), textWidth('−1.1', o), `${d} at ${weight}/${size}`);
      // (Not kerned between a figure and a stop, a comma, a colon or a sign: a clock "0:06", "1,234" and "+2.5" keep their pitch.)
      assert.equal(textWidth('12:34', o), textWidth('88:88', o));
      assert.equal(textWidth('+2.5', o), textWidth('+8.8', o));
    }
  }
});

test('a tabular "0.0" is the width the browser gives it (Chromium, Inter 600 at 20 px, letter spacing -0.015 em: 30.31 px)', async () => {
  await loadGlyphs();
  // (Measured in Chromium with the page's own style (styles/app.css: font-variant-numeric tabular-nums, the bar's .metric .v). The figures'
  // 12.92 each and the full stop's 5.375 add to 31.22, less three letter spaces.)
  const w = textWidth('0.0', { weight: 600, size: 20, tnum: true, ls: -0.3 }) - 0.3;   // (the browser's box keeps the last letter space too)
  assert.ok(Math.abs(w - 30.31) < 0.1, `${w}`);
});

test('the card paragraph metrics set a tabular full stop and sign on the figures\' pitch too', async () => {
  await loadMetrics();
  const run = (text, tnum) => layoutParagraph([{ text, weight: 600, size: 20, tnum }], 1000).lines[0].w;
  assert.ok(run('0.0', true) < run('0.0', false) || Math.abs(run('0.0', true) - run('0.0', false)) < 2, 'sane');
  assert.equal(run('1.1', true), run('8.8', true));
  assert.equal(run('12:34', true), run('88:88', true));
});

test('countTo does not roll a readout the GPU words own, and a roll never replaces a picture', () => {
  const u = strip(src('util.js'));
  assert.match(u, /!same && c\.shown != null && !reduceMotionMQ\.matches && el\.isConnected && hasBox\(el\) && !wordsOfEl\.has\(el\)\) \{ odoRoll/);
  assert.match(u, /export function odoSwap\([^)]*\) \{\n\s+if \(wordsOfEl\.has\(el\)\) return false;/);
});

test('gl-words: the picture shows only while both its canvases are in the page, and landing hands over in one frame', () => {
  const g = strip(src('gl-words.js'));
  assert.match(g, /const attached = \(S\) => !!S\.gl && S\.gl\.cv\.isConnected && \(S\.gl\.gpu\?\.canvas \? S\.gl\.gpu\.canvas\.isConnected : true\) && !!S\.txt && S\.txt\.parentNode === S\.el;/);
  assert.match(g, /\|\| !attached\(S\)\) \{ askLand\(S\); return; \}/, 'a draw never goes into a box whose canvases left the page');
  // The page's words land while the picture is still made clear; the picture is asked to clear and the class goes in that frame (drawn).
  assert.match(g, /function drawn\(S, ok\) \{\n\s+if \(S\.dead \|\| S\.asleep\) return;\n[^]*?if \(S\.handOver\) \{ if \(ok\) handOff\(S\); else handRetry\(S\); return; \}/, 'only a drawn clear hands the words over (EXT-VIS-1)');
  assert.match(g, /S\.handOver = true;[^]*?S\.gl\.paint\(\);/);
  const land = g.slice(g.indexOf('function land(S)'), g.indexOf('const askLand'));
  assert.doesNotMatch(land, /classList\.remove\('glw-on'\)/, 'land never uncovers the words in a frame of its own');
  // (A frame that never comes asks the clear again, a few times, and never hands the words to the page without a drawn clear; past the tries the
  // GPU draws the number again and keeps it: they are never clear for good, and never two numbers at once.)
  assert.match(g, /const HAND_MAX = \d+, HAND_TRIES = \d+;/);
  assert.match(g, /setTimeout\(\(\) => \{ S\.handT = 0; handRetry\(S\); \}, HAND_MAX\)/);
  assert.match(g, /if \(\+\+S\.handN > HAND_TRIES\) \{[^]*?askLand\(S\);/);
  assert.doesNotMatch(g, /setTimeout\([^\n]*handOff\(S\)/, 'no timer hands the words over by itself');
  // A new draw cancels a pending hand-over; disposing and sleeping let go of its timer.
  assert.match(g, /S\.pend = true;\n\s+S\.handOver = false;/);
  assert.match(g, /clearTimeout\(S\.handT\); S\.handT = 0; S\.handOver = false;/);
  // Landing into a box someone emptied puts both canvases back with the words.
  assert.match(g, /\[S\.gl\.cv, S\.gl\.gpu\?\.canvas\]\.filter\(Boolean\)/);
});
