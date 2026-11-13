// U2 (13 Nov 2026): one reading, one colour. A status written as text is its ink token (--ok-ink, --caution-ink, --danger-ink,
// --critical-ink), never a mix of its own in a rule: the play bar had the red of --critical at 80 %, the tile --danger, the chart's label --danger
// raw, the deck pills --danger at 82 %, so one HVPG was three reds. These checks keep the one table and its canvas twin together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './dom-shim.js';
import { INK_OF_SEV, INK_OF_RATE, INK_SHARE, TOKEN_OF_SEV, RATE_OF_SEV } from '../src/engine/pressure-cuts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('each status has an ink token, and a rating maps to the same one', () => {
  assert.deepEqual(Object.keys(INK_OF_SEV), ['ok', 'caution', 'danger', 'critical']);
  for (const [sev, rate] of Object.entries(RATE_OF_SEV)) assert.equal(INK_OF_RATE[rate], INK_OF_SEV[sev], sev);
  for (const sev of Object.keys(TOKEN_OF_SEV)) assert.equal(INK_OF_SEV[sev], `${TOKEN_OF_SEV[sev]}-ink`, sev);
});

test('the canvases mix each ink by the share the stylesheet gives its token', () => {
  const css = read('styles/tokens.css');
  for (const sev of Object.keys(INK_SHARE)) {
    const m = css.match(new RegExp(`--${sev}-ink:\\s*color-mix\\(in srgb,\\s*var\\(--${sev}\\)\\s*(\\d+)%`));
    assert.ok(m, `--${sev}-ink is a mix of --${sev}`);
    assert.equal(Number(m[1]) / 100, INK_SHARE[sev], `${sev}: the same share as util.js cssInk`);
  }
});

// A reading's colour as text is written once. What a rule may still mix by itself: the status pills (.pill: a darker ink, 80 %, on their own tint, which
// token-contrast.test.js holds to 4.5:1), the amber rate word, and the Doppler's direction word, which sits on the probe's dark panel and takes the pale red there.
const ALLOWED = [/\.pill\.(ok|warn|bad)\b/, /\.ab-rate\[data-dir="up"\]/, /\.dop-dir\b/];
test('no rule colours text with its own mix of the status colours', () => {
  const stray = [];
  read('styles/app.css').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/(?:^|[;{\s])color:\s*color-mix\(in srgb,\s*var\(--(ok|caution|danger|critical)\)\s*\d+%/g)) {
      if (!ALLOWED.some((re) => re.test(line))) stray.push(`styles/app.css:${i + 1} (${m[1]}): ${line.trim().slice(0, 90)}`);
    }
  });
  assert.deepEqual(stray, [], 'write var(--<status>-ink) instead (tokens.css)');
});

test('a tile or play bar number is the status ink, danger and critical apart', () => {
  const css = read('styles/app.css');
  assert.match(css, /\.metric\[data-sev="danger"\] \.val \{ color: var\(--danger-ink\); \}/);
  assert.match(css, /\.metric\[data-sev="critical"\] \.val \{ color: var\(--critical-ink\); \}/);
  assert.match(css, /\.pz-val\.tone\[data-rate="hi"\] \{ color: var\(--danger-ink\); \}/);
});

test('the play bar drops the two gradients while Tests shows them, and keeps the Lobule\'s flows', () => {
  const dock = read('src/ui/dock.js'), css = read('styles/app.css');
  assert.match(dock, /GRADIENT_PANES = new Set\(\['scope', 'hvpg', 'readouts'\]\)/);
  assert.match(dock, /classSoon\(app, 'tests-grad'/);
  assert.match(css, /\.app\.dock-open\.tests-grad[^{]*\.vdock:not\(\.mini\) \.readouts:not\(\.lob\) \{ display: none; \}/);
});

test('a reading never shows a dash to start with, and one being worked out keeps its last number', () => {
  assert.doesNotMatch(read('src/ui/tile-el.js'), /class: 'val' \}, '—'/);
  assert.doesNotMatch(read('src/ui/readouts-pane.js'), /class: 'val' \}, '—'/);
  assert.match(read('src/ui/util.js'), /!Number\.isFinite\(v\) && c\.shown != null\) \{ if \(!c\.stale\)/);
  assert.match(read('styles/app.css'), /\.metric \.val\.recompute[^{]*\{ opacity: \.5; \}/);
});
