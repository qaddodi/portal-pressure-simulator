// LOOK-1 (bible review 19 Nov 2026): the words the GPU draws for charts take their colour from src/ui/chart-looks, where the CSS contrast test cannot see
// them (it greps `color: var(--caution…)` in styles/ only). So amber, green and red, and the trace colours, were drawn as text at 2.4 to 4.5:1
// (raw amber is 3.28:1 on a Light card). The rule, kept here for every look: a word in a chart is 4.5:1 on the ground it is drawn on (3:1 when it is
// large: 24 px, or 18.7 px bold), in all five looks. Status and trace colours are fills and strokes; a word takes the ink form (`caution-ink`,
// `tr-wedge-ink`: tok('caution-ink'), or param('c', true) for a colour the builder names).
//
// Every look entry that sets a font, a size or a weight is resolved with the app's own resolveProps() in each look, in every state its `when`
// rows name, and for every colour its params can be given. What fails today and belongs to the owner's calls (Soft's own palette, LOOK-5; the
// quiet-by-opacity words, LOOK-7) is listed in KNOWN: it may only shrink (a pair that now passes must be taken off the list).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { resolveProps, makeCtx, withCtx, withVarsResolved } from '../src/ui/chart-looks/resolve.js';
import { tokensOfLook, LOOK_IDS } from '../src/ui/theme-tokens.js';
import { parseCssColor } from '../src/ui/css-color.js';

const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg, a, bg) => [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));   // (a colour of alpha a laid on an opaque ground)
const read = (s) => Array.from(parseCssColor(s));

// The look's context: theme, palette, and a type scale for the sizes that are written as a multiple of the card's own.
const CTX = {
  light: { theme: 'light', dark: false, palette: '' }, soft: { theme: 'soft', dark: false, palette: '' },
  dark: { theme: 'dark', dark: true, palette: '' }, navy: { theme: 'dark', dark: true, palette: 'navy' }, black: { theme: 'dark', dark: true, palette: 'black' },
};
const SCALE = { cap: 12, lab: 12, body: 14, val: 16, sm: 12, chCap: 12, fs12: 12, fs14: 14 };
const baseCtx = makeCtx({ host: '', scale: SCALE });

// What a param can be given. tone: a path card's tone as the builder names it; c: a reading's colour (reading-colours.js, the neutrals the curve uses); rx: a treatment's colour.
const TONES = ['text', 'ok', 'caution', 'danger', 'accent'];
const READINGS = ['text-2', 'text-3', 'tr-pv', 'tr-ppg', 'tr-hvpg', 'tr-wedge', 'tr-sin', 'tr-hv', 'tr-ra', 'tr-ivc', 'tr-var', 'tr-cav', 'tr-scler', 'ok', 'caution', 'danger'];
const PARAMS = { tone: TONES, c: READINGS, rx: ['s1', 's2', 's3', 's4', 's5', 's6'] };

const nodesOf = (v, into) => { if (v && typeof v === 'object') { if (Array.isArray(v)) v.forEach((x) => nodesOf(x, into)); else { if (v.k === 'param') into.add(v.n); for (const k in v) nodesOf(v[k], into); } } return into; };
// Words drawn on a fill of their own, not on the card (a white word on the vessel's lumen, the step number on its disc, the zone words on their tinted band): measured where they sit, not here.
const OWN_GROUND = new Set(['lumen.in', 'lumen.word', 'talk.step.n', 'plane.zt']);
const hasType = (p) => p && (p.font || p.size || p.weight);

/** Every combination of state values an entry names (a `when` row's condition on a state, plus the state absent). */
function stateCombos(entry) {
  const names = Object.keys(entry.state || {});
  const vals = names.map((n) => { const s = new Set([undefined]); for (const [c] of entry.when || []) if (n in c) for (const w of [].concat(c[n])) s.add(w === false ? undefined : w); return [...s]; });
  let combos = [{}];
  names.forEach((n, i) => { combos = combos.flatMap((c) => vals[i].map((v) => ({ ...c, [n]: v }))); });
  return combos;
}

