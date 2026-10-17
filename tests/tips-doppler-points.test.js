// TIPS Doppler's stent slides call out the stent's velocity at all three points (proximal, mid, distal), not only the sampled one
// (Mohammad, 15 Oct): the slide that teaches the three points, the narrowed stent, where it narrows and the reopened stent. Each
// callout reads what the Doppler's tile for its point reads, and the sampled one is named in the Doppler's green. After review the three
// stand in a column beside their own dots, in order, on one side chosen without the pick, and the "60 %" goes to the other side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPS_DOPPLER } from '../src/ui/decks/tips-doppler.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stage = read('src/ui/stage.js'), doppler = read('src/ui/doppler.js'), tools = read('src/ui/presenter-tools.js'), gl = read('src/ui/veins-gl.js'), css = read('styles/app.css');

test('the stent slides, and only they, call out all three points', () => {
  const on = TIPS_DOPPLER.slides.filter((s) => s.tool?.points).map((s) => s.id);
  assert.deepEqual(on, ['jet', 'narrow', 'where', 'fix']);
  for (const s of TIPS_DOPPLER.slides.filter((x) => x.tool?.points)) assert.equal(s.tool.vessel, 'TIPS', `${s.id} samples the stent`);
});

test("the presenter passes the slide's points to the figure, and the figure lays the labels out again when they change", () => {
  assert.match(tools, /stage\?\.pinDoppler\?\.\(t\.vessel \|\| 'PV_TRUNK', \{ points: !!t\.points \}\)/);
  assert.match(stage, /pinDoppler\(id, \{ points = false \} = \{\}\) \{ dop\.pin = id; dop\.points = !!id && points; dopApply\(\); \}/);
  assert.match(stage, /key = `\$\{id\}\|\$\{seg\}\|\$\{\+all\}`/);   // (dop.key is part of the label signature)
});

