// A toast drawn on the GPU (toast-gl.js, widget-gl.js): its layout is script, from Inter's own advances, with no page measure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wrapBalanced, layoutToast } from '../src/ui/toast-gl.js';
import { measure } from '../src/ui/glyph-measure.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('wrapBalanced: even lines, none wider than the room, never one word left alone', () => {
  const font = '600 17px Inter', out = [];
  const msg = 'This device could not start its graphics, so the vessels cannot be drawn.';
  const widest = wrapBalanced(msg, font, 300, 0, out);
  assert.ok(out.length >= 2);
  assert.equal(out.join(' '), msg);
  for (const l of out) assert.ok(measure(l, font) <= 300 + 0.01, l);
  assert.ok(widest <= 300 + 0.01);
  // balanced: the shortest line is not a small share of the longest (greedy would leave "drawn." alone)
  const ws = out.map((l) => measure(l, font));
  assert.ok(Math.min(...ws) > 0.5 * Math.max(...ws), ws.join(', '));
  // the mark takes room on the first line
  const withMark = [];
  wrapBalanced(msg, font, 300, 24, withMark);
  assert.ok(measure(withMark[0], font) + 24 <= 300 + 0.01);
  // a word longer than the line breaks where it must
  const long = [];
  wrapBalanced('Antidisestablishmentarianism-and-more', font, 100, 0, long);
  assert.ok(long.length >= 2);
  for (const l of long) assert.ok(measure(l, font) <= 100 + 0.01);
});

// (The docked card and the plain toast with a ×, and their two layout tests, went with the top wrap: index.html keeps the one wrap, #toastsFoot,
// and every message is laid out as the foot card, which the note tests below cover. This one keeps the width rule for a long plain message.)
test('layoutToast: a long plain message wraps inside the window and grows taller than a short one', () => {
  const s = layoutToast({ msg: 'Saved', bad: false, acts: null, W: 1440 });
  assert.equal(s.lines.length, 1); assert.ok(s.w < 120);
  const l = layoutToast({ msg: 'A message long enough that it has to wrap onto more than one line at this width, which is narrow.', bad: false, acts: null, W: 390 });
  assert.ok(l.w <= 390 - 24 + 0.01); assert.ok(l.lines.length >= 2);
  assert.ok(l.h > s.h);
});