/** [{ key, look, ground, ratio, need }] for every text entry, state, param value and ground in a look. */
function measure(id) {
  const tokens = withVarsResolved(tokensOfLook(id));
  const ctx = withCtx(baseCtx, CTX[id]);
  const out = [];
  for (const [key, entry] of Object.entries(LOOKS)) {
    const rows = [entry.base || {}, ...(entry.when || []).map(([, p]) => p)];
    if (!rows.some(hasType) || OWN_GROUND.has(key)) continue;
    const names = [...nodesOf(rows, new Set())];
    let paramSets = [{}];
    for (const n of names) {
      const cand = PARAMS[n];
      assert.ok(cand, `${key}: a param "${n}" this test does not know the values of; add it to PARAMS`);
      paramSets = paramSets.flatMap((p) => cand.map((c) => ({ ...p, [n]: c })));
    }
    for (const st of stateCombos(entry)) for (const params of paramSets) {
      const P = resolveProps(entry, ctx, st, params);
      if (typeof P.fill !== 'string' || P.fill === 'none') continue;
      const fg = read(P.fill);
      const a = fg[3] * (P.opacity == null ? 1 : P.opacity) * (P.fillOpacity == null ? 1 : P.fillOpacity);
      if (a < 0.2 || P.hidden || P.none) continue;   // (a piece that is not there in this state: an entrance's first frame, a hidden or off word)
      const grounds = ['surface', 'surface-2'];
      if (P.paintStroke && typeof P.stroke === 'string') grounds.push(P.stroke);
      const size = typeof P.size === 'number' ? P.size : 12, weight = Number(P.weight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      for (const g of grounds) {
        const bg = read(g.startsWith('color(') || g.startsWith('#') || g.startsWith('rgb') ? g : tokens[g]);
        out.push({ key, state: JSON.stringify(st), params: JSON.stringify(params), look: id, ground: g, ratio: ratio(over(fg, a, bg), bg), need: large ? 3 : 4.5 });
      }
    }
  }
  return out;
}

// What fails today and is not this fix's to settle (the owner's calls): the quiet-by-opacity words (LOOK-7: the 65 to 70% dim is his rule, the third ink at full
// strength is the recommendation), Soft's own values (LOOK-5), and the series and band colours as words on Soft. A key listed here (any look) may stop failing and then
// must be taken off; none may be added.
const KNOWN = new Set(['path.t', 'path.s', 'path.st', 'path.sn', 'path.zl', 'path.op', 'path.pt', 'path.bb', 'path.bk', 'path.cs', 'path.csc', 'path.ct', 'path.ctc', 'path.word']);   // (the path figures' unlit words: UNLIT 0.7 and the cells' 0.75)

const failures = LOOK_IDS.flatMap((id) => measure(id).filter((m) => m.ratio < m.need));
const byKey = new Map();
for (const f of failures) {
  byKey.set(f.key, [...(byKey.get(f.key) || []), f]);
}

test('every chart word reads at 4.5:1 (3:1 when large) on its ground in all five looks', () => {
  const fresh = [...byKey.keys()].filter((k) => !KNOWN.has(k));
  const report = fresh.map((k) => { const w = byKey.get(k).sort((a, b) => a.ratio - b.ratio)[0]; return `${k} in ${w.look}: ${w.ratio.toFixed(2)}:1 on ${w.ground} (${w.state} ${w.params})`; });
  assert.deepEqual(report, []);
});

test('the known failures list only shrinks (an entry that now passes everywhere is taken off it)', () => {
  const healed = [...KNOWN].filter((k) => !byKey.has(k));
  assert.deepEqual(healed, []);
});

test('the measurement covers the text entries (a handful of them, so a rename cannot empty the test)', () => {
  const m = measure('light');
  const keys = new Set(m.map((x) => x.key));
  for (const k of ['talk.value', 'talk.read', 'inst.dial.w', 'prof.br.text', 'trial.warn', 'path.r', 'card.col.top', 'time.key.text']) assert.ok(keys.has(k), k);
  assert.ok(keys.size > 100, `${keys.size} text entries`);
});

test('the ink forms exist in every look and read at 4.5:1 on the card grounds', () => {
  for (const id of LOOK_IDS) {
    const t = withVarsResolved(tokensOfLook(id));
    for (const n of ['caution-ink', 'ok-ink', 'danger-ink', 'critical-ink', 'tr-pv-ink', 'tr-ppg-ink', 'tr-hvpg-ink', 'tr-wedge-ink', 'tr-sin-ink', 'tr-hv-ink', 'tr-ra-ink', 'tr-ivc-ink', 'tr-var-ink', 'tr-cav-ink', 'tr-scler-ink']) {
      assert.ok(t[n], `${id}: ${n}`);
      for (const g of ['surface', 'surface-2']) {
        const r = ratio(read(t[n]), read(t[g]));
        assert.ok(r >= 4.5 || (id === 'soft' && /^tr-/.test(n)), `${id}: ${n} on ${g} is ${r.toFixed(2)}:1`);
      }
    }
  }
});
