// Into or out of the sinusoid the view pill glides to its new home on the zoom's clock and curve, and its selected button
// crossfades (17 Oct, Mohammad: the pill "should transition as well nicely elegantly when going from to lobule to and from sinusoid").
// The bars slide with it (17 Oct, Mohammad: "the bars should probably slide out when going into sinusoid and slide back in when
// going out", the pill gliding "with them same speed"): the dock slides down off the screen as the zoom goes in and back up as it
// comes out, on the same clock and curve, and the pill rises in step with it, never held back and jumping at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { easeIO3, EASE_IO3 } from '../src/ui/pill-motion.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../src/ui/main.js');
const lz = read('../src/ui/lobule-zoom.js');
const stage = read('../src/ui/stage.js');
const css = read('../styles/app.css');
const fn = (name) => main.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))[1];

test('the pill and the bars move over the sinusoid zoom\'s own time and curve', () => {
  const zoom = lz.match(/ms = \(reduce\.matches \? 280 : on \? (\d+) : (\d+)\)/);
  assert.ok(zoom, 'the sinusoid zoom times');
  assert.match(main, new RegExp(`const PILL_IN = ${zoom[1]}, PILL_OUT = ${zoom[2]};`), 'the pill takes the zoom\'s times, in and out');
  // The same cubic ease in and out as the zoom (easeIO), and the CSS crossfade and the fold on its cubic-bezier.
  assert.ok(lz.includes('const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);'));
  const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  for (let u = 0; u <= 1; u += 0.05) assert.equal(easeIO3(u), easeIO(u));
  assert.equal(EASE_IO3, 'cubic-bezier(.65, 0, .35, 1)');
  assert.ok(css.includes(':is(.nb-views, .sin-views).vp-glide #viewSeg button { transition-duration: var(--vp-ms, .95s); transition-timing-function: cubic-bezier(.65, 0, .35, 1); }'));
  // One step moves both, from one clock: the dock first, then the pill read against it, every frame.
  const m = fn('sinMotion');
  assert.match(m, /ms = intoSin \? PILL_IN : PILL_OUT, t0 = performance\.now\(\)/);
  assert.match(m, /const u = Math\.min\(1, \(now - t0\) \/ ms\), e = easeIO3\(u\);/);
  assert.match(m, /barY = u >= 1 \? 0 : y0 \+ \(y1 - y0\) \* e;/, 'the dock on the zoom\'s curve');
  assert.match(m, /k = 1 - e;/, 'the pill on the same curve, from the same clock');
  assert.ok(m.indexOf('vd.style.translate =') < m.indexOf('el.getBoundingClientRect()'), 'the dock is placed before the pill reads its place');
  // Drawn in its first place in the change's own task, so no frame shows the dock at rest before it slides back in.
  assert.match(m, /\n {2}step\(t0\);$/);
});

test('out of the sinusoid the dock and the pill rise together, the pill above the dock all the way, and land as the zoom does', () => {
  // An 844 px high phone: the dock rests with its top at 700, the pill 8 px above it (42 px tall); in the sinusoid view the pill
  // sits 20 px off the foot. The dock starts past the screen's foot (sinMotion: its top to the foot, plus 24 px).
  const H = 844, dockTop = 700, pillH = 42, off = H - dockTop + 24;   // (no interface zoom)
  const pillFrom = H - 20 - pillH / 2, pillRest = dockTop - 8 - pillH / 2;
  const dock = (u) => dockTop + off * (1 - easeIO3(u)), pill = (u) => pillRest + (pillFrom - pillRest) * (1 - easeIO3(u));
  assert.equal(dock(0), H + 24); assert.equal(pill(0), pillFrom);
  assert.equal(dock(1), dockTop); assert.equal(pill(1), pillRest);
  for (let u = 0.02; u <= 1.0001; u += 0.02) {
    assert.ok(dock(u) <= dock(u - 0.02) && pill(u) <= pill(u - 0.02), 'both only rise, no overshoot');
    assert.ok(pill(u) + pillH / 2 <= dock(u) - 8 + 1e-9, `the pill clears the dock at ${u.toFixed(2)}`);
    // In step: each has covered the same share of its way at every moment (one clock, one curve).
    const a = (dock(0) - dock(u)) / (dock(0) - dock(1)), b = (pill(0) - pill(u)) / (pill(0) - pill(1));
    assert.ok(Math.abs(a - b) < 1e-9);
  }
  // Halfway through the zoom both are halfway (the ease is symmetric): the pill does not wait for the zoom to land.
  assert.ok(Math.abs((pill(0) - pill(0.5)) / (pill(0) - pill(1)) - 0.5) < 1e-9);
});

