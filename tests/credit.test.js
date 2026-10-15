// The copyright credit must ship on every build, drawn over the figure in every view and never covered by it or by a
// card: cards and sheets leave the corner clear (the credit rises above a docked card, a sheet or a stacked slide card),
// and only a full-screen menu, popover or dialog may pass over it while open. A merge once dropped the markup and the credit vanished without any error, so the markup, its
// place in the page and its layer are all checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const CREDIT = '<div class="stage-credit" aria-hidden="true">&copy; 2026 Mohammad Almeqdadi, MD</div>';

test('copyright credit markup is in index.html', () => {
  assert.match(html, /<meta name="copyright" content="&copy; 2026 Mohammad Almeqdadi, MD" \/>/);
  assert.ok(html.includes(CREDIT), 'the credit element is missing');
});

test('copyright credit sits in the stage, right after the figure', () => {
  // Inside the stage view, layers added later (the lobule) would cover it; outside the stage, it would no longer share
  // a layer with the figure. Cards, sheets and the dock follow it in the stage, and menus and dialogs live in the body.
  const view = html.indexOf('<div class="stage-view" id="stageView">');
  assert.ok(view >= 0, 'the stage view was not found');
  let depth = 0;
  let end = -1;
  for (const m of html.slice(view).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (!depth) { end = view + m.index; break; }
  }
  const at = html.indexOf(CREDIT);
  assert.ok(end > view && at > end && at < html.indexOf('</main>'), 'the credit must follow the stage view inside the stage');
});

