// The wallet of the words' card and the data card on a screen too short for both (19 Nov 2026, Mohammad: "let's do wallet and can be swiped up or down and change the card ... and card
// centered vertically", from the mock /mnt/project-files/sideways-alt-mocks/index.html; it replaced the depth-stack Shuffle, "SUCKS", of the 19 Nov play-test). The pure parts run here; the page's
// behaviour is read from the source. (The files kept the Shuffle's names: card-shuffle.js, the pz-shuf classes.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arrowsOwnKey } from '../src/ui/key-owner.js';
import { SHUF, shufMaxH, shufTop, shufFall, shufPoseCss, shufBehind, shufKeyframes, shufInk, shufName, spring, shufEnd, shufFrom, shufDrag, shufDir, createShuffle } from '../src/ui/card-shuffle.js';
import { WORDS_MIN_PX } from '../src/ui/card-type.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('at p = 0 the words are in front and the instrument waits at the foot; at p = 1 it is the other way round', () => {
  assert.equal(shufBehind('words', 0), 0); assert.equal(shufBehind('data', 0), 1);
  assert.equal(shufBehind('words', 1), 1); assert.equal(shufBehind('data', 1), 0);
  assert.equal(shufBehind('text', 1), 1, 'the words\' own layer goes with the glass');
  assert.equal(shufPoseCss('words', 0, { H: 393, pad: 0 }), 'translateY(calc(0.000% + 0.00px))');
});

test('a card at the foot shows its top 48 px: it stands centred at rest and falls to H less the strip', () => {
  // (H = 393: a card of height h at rest has its top at (H - h) / 2; the fall must put it at H - strip.)
  for (const h of [180, 264, 269]) {
    const top = (393 - h) / 2, fall = shufFall('data', h, { H: 393, pad: 0 });
    assert.ok(Math.abs(top + fall - (393 - SHUF.strip)) < 1e-9, `${h}`);
  }
  assert.equal(SHUF.strip, 48);
});

test('the card in front is centred with room for the strip below it and the same above, and its largest height is what is left', () => {
  assert.equal(shufMaxH(393), 393 - 2 * (SHUF.strip + SHUF.gap));
  assert.ok(shufMaxH(393) >= 266 && shufMaxH(393) <= 270, 'about 268 px on an iPhone on its side');
  assert.equal(shufMaxH(100), 0);
  assert.ok(shufMaxH(393, 1) >= 282 && shufMaxH(393, 1) > shufMaxH(393), 'the tight room (a slide no column fits at the usual gap) holds the 282 px cards of the gallery');
  assert.equal(shufMaxH(393, 1), 393 - 2 * (SHUF.strip + SHUF.gapTight));
  assert.equal(shufMaxH(393, 2), 393 - SHUF.edge - SHUF.strip - SHUF.gapTight, 'the last room: from the top edge to the strip\'s top, so a card needing 330 px never has its words shrunk');
  // (the tallest card stands with its foot a gap above the strip: top + h + gap = H - strip)
  const h = shufMaxH(393), top = (393 - h) / 2;
  assert.equal(top + h + SHUF.gap, 393 - SHUF.strip);
});