test('the pill starts where it was drawn and reads its resting place each frame, less its own shift and the dock\'s', () => {
  const sync = main.match(/const syncViewSeg = \(\) => \{([\s\S]*?)\n {2}\};/)[1];
  assert.match(sync, /pillChange\(\(\) => \{ sinBtn\.hidden = sinHide; app\.classList\.toggle\('sin-focus', inSin\); \}/, 'the buttons change inside one move');
  assert.ok(sync.indexOf('pillChange(') < sync.indexOf("b.setAttribute('aria-pressed'"), 'the pressed state is set after the move, so it crossfades');
  const change = fn('pillChange');
  assert.ok(change.indexOf('viewPillRect()') < change.indexOf('change();'), 'measured before the buttons change');
  assert.ok(change.indexOf("classList.add('vd-out')") < change.indexOf('change();'), 'into the sinusoid the dock stays to slide away');
  const m = fn('sinMotion');
  assert.match(m, /prefers-reduced-motion: reduce/, 'reduced motion: the pill and the dock just take their places');
  assert.match(m, /glideShift\(r\.top \+ r\.height \/ 2, shift\[1\], z, dock, from\.y, k\)\.shift/, 'less its own shift and the dock\'s');
  assert.match(m, /const dock = inDock && bars \? barY \* bz : 0, k = 1 - e;/);
  // A move reversed part way starts from where the dock is drawn, not from its far end.
  assert.match(m, /if \(intoSin\) y1 = off; else if \(!leaving\) y0 = off;/);
  // The dock's published height reads the pill at rest, not mid-glide (the lobule's framing depends on it).
  assert.match(main, /nbv\.getBoundingClientRect\(\)\.top \+ \(pillEl === nbv \? pillShiftY : 0\) \+ 8/);
});

// (17 Oct, Mohammad: out of the sinusoid the pill stayed put and jumped after the zoom.) On a phone or upright iPad the dock eases
// its parts' translate property after a wait; a glide written to translate was held back by it, so the pill moves by transform, and
// the dock by its own translate, which no rule eases either.
test('the pill moves by transform and the dock by translate, which nothing on them eases', () => {
  const m = fn('sinMotion');
  assert.match(m, /el\.style\.transform = `translate\(/);
  assert.match(m, /vd\.style\.translate = /);
  assert.doesNotMatch(m, /el\.style\.translate|vd\.style\.transform/);
  for (const rule of css.match(/[^{}]*\{[^{}]*\}/g)) {
    const [sel, body] = rule.split('{');
    const tr = body.match(/transition(-property)?:([^;}]*)/);
    if (!tr) continue;
    // The pill's homes (the dock's children, the views pills, the floating pieces) ease no transform.
    if (/\.vdock[^,]*>|\.nb-views|\.sin-views|#nbViews|#sinViews|\.float-ui/.test(sel)) assert.doesNotMatch(tr[2], /transform|\ball\b/, sel.trim());
    // The dock itself (not its parts or its glass) eases no translate either.
    for (const s of sel.split(',')) if (/(\.vdock|#vdock)(:not\([^)]*\)|\.[\w-]+)*\s*$/.test(s.trim())) assert.doesNotMatch(tr[2], /translate|transform|\ball\b/, s.trim());
  }
});

test('the framing reads the dock and the pill where they rest while they slide', () => {
  // Sliding away, the dock is out of the framing at once (as when it was hidden at once); coming back, it counts where it rests.
  assert.match(css, /#app\.sin-focus #vdock:not\(\.vd-out\) \{ display: none !important; \}/);
  assert.match(css, /#app\.sin-focus \.vdock > \.nb-views \{ display: none; \}/, 'its empty views pill does not slide away with it');
  assert.match(stage, /const slideRest = \(el, q\) => \{ const y = \+el\.dataset\.slideY \|\| 0; return y \? new DOMRect\(q\.x, q\.y - y, q\.width, q\.height\) : q; \};/);
  assert.equal(stage.match(/el\.classList\.contains\('card-leaving'\) \|\| el\.classList\.contains\('vd-out'\)\) continue;/g).length, 2);
  assert.equal(stage.match(/slideRest\(el, el\.getBoundingClientRect\(\)\)/g).length, 2, 'both the framing and the cards\' space');
  // The published space: none in the sinusoid view, and at rest while the dock slides back.
  assert.match(main, /const vdH = app\.classList\.contains\('sin-focus'\) \? 0 : vd\.offsetHeight, vdSlide = \+vd\.dataset\.slideY \|\| 0;/);
  assert.match(main, /\(vd\.getBoundingClientRect\(\)\.top - vdSlide\)/);
  assert.match(main, /new DOMRect\(x, y - vdSlide, width, height\)\)\(\$\('#thumbBar'\)\.getBoundingClientRect\(\)\)/);
  const m = fn('sinMotion');
  assert.match(m, /vd\.dataset\.slideY = \(barY \* bz\)\.toFixed\(2\)/);
  assert.match(m, /el\.dataset\.slideY = \(pillShiftY \+ dock\)\.toFixed\(2\)/);
});

// (A regression from the pill's earlier fix: a card dragged aside on a wide screen is moved by translate, and closing it must clear that.)
test('a card dragged aside returns to its place when it closes', () => {
  assert.match(main, /closed: \(\) => \{ stopSink\(el\); el\.style\.removeProperty\('--sink'\); el\.style\.translate = '';/);
  assert.match(main, /else el\.style\.translate = `\$\{start\.tx \+ dx\}px \$\{start\.ty \+ dy\}px`;/);
});
