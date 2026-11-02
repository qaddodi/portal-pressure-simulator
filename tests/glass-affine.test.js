// The glass follows a card's zoom from its transform (glass-motion.js: scale about an origin, CSS's own interpolation), and the split
// sheet's panes from --pz-u (sheet-glass.js), with no read of the page in a frame (2 Nov 2026: "CARDS ARE GLASS").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fnsOf, affineOf, lerpFns, aboutOrigin, mapBox, unmapBox, motionAffAt, movesOnly, affMul } from '../src/ui/glass-motion.js';
import { sheetPanes, uOf } from '../src/ui/sheet-glass.js';

const near = (a, b, msg) => { for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-9, `${msg}: ${a} vs ${b}`); };

test('a transform as translations and scales, one affine; a turn, a skew or a flip is not followed', () => {
  near(affineOf('translate(10px, 4px) scale(2)'), [2, 2, 10, 4], 'translate then scale');
  near(affineOf('scale(2) translate(10px, 4px)'), [2, 2, 20, 8], 'scale then translate');
  near(affineOf('matrix(1.5, 0, 0, 1.5, 3, -2)'), [1.5, 1.5, 3, -2], 'a computed matrix');
  near(affineOf('none'), [1, 1, 0, 0], 'none');
  near(affineOf('translateY(-18px)'), [1, 1, 0, -18], 'translateY');
  for (const t of ['rotate(4deg)', 'skewX(2deg)', 'scale(-1)', 'translate(50%, 0)', 'matrix(1, 0.1, 0, 1, 0, 0)']) assert.equal(affineOf(t), null, t);
});

test('keyframes interpolated as CSS does: function by function against none or a like list, as matrices where they stop matching', () => {
  near(lerpFns(fnsOf('none'), fnsOf('translate(100px, 40px) scale(2)'), 0.5), [1.5, 1.5, 50, 20], 'none to the zoom');
  // (scale(s) translate(x): function by function the translation grows with the scale; as a matrix it would be eased in a line)
  near(lerpFns(fnsOf('scale(1) translate(0px, 0px)'), fnsOf('scale(3) translate(10px, 0px)'), 0.5), [2, 2, 10, 0], 'like lists');
  near(lerpFns(fnsOf('matrix(2, 0, 0, 2, 40, 10)'), fnsOf('none'), 0.25), [1.75, 1.75, 30, 7.5], 'a glide back caught as a matrix');
  near(lerpFns(fnsOf('matrix(2, 0, 0, 2, 40, 10)'), fnsOf('translate(0px, 0px) scale(3)'), 0.5), [2.5, 2.5, 20, 5], 'unlike lists: as matrices');
  const kf = [{ computedOffset: 0, easing: 'linear', transform: 'none' }, { computedOffset: 1, easing: 'linear', transform: 'translate(20px, 0px) scale(2)' }];
  near(motionAffAt(kf, 0.5).m, [1.5, 1.5, 10, 0], 'motionAffAt');
  near(motionAffAt([{ computedOffset: 0, easing: 'linear', translate: '0px 0px' }, { computedOffset: 1, easing: 'linear', translate: '0px -30px' }], 0.5).tr, [0, -15], 'the translate property');
  assert.equal(motionAffAt([{ computedOffset: 0, easing: 'linear', transform: 'none' }, { computedOffset: 1, easing: 'linear', transform: 'rotate(3deg)' }], 0.5), null);
});

test('scaled about its origin, a box lands where the page draws it, and comes back', () => {
  // (A 200 x 100 card at (100, 50), origin at its middle, zoomed ×2 and moved 30 px right: its middle moves 30 px, its size doubles.)
  const a = aboutOrigin([2, 2, 30, 0], [0, 0], [200, 100]);
  const r = mapBox({ left: 100, top: 50, width: 200, height: 100 }, a);
  near([r.left, r.top, r.width, r.height], [30, 0, 400, 200], 'the zoomed box');
  const b = unmapBox(r, a);
  near([b.left, b.top, b.width, b.height], [100, 50, 200, 100], 'back where it rests');
  // (A layout px is k page px: translations and the origin's own offset are taken at that scale.)
  near(aboutOrigin([1, 1, 10, 0], [5, 0], [0, 0], 2), [1, 1, 30, 0], 'k');
  near(affMul([2, 2, 1, 0], [1, 1, 5, 0]), [2, 2, 11, 0], 'outer over inner');
});