test('the cards move by a translation only: no scale, no turn, no clip (the glass follows a translation and an opacity, nothing else)', () => {
  const m = src('src/ui/card-shuffle.js');
  assert.doesNotMatch(m, /scale\(|rotate\(|clipPath|clip-path/, 'no scale, turn or clip');
  const k = shufKeyframes('words', { H: 393, pad: 20 });
  for (const f of k.tf) assert.match(f.transform, /^translateY\(calc\(-?[\d.]+% \+ -?[\d.]+px\)\)$/);
});

test('the keyframes run from offset 0 to 1 in even steps', () => {
  const k = shufKeyframes('data');
  for (const list of [k.tf, k.ink, k.name]) {
    assert.equal(list.length, SHUF.steps + 1);
    assert.equal(list[0].offset, 0); assert.equal(list.at(-1).offset, 1);
  }
});

test('the spring settles on its end without passing it, and a release goes the way the finger was going', () => {
  let p = 0, v = 0, over = 0, n = 0;
  for (; n < 400; n++) { const s = spring(p, v, 1, 1 / 60); p = s.p; v = s.v; over = Math.max(over, p - 1); if (s.done) break; }
  assert.ok(n < 100, `${n} frames`);
  assert.equal(p, 1); assert.ok(over < 1e-6, 'no overshoot');
  assert.equal(shufEnd(0.4, 0), 0); assert.equal(shufEnd(0.6, 0), 1);
});

test('a swipe up or a swipe down changes the card, whichever card is in front; a nudge goes to the nearer end (Mohammad: "swiped up or down and change the card")', () => {
  for (const dy of [-60, 60]) {
    assert.equal(shufDir(0.3, 0, dy, 0), 1, `from the words, ${dy}`);
    assert.equal(shufDir(0.7, 0, dy, 1), 0, `from the instrument, ${dy}`);
  }
  assert.equal(shufDir(0.2, 1.2, 5, 0), 1, 'a quick flick counts, however short'); assert.equal(shufDir(0.8, -1.2, -5, 1), 0);
  assert.equal(shufDir(0.4, -1.2, 40, 0), 0, 'thrown back, it goes back');
  assert.equal(shufDir(0.7, 0, 4, 0), 1, 'a nudge goes to the nearer end'); assert.equal(shufDir(0.3, 0, -4, 0), 0);
  // (a finger either way takes p toward the end it did not start from, and stops there)
  assert.equal(shufFrom(0.2), 0); assert.equal(shufFrom(0.8), 1);
  assert.equal(shufDrag(0, 95), 0.5); assert.equal(shufDrag(0, -95), 0.5); assert.equal(shufDrag(1, 95), 0.5); assert.equal(shufDrag(1, -95), 0.5);
  assert.equal(shufDrag(0, -1000), 1); assert.equal(shufDrag(1, 1000), 0);
  const sh = createShuffle({ ui: null }); assert.equal(sh.active(), false);
  let p = 0; for (let i = 0; i < 6; i++) p = shufDir(p, 0, i % 2 ? -40 : 40, p);
  assert.equal(p, 0, 'six swipes, either way, end with the words in front');
});

test('the words and numbers of a card behind are not there, and come in only as the card arrives; the strip\'s name is there while the card is behind', () => {
  assert.equal(shufInk(0), 0); assert.equal(shufInk(1), 1);
  for (const f of [0, 0.2, 0.5]) assert.equal(shufInk(f), 0, `a card ${f} of the way forward shows no words yet (no half line shows past the card crossing it)`);
  assert.equal(shufInk(0.7), 1, 'whole 0.2 of the way past the middle');
  assert.equal(shufInk(0.98), 1);
  let last = -1;
  for (let i = 0; i <= 40; i++) { const v = shufInk(i / 40); assert.ok(v >= last - 1e-12, 'only ever more of the words as the card comes forward'); last = v; }
  assert.equal(shufName(0), 1); assert.equal(shufName(1), 0); assert.equal(shufName(0.06), 0); assert.equal(shufName(0.5), 0);
  const k = shufKeyframes('data');
  const at = (list, p) => +list[Math.round(p * SHUF.steps)].opacity;
  assert.equal(at(k.ink, 0), -1, 'behind, the contents\' opacity is taken to nothing'); assert.equal(at(k.ink, 1), 0, 'in front, nothing is added');
  assert.equal(at(k.name, 0), 1); assert.equal(at(k.name, 1), 0);
});

test('the layout gives every pair on a phone on its side the wallet, centred, and a card with readings to tuck is not one', () => {
  const s = src('src/ui/presenter-ladders.js');
  assert.match(s, /if \(sw && !wideSheet\(dd\)\) \{/, 'every pair on a short sideways screen, not only one too tall to stack');
  assert.match(s, /live\.shuffle\?\.park\(\);\s*\n\s*try \{ layoutNow\(\); \} finally \{ live\.shuffle\?\.resume\(\); \}/);
  assert.match(s, /live\.shuffle\?\.sync\(shuf, lockKey \|\| '', \{ H: H \/ k, pad: pad \/ k \}\)/);
  assert.match(s, /let y = shuf \? top0 :/);
  assert.match(s, /shift = shuf \? shufTop\(H, t\.height \+ 2 \* pad, 4 \* k, k\) - top0/, 'the words\' glass is centred by its own height, or as high as it must stand to clear the strip');
  assert.match(s, /ddTop = shufTop\(H, hd, 4 \* k, k\)/, 'and the instrument by its own');
  assert.match(s, /!shuf && !wideSheet\(dd\)\) rise = pairRise/, 'a wallet does not rise');
  assert.match(s, /textLock = \{ key: lockKey, below, shuf, room, col: colIx,/, 'the wallet and its column are part of what a slide keeps');
  assert.match(s, /'--pz-sx'/, 'the pair is shifted to the middle by the one left margin');
  const css = src('styles/app-04-presenter.css');
  assert.match(css, /left: calc\(var\(--pz-cm\) \+ var\(--pz-sx, 0px\)\)/);
  assert.match(css, /left: calc\(var\(--pz-cm\) \+ var\(--pz-cp\) \+ var\(--pz-sx, 0px\)\)/);
});

test('the column is 400 px first and widens only when a slide needs it; the type never gets smaller for it', () => {
  assert.deepEqual(SHUF.cols.map((c) => parseInt(/(\d+)px/.exec(c)[1], 10)), [400, 460, 520]);
  for (const c of SHUF.cols) assert.match(c, /^min\(\d+px, \d+vw\)$/);
  const l = src('src/ui/presenter-ladders.js');
  assert.match(l, /for \(colIx = 0; colIx < SHUF\.cols\.length; colIx\+\+\) \{/);
  assert.match(l, /both = fits && dataFits;\n\s*if \(both \|\| colIx === SHUF\.cols\.length - 1\) break;/);
  assert.match(l, /for \(room = 0; room < 3; room\+\+\) \{\n\s*foot = top0 \+ shufMaxH\(H \/ k, room\) \* k;/, 'no column fits at the usual gap: the tight room is tried before the widest column is kept');
});

test('the data card goes back to the 12 px floor on a short sideways phone: the Shuffle\'s 10 px allowance is gone', () => {
  const t = src('src/ui/tool-path.js');
  assert.match(t, /floor = given > 0 \? 1 : FIT_MIN;/);
  assert.doesNotMatch(t, /pz-shuf/);
});

test('the fit parks the wallet while it measures, and nothing scrolls inside a card for want of room', () => {
  const z = src('src/ui/presenter-zoom.js');
  assert.match(z, /live\.shuffle\?\.park\(\);[^\n]*\n\s*try \{ fitEach\(els\); \} finally \{ live\.shuffle\?\.resume\(\); \}/);
  assert.doesNotMatch(z, /pz-scrolls/);
  assert.doesNotMatch(src('styles/app-05-presenter-cards.css'), /pz-scrolls/);
  assert.match(z, /Math\.min\(1, WORDS_MIN_PX \/ sm\)/, 'the words\' zoom never takes lettering under 12 px');
  assert.equal(WORDS_MIN_PX, 12);
});

test('the swipe up or down changes the card only once it is clearly up or down, on a card or the figure, and never over a control', () => {
  const p = src('src/ui/presenter.js');
  assert.match(p, /live\.shuffle = createShuffle\(live\)/);
  assert.match(p, /const k = cardSwipe\(t\.clientX - shufT\.x, t\.clientY - shufT\.y\);\s*\n\s*if \(k < 0\) \{ shufT = null; return; \}/);
  assert.match(p, /shufT\.on = true; sw = null;/, 'the slide swipe lets go of it');
  assert.match(p, /ownsTouch\(e\.target\.closest\?\.\('canvas'\)\?\.parentElement \?\? e\.target/);
});

test('the wallet moves cards only by animations (a translation added to its own, an opacity), scrubbed on the frame scheduler', () => {
  const m = src('src/ui/card-shuffle.js');
  assert.doesNotMatch(m, /requestAnimationFrame/);
  assert.match(m, /frameFor\('shuffle'\)/);
  assert.match(m, /composite: 'add'/);
  assert.match(m, /pseudoElement: '::after'/);
  assert.doesNotMatch(m, /style\.(transform|translate|scale|rotate|clipPath|opacity)\s*=/, 'no inline style is written per frame');
  const css = src('styles/app-05-presenter-cards.css');
  assert.match(css, /\.pz-shade\.pz-shuf::after/);
  assert.match(css, /content: attr\(data-strip\)/, 'the strip\'s name');
  assert.match(css, /\.pz\.pz-shuf\.pz-shuf-data \.pz-data \{ z-index: 3; \}/);
});

test('the card coming forward is above the other for the whole change, so no layer is swapped where both show', () => {
  const m = src('src/ui/card-shuffle.js');
  assert.match(m, /r\.classList\.toggle\('pz-shuf-data', rising === 'data'\)/);
  assert.match(m, /rising = shufFrom\(p0\) === 0 \? 'data' : 'words'/, 'a finger down: the card behind is the one rising');
  assert.doesNotMatch(m, /p > 0\.5\) r\.classList/, 'not by the position, which flips at the middle');
});

test('the words of a wallet card are fitted alone: Regular, then the title a step down, then the CAUSES line gone (play-test: words clipped by 16 to 37 px)', () => {
  const s = src('src/ui/presenter-ladders.js');
  assert.match(s, /const ch0 = ch, gap0 = gap; ch = 0; gap = 0;\s*\n\s*trim = 0;\s*\n\s*let fits = steps\(\);\s*\n\s*if \(!fits\) for \(const n of \[1, 2\]\) \{ trim = n; fits = steps\(\); if \(fits\) break; \}/);
  assert.doesNotMatch(s, /if \(!fits\) for \(const n of \[0, 1, 2\]\) \{ trim = n; if \(step\(\)\)/, 'never Compact: the teaching card\'s body text does not shrink to fit (2a8217e3); the card takes more room instead');
  assert.match(s, /fits = steps\(\); if \(fits\) break; \}\s*\n\s*ch = ch0; gap = gap0;/);
  assert.match(src('src/ui/gallery/fit-rules.js'), /content runs \$\{Math\.round\(low\)\} px past its box/);
});

test('the strip of the card behind is a place on the screen: the touch glue asks the wallet, not the elements', () => {
  const p = src('src/ui/presenter.js');
  assert.match(p, /behind: sh\.stripHit\(t\.clientX, t\.clientY\)/);
  assert.doesNotMatch(p, /behind\.contains\(e\.target\)/);
  assert.match(src('src/ui/card-shuffle.js'), /function stripHit\(x, y\)/);
  assert.match(src('src/ui/presenter-start.js'), /tapTracker\(data, \{ ok: \(\) => \(zoomReady\(\) && !\(live\.shuffle\?\.active\(\) && live\.shuffle\.front\(\) !== 'data'\)\) \|\| zoom\.up/);
});

test('the glass of the card behind is not cut: it stands partly past the screen\'s foot, where nothing is drawn', () => {
  const m = src('src/ui/card-shuffle.js');
  assert.match(m, /cutOf: \(\) => null/);
  assert.match(src('src/ui/presenter-start.js'), /cut: \(g\) => live\.shuffle\?\.cutOf\(g\) \|\| null/);
});

test('a card zoomed from a wallet comes forward first and the other is never enlarged', () => {
  const l = src('src/ui/presenter-ladders.js');
  assert.match(l, /sh\.hold\('data'\);\s*await until\(\(\) => !live\.ui \|\| sh\.settled\(\), 900\);/);
  assert.match(l, /if \(focus === 'text'\) return;/);
  assert.match(src('src/ui/presenter-start.js'), /scene: \(\) => \(live\.shuffle\?\.active\(\) \? \[\] : \[text, shade\]\)/);
  assert.match(src('src/ui/card-shuffle.js'), /if \(live\.ui\?\.zoom\?\.on\) return;/, 'the pair holds still while a card is zoomed');
});

test('each strip is named by the slide: the words\' by its kicker, the instrument\'s by its title', () => {
  const l = src('src/ui/presenter-ladders.js');
  assert.match(l, /function stripNames\(\)/);
  assert.match(l, /sl\?\.kicker \|\| live\.deck\?\.head \|\| 'The words'/);
  assert.match(l, /sl\?\.tool\?\.title \|\| sl\?\.tool\?\.short/);
});

test('no text ever stands over other text while the cards change: a name or words of the card sinking never meet the words of the card rising (the strip, the words, every height, every p)', () => {
  const H = 393, PAD = 16, vis = 0.02;
  const topAt = (h, g) => (H - h) / 2 + g * (h / 2 + H / 2 - SHUF.strip);   // the pose's own sum: a card h tall, g of the way to the foot
  let worst = Infinity;
  for (const hr of [120, 180, 240, 269, 281]) for (const hs of [120, 180, 240, 269, 281]) {
    for (let i = 0; i <= 400; i++) {
      const p = i / 400;
      for (const dir of [0, 1]) {   // 0: the instrument rises (p 0 to 1); 1: the words rise (the same p seen the other way)
        const q = dir === 0 ? p : 1 - p;   // how far the card rising is forward
        const fr = q, fs = 1 - q;
        const gr = 1 - fr, gs = 1 - fs;
        const inkR = shufInk(fr), inkS = shufInk(fs), nameS = shufName(fs);
        assert.ok(!(inkR > vis && inkS > vis), `the words of both cards show at once at ${p}`);
        const tr = topAt(hr, gr), ts = topAt(hs, gs);
        const ink = [tr + PAD, tr + hr - PAD], name = [ts + 22, ts + 34];
        if (inkR > vis && nameS > vis) {
          const gap = Math.max(name[0] - ink[1], ink[0] - name[1]);
          worst = Math.min(worst, gap);
          assert.ok(gap >= 0, `the name of the card sinking is over the words of the card rising: heights ${hr}/${hs}, p ${p}, dir ${dir}`);
        }
      }
    }
  }
  assert.ok(worst > -1);
});

test('the Up and Down keys change the card as a swipe does, where the wallet stands, and leave a menu, a field, a slider and the dock\'s divider their own', () => {
  globalThis.requestAnimationFrame ??= (f) => setTimeout(() => f(performance.now()), 16);
  const live = { ui: { root: { classList: { toggle() {} } }, text: null, shade: null, data: null, zoom: { on: false } } };
  const sh = createShuffle(live);
  assert.equal(sh.swap(), false, 'off: no swap');
  sh.sync(true, 'k', { H: 393, pad: 16 });
  assert.equal(sh.active(), true);
  assert.equal(sh.swap(), true); assert.equal(sh.front(), 'words', 'the change has begun, not landed');
  live.ui.zoom.on = true; assert.equal(sh.swap(), false, 'a zoomed card holds the pair still');
  live.ui.zoom.on = false;
  const p = src('src/ui/presenter.js');
  assert.match(p, /else if \(\(k === 'ArrowUp' \|\| k === 'ArrowDown'\) && live\.shuffle\.active\(\) && !popoverOpen\(\) && !arrowsOwnKey\(e\.target\)\) \{ if \(!e\.repeat\) live\.shuffle\.swap\(\); \}/);
  assert.match(p, /import \{ controlOwnsKey, arrowsOwnKey \} from '\.\/key-owner\.js';/);
  assert.match(src('src/ui/main.js'), /\['↑ · ↓', 'Change the card/, 'the Guide lists them');
});

test('arrowsOwnKey: a field, a slider, a menu row, the dock\'s divider keep Up and Down; the page and a plain button do not', () => {
  const el = (matches) => ({ closest: (sel) => (sel.split(',').map((x) => x.trim()).includes(matches) ? {} : null) });
  for (const m of ['input', 'select', 'textarea', '[role="slider"]', '[role="separator"]', '[role="menuitem"]', '[role="listbox"]', '[role="radiogroup"]']) assert.equal(arrowsOwnKey(el(m)), true, m);
  assert.equal(arrowsOwnKey(el('button')), false); assert.equal(arrowsOwnKey(null), false); assert.equal(arrowsOwnKey({}), false);
});

test('the words hand over at the middle of the change with no blank gap: one card\'s are gone as the other\'s begin, and at no p are neither on the screen for long', () => {
  const kd = shufKeyframes('data'), kw = shufKeyframes('words');
  const inkAt = (k, p) => { const x = p * SHUF.steps, i = Math.min(SHUF.steps - 1, Math.floor(x)), a = +k.ink[i].opacity + 1, b = +k.ink[i + 1].opacity + 1; return a + (b - a) * (x - i); };   // (what the keyframes give between their points)
  let blank = 0, prev = null, longest = 0;
  for (let i = 0; i <= 1000; i++) {
    const p = i / 1000, d = inkAt(kd, p), w = inkAt(kw, p);
    assert.ok(!(d > 0.02 && w > 0.02), `both cards' words show at p ${p}`);
    if (d < 0.1 && w < 0.1) { blank += 1; longest = Math.max(longest, blank); } else blank = 0;
    prev = [d, w];
  }
  void prev;
  assert.ok(longest <= 45, `the words are both nearly gone for ${longest / 10}% of the change (a flash); the handoff is one straight ramp each, the middle is a point`);
  assert.equal(inkAt(kd, 0.5), 0); assert.equal(inkAt(kw, 0.5), 0);
  assert.ok(inkAt(kw, 0.3) > 0.99 && inkAt(kd, 0.7) > 0.99, 'the card leaving keeps its words to p 0.3, the card arriving has them whole from p 0.7');
});

test('a card in front that stands over the strip is touched as itself: the strip answers only below the front card\'s foot', () => {
  const s = src('src/ui/card-shuffle.js');
  assert.match(s, /const f = anims\.find\(\(x\) => x\.card !== behind && x\.glass\);\n\s*if \(f && y < f\.top \+ shufFall\(f\.layer, f\.h\) \* shufBehind\(f\.layer, p\) \+ f\.h\) return false;/);
});

test('every scrub wakes the glass, so the plate and the words move together with no frame of lag', () => {
  const c = src('src/ui/card-shuffle.js');
  assert.match(c, /import \{ signalMove \} from '\.\/num-move\.js';/);
  assert.match(c, /function scrub\(\) \{[^\n]*signalMove\(\); \}/);
});

test('a front card\'s foot is never below the strip\'s top: the full 48 px strip always shows, whatever the card\'s height (centred where it can be, as high as the edge where it cannot)', () => {
  for (const H of [320, 360, 393, 430, 480]) for (let h = 60; h <= shufMaxH(H, 2); h += 5) {
    const top = shufTop(H, h, SHUF.edge), foot = top + h;
    assert.ok(foot <= H - SHUF.strip - SHUF.gapTight + 1e-9, `H ${H}, h ${h}: foot ${foot} is over the strip (top ${H - SHUF.strip})`);
    assert.ok(top >= SHUF.edge - 1e-9, `H ${H}, h ${h}: the card is above the screen`);
    if (h <= shufMaxH(H, 1)) assert.ok(Math.abs(top - (H - h) / 2) < 1e-9, `H ${H}, h ${h}: a card that fits is centred`);
  }
  assert.equal(shufTop(393, 335, 4), 4, 'a 335 px card stands at the top edge, its foot 339, the strip from 345'); assert.equal(shufTop(393, 330, 4), 9);
  assert.equal(shufMaxH(393, 2), 335);
});
