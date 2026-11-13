import { stageSource } from './stage-src.js';
// 3 Nov 2026, Mohammad, iPhone, zoomed and panning: "the vessels, arrows and blood draw on top of the view switcher and the bottom bar".
// The cause: while the figure moved, stage-busy stepped every .float-ui (top bar, bottom dock, zoom pill, cards) back to .55 opacity, so
// each glass bar was 52 % of its 95 % glass and the GPU's vessels, arrows and labels showed through it crisp and unfrosted, its words
// grey. These pins keep the chrome whole and over the figure through every gesture, and the labels' avoid boxes from one list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const stage = stageSource();
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Every rule of the sheet as [selector, body] (media blocks flattened; comments dropped).
const rules = [];
for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push([m[1].trim().replace(/\s+/g, ' '), m[2]]);
const z = (name) => +new RegExp(`--z-${name}:\\s*(\\d+)`).exec(tokens)[1];

const GESTURE = /\.(?:stage-busy|figure-focus|panning|pinch-hide|lb-ride|off-home)\b/;
const CHROME = /\.float-ui|\.float-pill|\.topbar|\.vdock|\.zoom-pill|\.stage-bar|\.nb-views|#nbViews|\.stage-fit|\.stage-rotate|\.sb-center|\.instrument-workspace|\.treat-card|\.panel\b|#dock\b/;

test('no gesture class fades any piece of the chrome, its glass or its ink (13 Nov 2026)', () => {
  const OWN_GLASS = /^(?:\.float-ui|\.float-pill|\.topbar|\.vdock|\.zoom-pill|\.stage-bar|\.nb-views|#nbViews|\.stage-fit|\.stage-rotate|\.sb-center|\.instrument-workspace|\.treat-card|\.panel|#dock|#vdock|#topbar)(?![\w-])/;
  const bad = [], seen = [];
  for (const [sel, body] of rules) {
    if (!GESTURE.test(sel) || !CHROME.test(sel)) continue;
    const o = /(?:^|;|\s)opacity:\s*([\d.]+)/.exec(body);
    if (!o || !(+o[1] > 0 && +o[1] < 1)) continue;
    // (Each comma-separated subject: its last compound selector, the thing that fades.)
    const subjects = sel.replace(/:is\((?:[^()]|\([^()]*\))*\)(?=[^,]*$)/g, (m) => m).split(/,(?![^(]*\))/).map((x) => x.trim());
    for (const sub of subjects) {
      const last = sub.replace(/:(?:not|is)\((?:[^()]|\([^()]*\))*\)/g, '').trim().split(/[\s>]+/).pop();
      if (OWN_GLASS.test(last) && !/\.has-plate/.test(sub)) bad.push(`${sub} { opacity: ${o[1]} }`);
    }
    seen.push(sel);
  }
  assert.deepEqual(bad, [], 'a bar or card whose glass is the page\'s own, at partial opacity, lets the figure through it unfrosted');
  // (13 Nov 2026, Mohammad: "Why do the ui change opacity when I pan around. It shouldn't.": no piece of the chrome steps back at all.)
  assert.deepEqual(seen, [], 'a piece of the chrome fades while the figure moves');
});

test('the zoom pill is never dimmed as a whole: only its ink is, its glass stays whole', () => {
  for (const [sel, body] of rules) {
    if (!/\.zoom-pill\s*(?:[:,{]|$)|\.zoom-pill:[a-z-]+\)?$/.test(sel.split(',').pop().trim()) && !/(^|,)\s*\.zoom-pill(:[a-z-]+(\([^)]*\))?)?\s*$/.test(sel)) continue;
    assert.doesNotMatch(body, /(?:^|;|\s)opacity:\s*0?\.\d/, `${sel} dims the whole pill`);
  }
});

test('the floating glass is opaque enough to hold the figure back at rest: every theme\'s --glass is at least 84 % opaque', () => {
  for (const m of tokens.matchAll(/--glass:\s*rgba\([^)]*?,\s*([\d.]+)\)/g)) assert.ok(+m[1] >= 0.84, `--glass at ${m[1]}`);
});

test('the figure\'s canvases and layers stack below the chrome, and the chrome above them', () => {
  assert.ok(z('figure') < z('hud') && z('hud') < z('panel'), 'the z scale: figure < hud < panel');
  const figure = /#veins|#glassGl|#cardGl|#stageOver|#labels|#stage\b|\.stage-view\s*>\s*(?:canvas|\.flow-dash)|\.stage-view canvas|\.lz\b|\.sv\b|#overlay/;
  const over = [];
  for (const [sel, body] of rules) {
    if (!figure.test(sel) || CHROME.test(sel)) continue;
    const m = /(?:^|;|\s)z-index:\s*(?:var\(--z-(\w+)\)|(-?\d+))/.exec(body);
    if (!m) continue;
    const v = m[1] ? z(m[1]) : +m[2];
    if (v >= z('hud')) over.push(`${sel} z-index ${v}`);
  }
  assert.deepEqual(over, [], 'a figure layer at or above the chrome would draw over it');
  for (const sel of ['.topbar', '.vdock', '.zoom-pill', '.sb-center.float-ui']) {
    const r = rules.find(([s, b]) => s.split(',').map((x) => x.trim()).includes(sel) && /z-index:\s*var\(--z-(?:hud|panel)\)/.test(b));
    assert.ok(r, `${sel} sits at the hud's level or above`);
  }
  // (The stage view makes no layer of its own that could lift the canvases over the chrome: no z-index there.)
  const sv = rules.find(([s]) => s === '.stage-view');
  assert.doesNotMatch(sv[1], /z-index/);
});

test('every floating piece of the chrome is also a stage blocker: the labels, the credit and the callouts keep clear of its box', () => {
  const missing = [];
  for (const m of html.matchAll(/class="([^"]*\bfloat-ui\b[^"]*)"/g)) if (!/\bstage-blocker\b/.test(m[1])) missing.push(m[1]);
  assert.deepEqual(missing, []);
  const src = [readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8'), readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8'), stage];
  for (const t of src) for (const m of t.matchAll(/class:\s*'([^']*\bfloat-ui\b[^']*)'/g)) assert.match(m[1], /\bstage-blocker\b/, m[1]);
});

test('the labels\' boxes and the observer\'s targets come from one list of what is over the figure, which holds the view switcher\'s holder', () => {
  const sel = /const BLOCKER_SEL = '([^']+)';/.exec(stage)?.[1];
  assert.ok(sel, 'one shared selector');
  for (const part of ['.stage-blocker:not([hidden])', '.pz-shade', '#nbViews', '.stage-clock']) assert.ok(sel.includes(part), part);
  assert.equal((stage.match(/querySelectorAll\('\.stage-blocker:not\(\[hidden\]\), \.pz-shade, #nbViews, \.stage-clock'\)/g) || []).length, 0, 'no second copy of the list');
  assert.equal((stage.match(/querySelectorAll\(BLOCKER_SEL\)/g) || []).length, 2, 'the targets and the boxes both read it');
  // (#nbViews holds the view switcher and sits outside its parent dock's box: only its own box keeps a label from under Circuit / Anatomy / Lobule.)
  assert.match(readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8'), /id: 'nbViews'/);
  assert.match(css, /\.app:not\(\.presenting\) \.vdock:not\(\.mini\) > \.nb-views \{ display: flex; position: absolute;/);
});
