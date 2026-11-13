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

test('layoutToast docked: 52 px for a short line, 84 for longer words or buttons; words centred; the largest size that fits', () => {
  const short = layoutToast({ msg: 'Link copied', bad: false, acts: null, docked: true, W: 390 });
  assert.equal(short.w, 366); assert.equal(short.h, 52); assert.equal(short.px, 20); assert.equal(short.lines.length, 1);
  const mid = short.lines[0], tw = measure(mid.text, '600 20px Inter');
  assert.ok(Math.abs(mid.x - (366 - tw) / 2) < 0.01, 'centred');
  assert.ok(mid.y > 4 && mid.y < 52, 'its baseline lies inside the card');
  const wide = layoutToast({ msg: 'Link copied', bad: false, acts: null, docked: true, W: 1440 });
  assert.equal(wide.w, 560);
  const long = layoutToast({ msg: 'The shared link had values out of range, so the closest allowed values were used instead of the ones in the link.', bad: false, acts: null, docked: true, W: 390 });
  assert.equal(long.h, 84);
  assert.ok(long.px >= 13 && long.px < 17);
  assert.ok(long.lines.length * long.px * 1.2 <= 84 - 8 + 0.01 || long.px === 13, 'the lines fit the card, or the size is at its floor');
  const acts = layoutToast({ msg: 'The model stopped. Restart it to continue.', bad: true, acts: ['Restart', 'Dismiss'], docked: true, W: 390 });
  assert.equal(acts.h, 84); assert.equal(acts.btns.length, 2);
  const [a, b] = acts.btns;
  assert.ok(Math.abs((a.x + (b.x + b.w - a.x) / 2) - acts.w / 2) < 0.01, 'the buttons are centred');
  assert.equal(b.x - (a.x + a.w), 8);
  assert.ok(a.y > acts.lines[acts.lines.length - 1].y, 'under the words');
  assert.ok(acts.mark && acts.mark.size > 0, 'an error carries its mark');
  assert.equal(layoutToast({ msg: 'x', bad: false, acts: null, docked: true, W: 390 }).mark, null);
});

test('layoutToast not docked: as wide as its words, up to 440 px or 92 % of the window', () => {
  const s = layoutToast({ msg: 'Saved', bad: false, acts: null, docked: false, W: 1440 });
  assert.equal(s.px, 12); assert.ok(s.w < 120); assert.equal(s.lines.length, 1);
  const l = layoutToast({ msg: 'A message long enough that it has to wrap onto more than one line at this width, which is narrow.', bad: false, acts: null, docked: false, W: 390 });
  assert.ok(l.w <= 390 * 0.92 + 0.01); assert.ok(l.lines.length >= 2);
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
      const L = layoutToast({ msg: p.label, sub: p.note, note: true, bad: false, acts: undefined, docked: false, W });
      assert.ok(L.w <= Math.min(420, W - 24) && L.w > 120, `${p.id} at ${W}: ${L.w}`);
      assert.equal(L.x, null);
      assert.ok(L.dot && L.dot.r === 4);
      assert.ok(L.h >= 56 && L.h <= 130, `${p.id} at ${W}: ${L.h}`);
      for (const ln of L.lines) assert.ok(ln.x + measure(ln.text, ln.font || '600 14px Inter') <= L.w - 14 + 0.5, `${p.id}: ${ln.text}`);
    }
  }
  const again = layoutToast({ msg: 'Healthy', sub: PRESETS[0].note, note: true, docked: false, W: 390 });
  assert.deepEqual(again.lines.map((l) => l.text), layoutToast({ msg: 'Healthy', sub: PRESETS[0].note, note: true, docked: false, W: 390 }).lines.map((l) => l.text));
});

test('a preset note rests in its own wrap at the foot, never over the top bars', () => {
  const html = src('index.html'), css = src('styles/app.css'), util = src('src/ui/util.js'), main = src('src/ui/main.js');
  assert.match(html, /id="toastsFoot"/);
  assert.match(css, /\.toast-wrap\.foot \{[^}]*bottom: var\(--toast-foot/);
  assert.match(util, /kind === 'note' && !actions\?\.length/);
  assert.match(main, /--toast-foot/);
  assert.match(main, /watch: foot \? \[wrap, foot\]/);
});