test('the toast is drawn on the GPU: the page lays it out in script, reads nothing, and its own paint gives way only once the GPU has drawn', () => {
  const u = src('src/ui/util.js'), fit = u.slice(u.indexOf('function toastFit('), u.indexOf('const toastBuildRest'));
  assert.match(fit, /layoutToast\(/); assert.match(fit, /widgetGL\(t,/);
  assert.doesNotMatch(fit, /scrollHeight|scrollWidth|clientHeight|clientWidth|offsetHeight|offsetWidth/, 'no page measure');
  const w = src('src/ui/widget-gl.js');
  assert.match(w, /classList\.add\('wgl-on'\)/);
  assert.match(w, /ctx\.onGPU !== true\) return false/, 'a GPU that cannot draw leaves the widget as the page paints it');
  const css = src('styles/app.css');
  assert.match(css, /\.toast\.wgl-on/);
});

test('the toast wears the cards\' frosted glass: listed to the glass, its tint declared in CSS, and its picture draws the card whole only where no glass comes', () => {
  const u = src('src/ui/util.js'), m = src('src/ui/main.js'), css = src('styles/app.css'), t = src('src/ui/toast-gl.js');
  assert.match(u, /export const TOASTS = \[\]/); assert.match(u, /TOASTS\.push\(t\)/); assert.match(u, /TOASTS\.splice/);
  assert.match(m, /glass\?\.add\(\(\) => TOASTS/);
  assert.match(css, /\.toast \{ --gl-glass: 1; --gl-tint:/); assert.match(css, /\.toast-wrap \.toast\[data-gl\]/);
  assert.match(css, /prefers-reduced-transparency: reduce\) \{ \.toast \{ --gl-glass: 0/);
  assert.match(u, /data-gl-wait/);
  assert.match(t, /if \(!glass\) \{/);
});

test('a preset note: a dot, the name and its lines, as wide as the words need up to 420 px, no ×, fixed once laid out', async () => {
  const { PRESETS } = await import('../src/engine/scenario.js');
  for (const p of PRESETS) {
    assert.ok(p.note && p.note.length > 20 && p.note.length < 130, `${p.id}: a short note`);
    assert.ok(!/[—]/.test(p.note), `${p.id}: no em dash`);
    for (const W of [320, 390, 1100]) {
      const L = layoutToast({ msg: p.label, sub: p.note, bad: false, acts: undefined, W });
      assert.ok(L.w <= Math.min(420, W - 24) && L.w > 120, `${p.id} at ${W}: ${L.w}`);
      assert.equal(L.x, undefined, 'no ×');
      assert.ok(L.dot && L.dot.r === 4);
      assert.ok(L.h >= 56 && L.h <= 130, `${p.id} at ${W}: ${L.h}`);
      for (const ln of L.lines) assert.ok(ln.x + measure(ln.text, ln.font || '600 14px Inter') <= L.w - 14 + 0.5, `${p.id}: ${ln.text}`);
    }
  }
  const again = layoutToast({ msg: 'Healthy', sub: PRESETS[0].note, W: 390 });
  assert.deepEqual(again.lines.map((l) => l.text), layoutToast({ msg: 'Healthy', sub: PRESETS[0].note, W: 390 }).lines.map((l) => l.text));
});

test('a preset note rests in its own wrap at the foot, never over the top bars', () => {
  const html = src('index.html'), css = src('styles/app.css'), util = src('src/ui/util.js'), main = src('src/ui/main.js');
  assert.match(html, /id="toastsFoot"/);
  assert.match(css, /\.toast-wrap\.foot \{[^}]*bottom: var\(--toast-foot/);
  assert.doesNotMatch(util, /placeToasts|getElementById\('toasts'\)/, 'the top wrap is gone');
  assert.match(main, /--toast-foot/);
  assert.match(main, /watch: foot, before: foot/);
  assert.doesNotMatch(main, /\$\('#toasts'\)/);
});

test('every message is a note: an error takes the mark in the dot\'s place, buttons sit under the words inside the card', () => {
  const W = 390;
  const err = layoutToast({ msg: 'The model stopped. Reload, or restart this patient.', bad: true, acts: ['Reload'], W });
  assert.ok(err.mark && !err.dot && err.x === undefined);
  assert.equal(err.btns.length, 1);
  const b = err.btns[0];
  assert.ok(b.x >= 32 && b.x + b.w <= err.w - 14 + 0.5 && b.y + b.h <= err.h - 10, JSON.stringify([b, err.w, err.h]));
  for (const ln of err.lines) assert.ok(ln.y < b.y);
  const plain = layoutToast({ msg: 'The Warren shunt is already in place.', W });
  assert.equal(plain.weight, 500);
  assert.ok(plain.h >= 40 && plain.h <= 60 && plain.dot);
  assert.match(src('src/ui/util.js'), /const wrap = document\.getElementById\('toastsFoot'\)/);
});

test('index.html has one toast wrap, the foot card, and no stylesheet rule docks a wrap', () => {
  const html = src('index.html');
  assert.equal((html.match(/class="toast-wrap/g) || []).length, 1);
  assert.equal((html.match(/id="toasts"/g) || []).length, 0);
  assert.equal((html.match(/id="toastsFoot"/g) || []).length, 1);
  assert.doesNotMatch(src('styles/app.css'), /toast-wrap\.docked|toast-tall/);
});

test('the presenter\'s toasts raised inside a talk carry present: true (a pop-up block, a typed slide number, a copied link)', () => {
  const p = src('src/ui/presenter.js');
  const util = src('src/ui/util.js');
  assert.match(util, /!present && document\.getElementById\('app'\)\?\.classList\.contains\('presenting'\)/, 'toast() drops a message without present while presenting');
  for (const re of [/onBlocked: \(\) => toast\('Allow pop-ups to open the presenter view', '', \{ present: true \}\)/, /toast\(`Slide \$\{digits\}: press Enter`, '', \{ present: true \}\)/, /toast\(msg, '', \{ present: true \}\)/]) assert.match(p, re);
  // every other toast( in presenter.js is an error ('bad', always shown) or sits in the script library, which is not inside a talk
  const lib = p.indexOf('// ── Library (the menu');
  assert.ok(lib > 0);
  const loose = [];
  p.split('\n').forEach((line, i) => {
    if (!/\btoast\(/.test(line) || /present: true|'bad'/.test(line) || /^\s*(\/\/|\*)/.test(line) || /^import /.test(line)) return;
    if (p.split('\n').slice(0, i).join('\n').length < lib) loose.push(i + 1);
  });
  assert.deepEqual(loose, [], 'a quiet toast in a talk would be swallowed: lines ' + loose.join(', '));
});