test('a sheet\'s --pz-u, and the rises riseShift follows, change nothing the glass reads the page for', () => {
  const F = new Set(['--pz-u', '--pz-lift', '--pz-rise']);
  assert.ok(movesOnly('--pz-u: 0.2000;', '--pz-u: 0.3000;', F));
  assert.ok(movesOnly('', '--pz-lift: 12.0px;', F));
  assert.ok(!movesOnly('--pz-u: 0.2000;', '--pz-u: 0.3000;'), 'without the list, as before');
  assert.ok(!movesOnly('--pz-u: 0.2;', '--pz-u: 0.3; width: 10px;', F), 'a size still reads the page');
});

test('the sheet\'s panes move with --pz-u as app.css lays them, the instrument card cut out on the GPU', () => {
  const box = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
  const pe = (o) => ({ content: '""', display: 'block', visibility: 'visible', opacity: '1', left: '-1px', top: '-1px', right: '-1px', bottom: '-1px', borderTopLeftRadius: '18px', borderTopRightRadius: '18px', borderBottomRightRadius: '18px', borderBottomLeftRadius: '18px', backgroundColor: 'rgba(250, 250, 250, 0.58)', ...o });
  const mk = (wide, cls) => ({
    classList: { contains: (c) => c === 'pz-sheet' || cls.includes(c) },
    closest: (q) => (q.includes(wide ? '.pz-wide' : '.stack') ? {} : null),
    style: { getPropertyValue: (n) => (n === '--pz-u' ? '0.25' : '') },
    getBoundingClientRect: () => box(10, 100, 300, 200),
    offsetWidth: 300,
    ps: { '::before': pe({ bottom: '19px' }), '::after': pe({ left: '7px', right: '7px', top: '170px', bottom: '-25px' }) },
  });
  const gcs = (e, p) => (p ? e.ps[p] : { borderLeftWidth: '0px', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', getPropertyValue: (n) => (n === '--pz-d' ? '80px' : '0') });
  const [back, front] = sheetPanes(mk(false, ['pz-sliding']), gcs);
  assert.equal(back.u.at(), 0.25, 'how far out, from the inline value while it slides');
  assert.deepEqual([back.u.top, back.u.bottom, front.u.top, front.u.bottom], [56, 56, 0, 0], 'the phone: the readings\' card goes down with the box\'s foot, 24 px less');
  assert.deepEqual(back.cut.r, front.r, 'the instrument card is what is cut out of it');
  assert.deepEqual(back.rad, [18, 18, 18, 18]);
  const [wb, wf] = sheetPanes(mk(true, []), gcs);
  assert.deepEqual([wb.u.top, wb.u.bottom, wf.u.top, wf.u.bottom], [24, 24, 80, 80], 'the wide card: the instrument card goes down with the box\'s foot');
  assert.equal(uOf(mk(true, ['tool-open'])), 1, 'at rest, the class');
});

test('glass-gl follows the zoom and the sheet from the transform and --pz-u, and no longer reads the page each frame for them', () => {
  const gg = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  assert.match(gg, /const moveOf = AFFINE \? moveAff : moveOld;/);
  assert.match(gg, /if \(uMode == 1 && uCut\.z > 0\.0\) m \*= 1\.0 - boxCover\(p - uCut\.xy, uCut\.zw, uCutR\);/, 'the cut drawn on the GPU');
  assert.match(gg, /panes\.push\(\{ \.\.\.p, r: mapBox\(uMove\(p\.r0, p\.u, du\), A\), er: mapBox\(uMove\(p\.er0, p\.u, du\), A\), a, rad, cut, z \}\);/);
  assert.match(gg, /const boxOf = \(e\) => \(AFFINE \? readOwnBox\(e\) : readBox\(e\)\);/, 'the page\'s own box, never a zoomed card\'s stand-in');
});