test('copyright credit is on the figure layer, placed by script, and never takes a tap', () => {
  const rule = css.match(/\.stage-credit \{ position[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /z-index: var\(--z-figure\);/);
  assert.match(rule, /pointer-events: none;/);
  assert.match(rule, /translate: var\(--cx/);
  assert.match(css, /\.app\.presenting \.stage-credit \{ z-index: calc\(var\(--z-hud\) \+ 1\); \}/);
  assert.match(css, /\.stage-credit:not\(\.placed\), \.stage-credit\.moving, \.stage-credit\.covered \{ opacity: 0; \}/);
});

// The placement itself: a free box nearest each corner, never within the gap of a card.
const { freeSpots, pickCorner } = await import('../src/ui/credit.js');
const fig = { l: 0, t: 0, r: 390, b: 700 }, W = 200, H = 14;
const clear = (s, obs) => obs.every((o) => s.x + W + 10 <= o.l || s.x - 10 >= o.r || s.y + H + 10 <= o.t || s.y - 10 >= o.b);

test('credit keeps the bottom-left corner on a bare figure', () => {
  const s = freeSpots(fig, [], W, H);
  assert.deepEqual(s.bl, { x: 12, y: 700 - 12 - H });
  assert.equal(pickCorner(s, null), 'bl');
});

test('copyright credit shrinks while a card sits beneath it', () => {
  assert.match(css, /\.stage-credit\.busy \{ scale: \.875; \}/);
  assert.match(css, /\.stage-credit \{[^}]*scale: \.875/);
  assert.match(css, /\.stage-credit\.busy \{ scale: \.75; \}/);
});

test('credit rides above a card at the bottom, clear of it', () => {
  const card = { l: 0, t: 520, r: 390, b: 700 };
  const s = freeSpots(fig, [card], W, H);
  assert.ok(s.bl && clear(s.bl, [card]) && s.bl.y + H <= 510);
});

test('credit moves to a top corner when cards cover the lower half', () => {
  const obs = [{ l: 0, t: 0, r: 390, b: 60 }, { l: 0, t: 300, r: 390, b: 700 }];
  const s = freeSpots(fig, obs, W, H);
  assert.equal(s.bl, null);
  assert.equal(pickCorner(s, null), 'tl');
  assert.ok(clear(s.tl, obs));
});

test('credit keeps its current corner while it stays free, and hides when no figure is left', () => {
  const s = freeSpots(fig, [{ l: 0, t: 600, r: 230, b: 700 }], W, H);
  assert.equal(pickCorner(s, 'br'), 'br');
  const none = freeSpots(fig, [{ l: 0, t: 0, r: 390, b: 700 }], W, H);
  assert.equal(pickCorner(none, 'bl'), null);
});

test('credit takes the strip of figure between two cards, on two lines, when the corners are covered (phone held sideways)', () => {
  const land = { l: 0, t: 0, r: 844, b: 390 };
  const obs = [{ l: 0, t: 0, r: 365, b: 390 }, { l: 522, t: 31, r: 822, b: 359 }];
  const one = freeSpots(land, obs, 210, 17, { inset: 12 });
  assert.equal(pickCorner(one, null), null, 'one line does not fit the strip');
  const two = freeSpots(land, obs, 101, 34, { inset: 12 });
  const c = pickCorner(two, null);
  assert.ok(c && two[c].x >= 375 && two[c].x + 101 + 10 <= 522);
  assert.ok(obs.every((o) => two[c].x + 101 + 10 <= o.l || two[c].x - 10 >= o.r || two[c].y + 34 + 10 <= o.t || two[c].y - 10 >= o.b));
});

test('credit stays off the words\' glass pane', () => {
  const land = { l: 0, t: 0, r: 844, b: 390 }, pane = { l: 0, t: 0, r: 365, b: 390 };
  const s = freeSpots(land, [pane], 210, 17, { inset: 12 });
  assert.ok(s.bl.x >= 375, 'the lower-left spot moves along to the figure, clear of the pane');
  assert.equal(pickCorner(s, 'bl'), 'bl');
  assert.match(readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8'), /\.pz-shade'/);
});

test('credit keeps clear of the figure\'s own labels, and a label does not make the screen busy', () => {
  const src = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  assert.match(src, /#labels \.lb:not\(\.lb-off\)/);
  assert.match(src, /chrome: true/);
  // A value label sitting on the lower-left corner (the SMV label on a phone): the credit rises above it or moves aside.
  const label = { l: 8, t: 640, r: 200, b: 672 };
  const s = freeSpots(fig, [label], W, H);
  assert.ok(s.bl && clear(s.bl, [label]));
});

test('credit keeps clear of the FibroScan probe body (it is looked for, not only named as chrome)', () => {
  const src = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  const obstacles = src.match(/const OBSTACLES = '([^']*)'/)[1];
  assert.ok(obstacles.includes('.scan-probe:not(.off) .sp-body'));
});

test('credit does not go back to a corner it left; a displaced credit takes the corner cards have left alone longest', () => {
  const spots = { bl: { x: 1, y: 1 }, br: { x: 2, y: 2 }, tl: { x: 3, y: 3 }, tr: { x: 4, y: 4 } };
  assert.equal(pickCorner(spots, 'br'), 'br', 'bl freeing up does not pull it back');
  assert.equal(pickCorner(spots, null, { bl: 900, br: 100 }), 'tl', 'never-blocked corners come first, in order');
  assert.equal(pickCorner({ ...spots, tl: null, tr: null }, null, { bl: 900, br: 100 }), 'br', 'else the corner blocked longest ago');
});

test('credit is never animated: no fade, glide or scale ease', () => {
  assert.match(css, /\.stage-credit \{ transition: none; \}/);
  assert.doesNotMatch(css, /\.stage-credit \{ transition: opacity/);
});

test('a spot over an organ is passed over like a covered one; the corners on the left step to the bare right side', () => {
  const fig = { l: 0, t: 0, r: 1000, b: 800 };
  const s = freeSpots(fig, [], 200, 20, { avoid: (q) => q.l < 500 });
  for (const c of ['bl', 'tl', 'br', 'tr']) assert.ok(s[c] && s[c].x >= 500, `${c} must be on the bare side`);
  assert.equal(s.br.y, 800 - 12 - 20);
  assert.equal(pickCorner(s, null), 'bl');
});

test('with art all round, the credit takes the gap between two cards', () => {
  // A phone with its data card open: cards above and below, a 90 px strip of figure between, vessels along its top and bottom edges.
  const fig = { l: 0, t: 0, r: 390, b: 800 };
  const cards = [{ l: 8, t: 8, r: 382, b: 330 }, { l: 8, t: 420, r: 382, b: 792 }];
  const s = freeSpots(fig, cards, 158, 13, { gap: 12, avoid: (q) => q.t < 350 || q.b > 400 });
  const at = s.bl;
  assert.ok(at, 'a spot must be found in the strip');
  assert.ok(at.y >= 330 + 12 && at.y + 13 <= 420 - 12, `y ${at.y} is not in the strip`);
  assert.ok(at.y >= 350 && at.y + 13 <= 400, 'and clear of the art');
});

test('the sinusoid view keeps a fixed strip for the credit instead of sizing itself to the credit\'s spot', () => {
  // (The credit keeps clear of the view's labels; a view that followed the credit moved the labels, which moved the credit,
  // about once a second for good.)
  const view = readFileSync(new URL('../src/ui/sinusoid-view.js', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /stage-credit/);
});
