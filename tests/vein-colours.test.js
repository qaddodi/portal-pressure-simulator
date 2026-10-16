// One colour per gut vein across the app: the trace/slide/pill tokens (--tr-smv, --tr-imv, --tr-sv) are the
// Blood origin lens's own tokens (--origin-*), which the lens legend (main.js) and the GPU streams (util.js bloodColors) read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('SMV, IMV and splenic vein tokens are the Blood origin lens tokens', () => {
  const tokens = read('styles/tokens.css');
  for (const [k, o] of [['smv', 'smv'], ['imv', 'imv'], ['sv', 'spleen']]) {
    const found = [...tokens.matchAll(new RegExp(`--tr-${k}: ([^;]+);`, 'g'))].map((m) => m[1]);
    assert.ok(found.length >= 3, `--tr-${k} is set in the light, dark and auto-dark themes`);
    for (const f of found) assert.equal(f, `var(--origin-${o})`, `--tr-${k}`);
    assert.match(tokens, new RegExp(`--origin-${o}: #[0-9A-F]{6};`, 'i'));
  }
  assert.match(read('src/ui/main.js'), /const ORIGIN_CSS = \['smv', 'imv', 'spleen', 'artery', 'systemic'\]\.map\(\(o\) => `var\(--origin-\$\{o\}\)`\)/);
  assert.match(read('src/ui/util.js'), /originCol: \['smv', 'imv', 'spleen', 'artery', 'systemic'\]\.map\(\(o\) => cssRGB01\(`--origin-\$\{o\}`\)\)/);
  for (const f of ['src/ui/stage.js', 'src/ui/lobule-zoom.js']) assert.ok(!/originCol: \[\[/.test(read(f)), `${f}: no copy of the origin colours`);
});

test('wedge (sinusoid) colour is orchid: its own hue, between the splenic violet and the portal-pressure pink, with no old purple or lime left', () => {
  const tokens = read('styles/tokens.css');
  const wedge = [...tokens.matchAll(/--tr-wedge: (#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase());
  assert.deepEqual(wedge, ['#A52DA9', '#DA7EDD', '#DA7EDD'], 'light, dark, auto-dark');
  const hueOf = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); const t = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (t * 60 + 360) % 360; };
  const gap = (a, b) => Math.abs(((hueOf(a) - hueOf(b) + 540) % 360) - 180);
  // Orchid sits between portal violet (hue ~255) and pink (~335); keep a clear margin from both, and from the neutral portal vein.
  for (const w of wedge) for (const [c, n] of [['#7D5CDB', 'splenic violet'], ['#7D6FB6', 'portal vein'], ['#B01E62', 'portal pink'], ['#F0649E', 'portal pink (dark)']]) assert.ok(gap(w, c) > 25, `${w} is clear of the ${n}`);
  for (const f of ['src/ui/presenter.js', 'src/ui/hvpg-proc.js', 'styles/tokens.css']) assert.ok(!/#A68CF2|#7650C8|#668C0A|#A9D14A/i.test(read(f)), `${f}: old wedge purple gone`);
});
