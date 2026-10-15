// The case card: a new patient's case covers the figure while the patient loads, and Next lifts it before the slide goes on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SITES } from '../src/ui/decks/sites.js';
import { withOverview } from '../src/ui/decks.js';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('Sites and causes gives each site slide (and only those) a case', () => {
  const withCase = SITES.slides.filter((s) => s.vignette);
  assert.deepEqual(withCase.map((s) => s.site), ['pre', 'presin', 'sin', 'postsin', 'post', 'cardiac']);
  for (const s of withCase) assert.ok(s.preset && s.vignette.length < 220, s.id);
});

test('every case in every deck sits on a slide with a preset and stays under 220 characters', async () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  let n = 0;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    for (const deck of Object.values(await import(new URL(f, dir)))) {
      if (!deck?.slides) continue;
      // As presented (after the outline slide): the case slide itself loads a patient (the presenter's
      // changes()), so it is a new patient and the card shows, the deck's first slide included.
      for (const s of withOverview(deck).slides) {
        if (!s.vignette) continue;
        n++;
        assert.ok(s.preset && s.vignette.length < 220, `${f} ${s.id}`);
      }
    }
  }
  assert.ok(n >= 55, `only ${n} cases`);
});

test('Next lifts an open case card before it changes the slide', () => {
  assert.match(src, /const next = \(\) => \{\s*if \(caseLift\) \{ caseLift\(\); return; \}/);
  // Shown only going forward onto a new patient, and loaded behind the card before it lifts.
  assert.match(src, /s\.vignette && ui && !booting && !rev && !lap && to > lastAt && \(si !== shownState \|\| liveOff\)/);
});

test('behind the case card the camera glides once, to the slide\'s own framing; the tap makes no second move', () => {
  const run = src.slice(src.indexOf('async function caseRun('), src.indexOf('function caseShut('));
  // Loading the patient behind the card moves no camera (no zoom out to the fit first), and the card does not wait for the tap itself.
  assert.doesNotMatch(run, /camera\(/);
  assert.doesNotMatch(run, /lifted\)/);
  // The slide's own camera move runs with the card still up; the card lifts only once it has landed, just before the slide's cards come in.
  assert.match(src, /await settleRun\(\);\s*if \(!bare\) \{ await caseEnd\(cut\); if \(cut\(\)\) return; cardsIn\(\); \}/);
  assert.match(src, /if \(later\) \{ if \(!await morphTo\(st, cut\)\) return; shownState = own \? -1 : si; \}\s*await caseEnd\(cut\); if \(cut\(\)\) return;\s*bare = false; layout\(\); cardsIn\(\);/);
  const gl = src.indexOf("await until(() => cut() || !stage.gliding(), 1500)");
  assert.ok(gl > 0 && gl < src.indexOf('await caseEnd(cut); if (cut()) return;\n      bare = false'));
  // A move cut short, or one that ends otherwise, never leaves the card up.
  assert.match(src, /stage\.holdHome\(false\); caseShut\(\);/);
});

test('the case card is cards glass, enters and leaves whole, never resizing', () => {
  const rule = css.match(/\.pz-case \{[^}]*\}/)[0];
  assert.match(rule, /backdrop-filter: blur\(16px\) saturate\(1\.15\)/);
  assert.match(rule, /height: fit-content/);
  assert.match(rule, /transition: opacity \.45s var\(--ease\), transform \.45s var\(--ease\);/);
  assert.doesNotMatch(rule, /scale/);
});

test('the case text is 2.5x the teaching card body, and eases down only to fit the card before it enters', () => {
  const p = css.match(/\.pz-case-p \{[^}]*\}/)[0];
  assert.match(p, /font: 500 calc\(var\(--s-body\) \* var\(--case-k, 2\.5\)\)/);
  assert.match(src, /c\.scrollHeight > c\.clientHeight \+ 1; k -= 0\.1\) c\.style\.setProperty\('--case-k'[^\n]*\n\s*c\.classList\.add\('on'\)/);
});

test('the Case pill is set at the teaching card body size or larger, not the small site-tag size', () => {
  assert.match(css, /\.pz-case-tag \{[^}]*font-size: calc\(var\(--s-body\) \* 1\.15\)/);
});

test('the Case pill and the case text are centred on the card', () => {
  assert.match(css, /\.pz-case-tag \{[^}]*align-self: center/);
  assert.match(css.match(/\.pz-case-p \{[^}]*\}/)[0], /text-align: center/);
});
