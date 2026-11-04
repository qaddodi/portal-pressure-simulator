// The scene store's looks (scene-store.js): an element's style worked out in script from the page's rules, never asked of the browser.
// Judged against what the browser computed: every gradient stop of the figure under every look (stop-tokens.js was measured in Chromium
// from the same sheets), and the cascade's own rules on small cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { rulesFromText, createSceneStyle, specificity, bucketOf, substitute, calcs } from '../src/ui/scene-store.js';
import { STOPS, STOP_LOOK } from '../src/ui/stop-tokens.js';
import { parseCssColor } from '../src/ui/css-color.js';

const ROOT = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const inline = [...read('index.html').matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const PAGE = rulesFromText(read('styles/tokens.css'), read('styles/icons.css'), read('styles/app.css'), ...inline);
const NS = 'http://www.w3.org/2000/svg';
const near = (a, b) => { const x = parseCssColor(a), y = parseCssColor(b); return !!x && !!y && x.every((v, i) => Math.abs(v - y[i]) < 0.006); };
const mediaFor = (dark) => (q) => (/prefers-color-scheme:\s*dark/.test(q) ? dark : /prefers-color-scheme:\s*light/.test(q) ? !dark : /min-width|hover:\s*hover|pointer:\s*fine/.test(q));
function page() {
  const dom = new JSDOM('<!doctype html><html><body><div class="app" id="app"><main class="stage-wrap" id="stageWrap"><svg id="stage"><defs><linearGradient id="g"></linearGradient></defs><g id="world"><g id="organs"></g></g></svg></main></div></body></html>');
  return dom.window.document;
}
function setLook(doc, look) {
  const r = doc.documentElement, theme = look === 'navy' || look === 'black' ? 'dark' : look;
  r.setAttribute('data-theme', theme);
  if (theme !== look) r.setAttribute('data-palette', look); else r.removeAttribute('data-palette');
  return theme === 'dark';
}

test('every gradient stop computes as the browser measured it, under every look', () => {
  const doc = page(), g = doc.getElementById('g'), els = {};
  for (const sig of Object.keys(STOPS)) {
    const [c, s, sc, so] = sig.split('|'), st = doc.createElementNS(NS, 'stop');
    if (c) st.setAttribute('class', c);
    if (s) st.setAttribute('style', s);
    if (sc) st.setAttribute('stop-color', sc);
    if (so) st.setAttribute('stop-opacity', so);
    g.append(st); els[sig] = st;
  }
  const bad = [];
  for (const look of ['light', 'soft', 'dark', 'navy', 'black']) {
    const E = createSceneStyle(PAGE, { media: mediaFor(setLook(doc, look)) }), col = STOP_LOOK[look];
    for (const [sig, row] of Object.entries(STOPS)) {
      const s = E.styleOf(els[sig]);
      if (!s) { bad.push(`${look} ${sig}: not read`); continue; }
      if (!near(s.stopColor, row[col * 2]) || Math.abs(parseFloat(s.stopOpacity) - row[col * 2 + 1]) > 1e-3) bad.push(`${look} ${sig}: ${s.stopColor} ${s.stopOpacity}, measured ${row[col * 2]} ${row[col * 2 + 1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('an organ reads its tone, lines and shades from the rules (no computed style)', () => {
  const doc = page(), organs = doc.getElementById('organs');
  const g = doc.createElementNS(NS, 'g');
  g.setAttribute('class', 'organ organ-liver tone-liver');
  const fill = doc.createElementNS(NS, 'path'), line = doc.createElementNS(NS, 'path'), shade = doc.createElementNS(NS, 'path');
  fill.setAttribute('class', 'org-liver org-fill'); line.setAttribute('class', 'org-liver org-line'); shade.setAttribute('class', 'org-shade s1');
  g.append(fill, line, shade); organs.append(g);
  for (const look of ['light', 'dark']) {
    const E = createSceneStyle(PAGE, { media: mediaFor(setLook(doc, look)) });
    const f = E.styleOf(fill), l = E.styleOf(line), s = E.styleOf(shade);
    assert.ok(f && l && s, look);
    assert.equal(f.fill, 'url("#og-liver")', 'the tone\'s gradient wins over the plain organ fill (.tone-liver .org-fill)');
    assert.equal(f.stroke, 'none');
    assert.equal(l.fill, 'none');
    assert.ok(parseCssColor(l.stroke), `${look}: the outline is a colour (var(--o3) → the tone's token): ${l.stroke}`);
    assert.equal(l.strokeLinejoin, 'round');
    assert.equal(s.strokeWidth, '30px', 'the widest shade ring (.organ .org-shade.s1)');
    assert.equal(E.styleOf(g).display, 'inline');
  }
});

test('the cascade: presentation attributes below rules, rules by specificity then order, the style attribute above, !important above all', () => {
  const css = `.a { fill: red; } .b.c { fill: blue; } .c { fill: green; stroke: black; } #x { stroke-width: 3; } .imp { stroke-width: 9 !important; }
    g { color: rgb(10, 20, 30); stroke-linecap: round; } .cur { fill: currentColor; } .mix { fill: color-mix(in srgb, currentColor 50%, white); }`;
  const R = rulesFromText(css), E = createSceneStyle(R);
  const doc = page(), host = doc.getElementById('organs'), gr = doc.createElementNS(NS, 'g'), p = doc.createElementNS(NS, 'path');
  gr.append(p); host.append(gr);
  p.setAttribute('fill', 'yellow');
  assert.ok(near(E.styleOf(p).fill, 'yellow'), 'an attribute alone');
  p.setAttribute('class', 'a'); E.begin();
  assert.ok(near(E.styleOf(p).fill, 'red'), 'any rule over the attribute');
  p.setAttribute('class', 'b c'); E.begin();
  assert.ok(near(E.styleOf(p).fill, 'blue'), 'the more specific rule, though earlier');
  p.setAttribute('style', 'fill: purple'); E.begin();
  assert.ok(near(E.styleOf(p).fill, 'purple'), 'the style attribute over the rules');
  p.removeAttribute('style'); p.id = 'x'; p.setAttribute('class', 'imp'); p.setAttribute('style', 'stroke-width: 2'); E.begin();
  assert.equal(E.styleOf(p).strokeWidth, '9px', '!important over the style attribute');
  p.setAttribute('class', 'cur'); p.removeAttribute('style'); E.begin();
  assert.ok(near(E.styleOf(p).fill, 'rgb(10, 20, 30)'), 'currentColor from the inherited colour');
  assert.equal(E.styleOf(p).strokeLinecap, 'round', 'inherited from the group');
  p.setAttribute('class', 'mix'); E.begin();
  assert.ok(near(E.styleOf(p).fill, 'rgb(132.5, 137.5, 142.5)'), 'color-mix with currentColor');
});

test('custom properties: inherited, var() fallbacks, calc of percentages, @property', () => {
  const css = `@property --np { syntax: '<number>'; inherits: false; initial-value: .25; }
    g { --c: rgb(0, 0, 255); --t: 40%; --np: .9; } path { fill: color-mix(in srgb, var(--c) calc(var(--t) + 10%), white); stroke: var(--missing, red); opacity: var(--np); }`;
  const E = createSceneStyle(rulesFromText(css));
  const doc = page(), gr = doc.createElementNS(NS, 'g'), p = doc.createElementNS(NS, 'path');
  gr.append(p); doc.getElementById('organs').append(gr);
  const s = E.styleOf(p);
  assert.ok(near(s.fill, 'color-mix(in srgb, rgb(0, 0, 255) 50%, white)'));
  assert.ok(near(s.stroke, 'red'));
  assert.equal(s.opacity, '0.25', 'a registered property that does not inherit takes its initial value');
});

test('what it cannot read it does not guess: @container, a CSS transform, an unread function', () => {
  const doc = page(), p = doc.createElementNS(NS, 'path');
  doc.getElementById('organs').append(p);
  assert.equal(createSceneStyle(rulesFromText('@container (max-width: 400px) { path { fill: red; } }')).styleOf(p), null);
  assert.equal(createSceneStyle(rulesFromText('path { transform: translate(2px, 3px); }')).styleOf(p), null);
  assert.equal(createSceneStyle(rulesFromText('path { stroke-width: max(1px, 2px); }')).styleOf(p), null);
  assert.ok(createSceneStyle(rulesFromText('@container (max-width: 400px) { rect { fill: red; } }')).styleOf(p), 'a @container rule that does not match is no matter');
});

test('selectors: specificity and buckets', () => {
  assert.deepEqual([...specificity('#a .b c')], [1, 1, 1]);
  assert.deepEqual([...specificity(':root[data-theme="dark"] .lv-sep')], [0, 3, 0]);
  assert.deepEqual([...specificity('.x:not(#y, .z)')], [1, 1, 0]);
  assert.deepEqual([...specificity(':where(.a, #b) .c')], [0, 1, 0]);
  assert.equal(specificity('.a::before').hasPE, true);
  assert.equal(bucketOf('.organ .org-shade.s1'), '.org-shade');
  assert.equal(bucketOf('#organs > .organ:not(.x)'), '.organ');
  assert.equal(bucketOf(':root[data-theme="dark"]'), '*');
  assert.equal(bucketOf('svg path'), 'path');
  assert.equal(substitute('a var(--x, var(--y, 3)) b', () => undefined), 'a 3 b');
  assert.equal(calcs('calc(42% + 3%)'), '45%');
});