test('one callout per point, at its own third, the three in a column beside their dots on short leaders, before the slide\'s mark', () => {
  assert.match(stage, /for \(const point of \['proximal', 'mid', 'distal'\]\) \{\s*const \[ax, ay\] = worldToLocal\(\.\.\.pointAt\(geo\[sid\]\.cur, STENT_SITES\[point\]\)\);/);
  assert.match(stage, /it\.key = point \? `n:\$\{sid\}:\$\{point\}` : `n:\$\{sid\}`; it\.src = \['vel', sid, point\]/);
  assert.match(stage, /kind === 'vel' \? velItem\(id, f, mode\)/);   // (a live refresh keeps each callout's point)
  // (Review 15 Oct: in order, all on one side, each level with its own dot, a leader of 16 px at most.)
  assert.match(stage, /const colGap = \(sid\) => Math\.min\(16, /);
  assert.match(stage, /it\.pri = 8; it\.side = 'R'; it\.col = ptSide; it\.colGap = colGap\(sid\);/);   // (one priority: the pick never reorders them)
  assert.match(stage, /const COL = \[0, -6, 6, -12, 12, -18, 18\];/);
  // (Level with its dot first, a little farther out up to 16 px; slid up or down only after that.)
  // (The jet clears its narrowing's arrow level, past the arrow, before sliding off its dot's line: Mac slide 9 distal.)
  assert.match(stage, /const level = \[\.\.\.new Set\(\[it\.colGap, 12, 14, 16, \.\.\.\(it\.jet \? \[20, 24, 28, 32, 36, 40\] : \[\]\)\]\.filter\(\(g\) => g >= it\.colGap\)\)\];/);
  assert.match(stage, /const lv = \(credit\) => \[true, false\]\.flatMap\(\(clear\) => level\.map\(\(gap\) => \(\{ gap, leader: true, clear, credit \}\)\)\);/);
  assert.match(stage, /const sh = \(credit\) => \[true, false\]\.flatMap\(\(clear\) => COL\.slice\(1\)\.map/);
  // (Level first, then clear of the credit where it can be, then off the vessels; slid only when no level spot is left.)
  assert.match(stage, /if \(it\.point && it\.col && placeMulti\(it, \[it\.col\], \[\.\.\.lv\(true\), \.\.\.lv\(false\), \.\.\.sh\(true\), \.\.\.sh\(false\)\]\)\) continue;/);
  // (Review 15 Oct: the mark keeps off the vessels before it keeps off the credit, each spot nudged 8 px each way, its leader crossing
  // no label; the points' dots sit on a solid disc, drawn after every leader, and a leader ending at one stops 2 px outside it.)
  // (the mark's reaches off the vessels, then any spot off them within 150 px, nearest first, then the reaches over vessels)
  assert.match(stage, /const reach = \(clear\) => \[true, false\]\.flatMap\(\(credit\) => \[gap, gap \+ 20, gap \+ 52, gap \+ 84, gap \+ 120\]/);
  assert.match(stage, /\[\.\.\.reach\(true\), \{ grid: true \}, \.\.\.reach\(false\)\]/);
  assert.match(stage, /Math\.hypot\(x, y\) <= 150/);
  // (the "60 %" steps aside for the mark where it blocks it; a pill with no clear spot gets the stage-colour ring)
  assert.match(stage, /for \(const a of clampAlts\)/);
  assert.match(stage, /it\.cls \+= ' ring'/);
  assert.match(css, /\.lb\.focus\.ring \.lb-bg \{ stroke: var\(--stage-bg\); stroke-width: 4px; paint-order: stroke; \}/);
  assert.match(stage, /if \(it\.point\) dots\.push\(\{ k: 'h:' \+ it\.key, tag: 'circle', at: \{ class: 'leader-dot-halo'/);
  assert.match(stage, /leaders\.push\(\.\.\.dots\);/);
  assert.match(stage, /x0 = d\.ax \+ \(\(le\.x - d\.ax\) \/ L\) \* \(DISC \+ 2\)/);
  assert.match(read('styles/app.css'), /\.leader-dot-halo \{ fill: var\(--stage-bg\); \}/);
  // (The flow's arrowheads keep out from under the callouts and 12 px round each dot.)
  assert.match(stage, /\[dx, dy, dx, dy, 17 \* k\]/);
  assert.match(stage, /return Math\.hypot\(px - it\.ax - ex \* t, py - it\.ay - ey \* t\) < 18; \}\)\) return;/);   // the mark's leader passes no other dot
  assert.match(stage, /held = !moved && /);   // and does not hold a spot left by a dot that moved
  // (a point or the mark keeps 4 px off a card, so a point by an open monitor's card stays level; a held slid slot never beats a level one)
  assert.match(stage, /obstacles\.some\(\(o\) => hits\(r, \{ x0: o\.x0 - 4, y0: o\.y0 - 4, x1: o\.x1 \+ 4, y1: o\.y1 \+ 4 \}\)\)\) return;/);
  assert.match(stage, /held \? \(ps\.clear \? \(it\.point && it\.col \? 5e3 : 1e5\) : 4\) : 0\)/);
  // (the mark keeps 2 px off its own stent's drawn mesh in every pass; the "60 %" halo fills its digits' counters)
  assert.match(stage, /if \(mk && dop\.id && lineHits\(r, 3, \{ only: dop\.id \}\)\) return;/);
  assert.match(stage, /strokeWidth = CTM\.sc > 0 \? `\$\{\(7 \/ CTM\.sc\)\.toFixed\(2\)\}px`/);
  assert.match(stage, /holes\.push\(\[x0, y0, x1, y1, -5 \* k\]\)/);   // and along every leader ending at a point
  assert.match(gl, /if \(hr < 0\.0\) \{ vec2 ab = h\.zw - h\.xy;/);
  assert.match(stage, /holes: chevHoles/);
  assert.ok(stage.indexOf('if (it.point && it.col && placeMulti') < stage.indexOf('// Focus callout'), 'the points are placed before the mark');
});

test("the column's side is chosen from the stent and the screen, never the pick, and the narrowing's \"60 %\" takes the other side, 12 px at least", () => {
  const side = stage.slice(stage.indexOf('A stent called out at its three points: the three stand in a column'), stage.indexOf('// Stenosis clamps and their percentages'));
  assert.ok(side.length > 0 && !/dop\.seg|dopGateOf|st\.dopGate/.test(side), 'the side does not read the sampled point');
  assert.match(side, /lb-val' \? \{ \.\.\.r, t: '000' \}/);   // (a fixed template width: the values the pick changes do not tip it)
  assert.match(stage, /const away = col \? \(ptSide === 'E' \? 'W' : 'E'\) : null;/);
  assert.match(stage, /calc\(var\(--fs-12\) \/ \$\{CTM\.sc\.toFixed\(3\)\}\)/);
  assert.match(stage, /\{ proximal: 'Prox', mid: 'Mid', distal: 'Dist' \}\[point\]/);   // (short on a phone)
});

test("each point reads the Doppler tile's number: the open stent's velocity times that point's factor, the sampled one the monitor's own", () => {
  assert.match(doppler, /shownVel\.set\(probe, \{ v: Math\.abs\(mean\), t: performance\.now\(\), seg: isStentProbe\(\) \? gateOf\(\) : null, open \}\);/);
  assert.match(doppler, /stentReads\(open\)\.forEach/);   // (the tiles read from the same open velocity)
  assert.match(stage, /const vel = fresh && pt === gated \? dop\.v : \(fresh && Number\.isFinite\(dop\.open\) \? dop\.open : live\) \* factor;/);
});

test("the points' numbers take the velocity colours against the stent's normal; the sampled point is named in bold, the glow shows where", () => {
  assert.match(stage, /const nv = point \? velNormal\(EI\[sid\], f\) : null, tint = nv && !none \? `color-mix\(in srgb, \$\{velocityColor\(vel, nv\)\} var\(--vel-ink\), var\(--text\)\)` : '';/);
  assert.match(stage, /sampled \? \{ weight: 750, cls: 'lb-name lb-gate' \} : \{\}/);
  assert.match(stage, /\.\.\.\(tint \? \{ fill: tint \} : \{\}\)/);
  // (A colour change only repaints the number: it is not part of the label's structure, which rebuilds its text.)
  assert.match(stage, /line\.map\(\(\{ t, fill, cls, \.\.\.style \}\) => style\)/);
  assert.doesNotMatch(read('styles/app.css'), /lb-gate \{ fill/);
});
