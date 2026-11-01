// A label is knocked out of the art with a soft edge, not a hard rim (Mohammad, 1 Nov: "a printed atlas knocks a label out of the art, with no visible edge").
// The halo is two layers: a thin solid knockout at the letters (the CSS's stroke) and a feather beyond it that falls from FEATHER_TOP (70 %) to nothing. The GPU labels
// draw the feather (label-gl.js drawBlock, its reach read from --halo-fe); the SVG's own text and the lobule's HTML names take it as a text-shadow. ?halo=0
// (data-halo="off") gives the hard rim exactly as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawBlock, describeBlock, featherAlphas, FEATHER_TOP, lookKey } from '../src/ui/label-gl.js';

const LGL = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const TOK = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const bare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = (css) => [...bare(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim().replace(/\s+/g, ' '), body: body.trim() }));
const rule = (css, sel) => rules(css).find((r) => r.sel === sel);

// A recording 2D context: every stroke and fill with the state it was made in.
function recorder() {
  const log = [], st = { lineWidth: 1, globalAlpha: 1, strokeStyle: '', fillStyle: '' };
  const ctx = new Proxy(st, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (k === 'strokeText') return (s) => log.push({ op: 'stroke', t: s, lw: t.lineWidth, a: t.globalAlpha, style: t.strokeStyle });
      if (k === 'fillText') return (s) => log.push({ op: 'fill', t: s, style: t.fillStyle });
      return k in t ? t[k] : () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const cv = { width: 0, height: 0, getContext: () => ctx };
  return { cv, log };
}
const run = (o = {}) => ({ t: 'LIVER', dx: 0, font: '600 12px Inter', size: 12, ls: 0, tnum: true, fill: 'rgb(110, 108, 102)', stroke: 'rgba(251, 250, 247, 0.92)', sw: 2.5, join: 'round', strokeFirst: true, fe: 3.5, ...o });
const desc = (o) => ({ opacity: 1, filter: '', parts: [{ k: 'text', x: 0, y: 11, anchor: 'start', runs: [run(o)] }] });

test('the feather falls from the top to nothing, ring by ring, whatever the number of strokes', () => {
  for (const n of [3, 4, 5]) {
    const al = featherAlphas(n);
    assert.equal(al.length, n);
    assert.ok(al.every((a) => a >= 0 && a <= 1), 'opacities');
    // (Laid down widest first, the outer ring is the stroke's own opacity; every ring inside it adds what it needs.)
    let left = 1; const seen = new Array(n);
    for (let i = n - 1; i >= 0; i--) { left *= 1 - al[i]; seen[i] = 1 - left; }
    for (let i = 1; i < n; i++) assert.ok(seen[i] < seen[i - 1], `ring ${i} is fainter than ring ${i - 1}`);
    assert.ok(seen[0] > 0.55 && seen[0] <= FEATHER_TOP, `the ring next to the solid stroke is about ${FEATHER_TOP * 100} % (${seen[0].toFixed(3)})`);
    assert.ok(seen[n - 1] < 0.15, `the outer ring is nearly nothing (${seen[n - 1].toFixed(3)})`);
  }
});

test('a halo with a feather draws it first, widest stroke first, then the solid stroke at the CSS width, then the letters', () => {
  const { cv, log } = recorder();
  drawBlock(cv, desc(), 3);
  const strokes = log.filter((l) => l.op === 'stroke' && l.t === 'LIVER');
  assert.ok(strokes.length >= 4, 'a few feather strokes and the solid one');
  const solid = strokes.at(-1), feather = strokes.slice(0, -1);
  assert.equal(solid.lw, 2.5, 'the last stroke is the CSS\'s own');
  assert.equal(solid.a, 1, 'at full opacity (the colour carries its own)');
  assert.deepEqual(feather.map((s) => s.lw), [...feather.map((s) => s.lw)].sort((a, b) => b - a), 'widest first');
  assert.ok(feather[0].lw <= 2 * 3.5 + 1e-9 && feather[0].lw > solid.lw, 'the widest reaches the feather\'s reach (3.5 px each side)');
  assert.ok(feather.every((s) => s.a > 0 && s.a < 1 && s.style === 'rgba(251, 250, 247, 0.92)'), 'in the halo\'s own colour, translucent');
  assert.ok(log.findIndex((l) => l.op === 'fill') > log.indexOf(solid), 'the letters come last');
});

test('every run\'s feather is drawn before any run\'s letters, so it never lies over a neighbouring word', () => {
  const { cv, log } = recorder();
  const two = { opacity: 1, filter: '', parts: [{ k: 'text', x: 0, y: 11, anchor: 'start', runs: [run({ t: 'Portal vein' }), run({ t: '22.4', dx: 4 })] }] };
  drawBlock(cv, two, 2);
  const firstFill = log.findIndex((l) => l.op === 'fill');
  const lastFeather = log.map((l, i) => (l.op === 'stroke' && l.a < 1 ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  assert.ok(lastFeather > 0 && lastFeather < firstFill, 'all feathers first');
});

test('with no feather (?halo=0, a label with a solid halo of its own, no halo at all) the drawing is the one it always was', () => {
  for (const o of [{ fe: 0 }, { fe: undefined }, { fe: 1 }, { fe: 3.5, sw: 7 }, { fe: 3.5, stroke: '' }, { fe: 3.5, strokeFirst: false }]) {
    const { cv, log } = recorder();
    drawBlock(cv, desc(o), 3);
    assert.ok(log.filter((l) => l.op === 'stroke').every((s) => s.a === 1), `no translucent stroke for ${JSON.stringify(o)}`);
    assert.ok(log.filter((l) => l.op === 'stroke').length <= 1, `at most the one stroke for ${JSON.stringify(o)}`);
  }
});

test('the picture grows by the feather so nothing is clipped, and is not larger without one', () => {
  const a = recorder(), b = recorder();
  drawBlock(a.cv, desc({ fe: 0 }), 3);
  drawBlock(b.cv, desc({ fe: 3.5 }), 3);
  assert.ok(b.cv.width > a.cv.width && b.cv.height > a.cv.height, `${a.cv.width}x${a.cv.height} then ${b.cv.width}x${b.cv.height}`);
  // (The reach 3.5 px, a pixel for the edge's smoothing, at 3 device px each: the box holds it on every side.)
  assert.ok((b.cv.width - a.cv.width) / 2 >= (3.5 - 1.5 - 1) * 3 - 1, 'wide enough each side');
});

test('a picture is drawn again when the halo\'s reach changes', () => {
  assert.notEqual(lookKey(desc({ fe: 0 }), false, 3), lookKey(desc({ fe: 3.5 }), false, 3));
});

test('describeBlock reads the halo\'s reach from --halo-fe, and not a thing else for it', () => {
  const sp = { tagName: 'tspan', textContent: 'LIVER', getAttribute: () => null };
  const text = { tagName: 'text', children: [sp], getAttribute: (k) => ({ x: '0', y: '11' }[k] ?? null) };
  const g = { style: {}, children: [text], matches: () => false };
  const styleOf = (el, fe) => ({
    display: 'inline', opacity: '1', filter: 'none', fontStyle: 'normal', fontWeight: '600', fontSize: '12px', fontFamily: 'Inter', letterSpacing: 'normal', fontVariantNumeric: 'tabular-nums',
    fill: 'rgb(0, 0, 0)', stroke: 'rgba(251, 250, 247, 0.92)', strokeWidth: '2.5px', strokeLinejoin: 'round', paintOrder: 'stroke fill',
    getPropertyValue: (k) => (k === '--halo-fe' ? fe : ''),
  });
  const on = describeBlock(g, (el) => styleOf(el, '3.5px')).parts[0].runs[0];
  assert.equal(on.fe, 3.5);
  assert.equal(on.sw, 2.5);
  assert.equal(describeBlock(g, (el) => styleOf(el, '0px')).parts[0].runs[0].fe, 0, '?halo=0: no feather');
  assert.equal(describeBlock(g, (el) => styleOf(el, 'calc(3.5px * 1.00)')).parts[0].runs[0].fe, 0, 'a browser without registered properties: none, not a wrong one');
});

test('the CSS builds the halo from the tokens, and ?halo=0 gives the old hard rim exactly', () => {
  const tok = bare(TOK);
  assert.match(tok, /--halo-in: 1px; --halo-in-bare: 1\.2px;/);
  assert.match(tok, /--halo-feather: 3\.5px;/);
  assert.match(tok, /:root\[data-halo="off"\] \{ --halo-in: 1\.5px; --halo-in-bare: 2px; --halo-feather: 0px; \}/, 'the hard rim: 3 px and 4 px strokes, as before');
  const base = rule(CSS, '#labels text').body;
  assert.match(base, /stroke-width: max\(2px, calc\(var\(--halo-in\) \* 2 \* var\(--lbk, 1\)\)\)/);
  assert.match(base, /--halo-fe: calc\(var\(--halo-feather\) \* var\(--lbk, 1\)\)/);
  assert.match(rule(CSS, '#labels .lb.inline.bare text').body, /stroke-width: max\(2\.5px, calc\(var\(--halo-in-bare\) \* 2 \* var\(--lbk, 1\)\)\)/);
  assert.match(bare(CSS), /@property --halo-fe \{ syntax: '<length>'; inherits: true; initial-value: 0px; \}/);
});

test('the text-shadow feather is only on while the halo is (not ?halo=0), and never on a label with a panel of its own or a wide halo on a vessel', () => {
  const css = bare(CSS);
  const sh = (k) => `0 0 calc(var(--halo-blur) * var(--${k}, 1)) var(--label-halo), 0 0 calc(var(--halo-blur) * var(--${k}, 1)) var(--label-halo)`;
  assert.ok(css.includes(`:root:not([data-halo="off"]) #labels text { text-shadow: ${sh('lbk')}; }`));
  // (Every rule that gives a label's text a halo shadow says it only while the halo is on.)
  for (const { sel, body } of rules(CSS)) {
    if (!/text-shadow:\s*0 0 calc\(var\(--halo-blur\)/.test(body)) continue;
    for (const one of sel.split(',')) assert.match(one.trim(), /^(:root:not\(\[data-halo="off"\]\)|:where\(:root:not\(\[data-halo="off"\]\)\)) /, `"${one.trim()}" would feather ?halo=0 too`);
  }
  for (const sel of ['#labels .lb.inline text, #labels .lb.focus text', '#labels .lb.scan text', '#labels .lb:is(.fx-cal, .fx-span, .fx-step) text']) assert.match(rule(CSS, sel).body, /text-shadow: none/, sel);
  const onv = rules(CSS).filter(({ sel }) => /on-vessel/.test(sel) && /stroke-width: 7px/.test(rule(CSS, sel)?.body || ''));
  assert.ok(onv.length && onv.every(({ body }) => /text-shadow: none/.test(body) && /--halo-fe: 0px/.test(body)), 'a reading on a vessel keeps its 7 px halo and takes no feather');
  // (A bare reading's shadow is as specific as the on-vessel rule, which comes after it in the file and says none.)
  assert.match(css, /:where\(:root:not\(\[data-halo="off"\]\)\) #labels \.lb\.inline\.bare text \{ text-shadow:/);
  assert.ok(css.indexOf(':where(:root:not([data-halo="off"])) #labels .lb.inline.bare text') < css.indexOf('.cmap #labels .lb.on-vessel text'), 'the on-vessel rule is later');
});

test('the lobule and sinusoid names take the feather as a text-shadow beside their rim, and keep their layout (--hw is untouched)', () => {
  const css = bare(CSS);
  const sh = `0 0 calc(var(--halo-blur) * var(--label-k, 1)) var(--label-halo), 0 0 calc(var(--halo-blur) * var(--label-k, 1)) var(--label-halo)`;
  for (const sel of ['.sv-region', '.lz-zone']) assert.ok(css.includes(`:root:not([data-halo="off"]) ${sel} { text-shadow: ${sh}; }`), sel);
  assert.match(css, /:root:not\(\[data-halo="off"\]\) \.lz-lab \.n, :root:not\(\[data-halo="off"\]\) \.lz-lab \.v \{ text-shadow:/);
  assert.equal((css.match(/--hw: clamp\(\.8px, calc\(1px \* var\(--label-k, 1\)\), 1\.5px\);/g) || []).length, 3, 'the rim widths that size the pills are as they were');
});

test('?halo=0 sets data-halo on the page before the first label, and the GPU labels read a change of it', () => {
  assert.match(LGL, /if \(typeof document !== 'undefined' && \/\[\?&\]halo=0\\b\/\.test\(location\.search\)\) document\.documentElement\.setAttribute\('data-halo', 'off'\);/);
  assert.match(LGL, /attributeFilter: \['class', 'data-theme', 'data-noglass', 'data-mode', 'data-halo'\]/);
  // (No CSS filter anywhere in the halo: a filter on a label sends it back to the SVG.)
  assert.doesNotMatch(bare(TOK).match(/--halo[^;]*;/g).join(' '), /filter|blur\(/);
});
