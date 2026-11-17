// The free stage (16 Nov 2026, play-test at 1024 x 768): floating pieces and sheets are placed against the stage the open cards and the
// bars leave, one rect for all of them (src/ui/free-stage.js), never against the whole window.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unsnap } from './unsnap.js';
import { clearAt, freeStageOf, sideBlock, bandOf, bandShift, bandWidth } from '../src/ui/free-stage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => unsnap(readFileSync(join(root, f), 'utf8'));
const css = () => ['app-01-chrome', 'app-02-controls', 'app-07-floating', 'app-11-deck-visuals', 'from-readings'].map((n) => read(`styles/${n}.css`)).join('\n');

// The numbers the play-test measured at 1024 x 768: Treat 612..1012 x 60..359, the zoom pill 520..638 (right edge 1012), Tests 528..1028 x 60..620,
// the bottom bar and view switch from y 654 (--bot-occ 122), the top bar 56 px.
const W = 1024, H = 768, TOP = 56, BOT = 122;
const treat = sideBlock('r', 412, 60, 359), tests = sideBlock('r', 512, 60, 620);

test('a card takes room only from the rows it reaches: Treat ends 160 px above the zoom pill, so the pill does not move for it', () => {
  const fs = freeStageOf(W, H, TOP, BOT, [treat]);
  const zoom = [H - BOT - 8 - 118, H - BOT - 8];
  assert.equal(bandOf(fs, zoom[0], zoom[1]).r, 0);
  assert.equal(fs.r, 412, 'over the whole figure the card still counts');
  assert.equal(bandOf(freeStageOf(W, H, TOP, BOT, [tests]), zoom[0], zoom[1]).r, 512, 'Tests reaches down to y 620: the pill gives way, 512 px');
});

test('the foot band (toasts, the credit) centres in what the cards leave: clear of Tests, so it never stands over the card\'s bottom edge', () => {
  const fs = freeStageOf(W, H, TOP, BOT, [tests]);
  const foot = [H - BOT - 8 - 96, H - BOT - 8];
  assert.equal(bandShift(fs, ...foot), -256);
  assert.equal(bandWidth(fs, ...foot), W - 512 - 16);
  assert.equal(bandShift(freeStageOf(W, H, TOP, BOT, [treat]), ...foot), 0, 'Treat does not reach the foot: a toast stays centred on the window');
});

test('a card on the left shelf and one on the right both count for the banner\'s rows', () => {
  const fs = freeStageOf(W, H, TOP, BOT, [sideBlock('l', 302, 64, 384), treat]);
  assert.deepEqual(bandOf(fs, 62, 110), { l: 302, r: 412 });
  assert.equal(bandShift(fs, 62, 110), (302 - 412) / 2);
  assert.deepEqual(bandOf(fs, 400, 500), { l: 0, r: 0 }, 'below both cards the stage is whole');
});

test('the free stage keeps its top and bottom, and the height between them', () => {
  const fs = freeStageOf(W, H, TOP, BOT, []);
  assert.deepEqual([fs.t, fs.b, fs.h], [56, 122, 768 - 56 - 122]);
  assert.equal(clearAt([], 'r', 0, H), 0);
});

test('the main menu and From readings end above the bottom bar and the view switch: heights read the free stage\'s foot', () => {
  const c = css();
  assert.match(c, /\.umenu \{[^}]*height: min\(640px, calc\(100dvh - 76px\), calc\(100dvh - var\(--fs-b, 0px\) - var\(--fs-t, 56px\) - 8px\)\)/);
  const fr = read('styles/from-readings.css');
  assert.equal((fr.match(/calc\(100dvh - var\(--fs-b, 0px\) - var\(--fs-t, 56px\) - 8px\)/g) || []).length, 2, 'the popover, wide and narrow');
});

test('the popover and the Why card are placed above the free stage\'s foot, not the window\'s', () => {
  const u = read('src/ui/util.js');
  assert.match(u, /export const stageBottom = \(anchor\) =>/);
  const put = u.slice(u.indexOf('const put = () => {'), u.indexOf('// Ending just above the bar'));
  assert.doesNotMatch(put, /visibleBottom\(\)\s*-\s*r\.bottom/, 'no room is worked out from the window\'s bottom');
  assert.match(put, /stageBottom\(anchor\)/);
  assert.match(u, /vb = stageBottom\(anchor\), cw =/, 'placeAt');
});

test('every sheet follows the live viewport: the popover and the main menu take the other form when the window crosses the breakpoint', () => {
  const u = read('src/ui/util.js'), m = read('src/ui/menu.js');
  assert.match(u, /mq\?\.addEventListener\('change', swap\); addEventListener\('resize', onResize\);/);
  assert.match(u, /if \(!openMenu\?\.swapping\) onClose\?\.\(\);/, 'a swap is not a close for the owner of the menu');
  assert.match(m, /sheetMQ\.addEventListener\('change', followMQ\)/);
  assert.match(m, /sheetMQ\.removeEventListener\('change', followMQ\)/);
});

test('the zoom pill, the Compare banner and the toasts read the free stage, not the window or --right-occ', () => {
  const c = css();
  assert.match(c, /\.zoom-pill \{[^}]*transform: translateX\(calc\(-1 \* var\(--fs-zoom-r, 0px\)\)\)/);
  assert.match(c, /\.sb-center\.float-ui \{[^}]*translate: calc\(\(var\(--fs-top-l, 0px\) - var\(--fs-top-r, 0px\)\) \/ 2\) 0;/);
  assert.match(c, /\.sb-center\.float-ui > \* \{[^}]*max-width: calc\(100% - var\(--fs-top-l, 0px\) - var\(--fs-top-r, 0px\)\)/);
  assert.match(c, /\.toast-wrap\.foot \{[^}]*translate: calc\(\(var\(--fs-foot-l, 0px\) - var\(--fs-foot-r, 0px\)\) \/ 2\) 0; transition: translate var\(--d-small\)/);
  assert.doesNotMatch(c, /\.zoom-pill \{[^}]*--right-occ/, 'the pill clears only the cards that reach its rows');
  const u = read('src/ui/util.js');
  assert.match(u, /bandWidth\(fs, fs\.foot\[0\], fs\.foot\[1\], 8\)/, 'a toast is laid out to the room beside it');
});

test('the layout pass publishes the free stage once: the cards\' resting boxes, the left shelf included, the root\'s variables, and pps:occ when it changes', () => {
  const m = read('src/ui/main.js');
  const at = m.indexOf('const fs = freeStageOf(');
  assert.ok(at > 0);
  const pass = m.slice(at - 1400, at + 1600);
  assert.match(pass, /sideBlock\('r', panelOcc,/);
  assert.match(pass, /sideBlock\('r', panelOcc \+ instrOcc,/);
  assert.match(pass, /sideBlock\('r', panelOcc \+ instrOcc \+ treatOcc,/);
  assert.match(pass, /sideBlock\('l', q\.right - ar\.left \+ gap,/, 'the vessel\'s card on the left shelf');
  assert.match(pass, /setFreeStage\(fs\)/);
  for (const k of ['--fs-t', '--fs-b', '--fs-h', '--fs-l', '--fs-r']) assert.ok(pass.includes(`'${k}'`), k);
  assert.match(pass, /--fs-\$\{k\}-l/);
  assert.match(pass, /document\.documentElement\.style\.setProperty\(k, rootVars\[k\]\); changed = true;/);
});

test('the update prompt and the feedback ask are held while a talk plays, and asked again after it', () => {
  const u = read('src/ui/util.js'), m = read('src/ui/main.js');
  assert.match(u, /holdInTalk/);
  assert.match(u, /if \(app\.classList\.contains\('presenting'\)\) close\('held'\)/);
  assert.match(m, /actions: \[\['Reload', \(\) => location\.reload\(\)\]\], holdInTalk: true, onClose: \(why\) => \{ if \(why === 'held'\) retry\(\); \}/);
  assert.match(m, /sticky: true, holdInTalk: true,/);
  assert.match(m, /why === 'pushed' \|\| why === 'held'/);
});

test('no class on the root stays behind after a chip\'s menu closes: chip-open is gone, the chips read aria-expanded alone', () => {
  for (const f of ['src/ui/main.js', 'styles/app-01-chrome.css', 'styles/app-02-controls.css', 'styles/app-07-floating.css']) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    assert.doesNotMatch(s, /chip-open/, f);
  }
  assert.doesNotMatch(read('src/ui/main.js').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/\([^)\n]*chip-open[^)\n]*\)/g, ''), /classList\.add\('chip-open'\)/);
});

test('the left shelf\'s object card is as tall as what it holds: no fixed height, no controls pinned to a foot far below the readings', () => {
  const c = read('styles/app-03-layouts.css'), card = read('src/ui/card.js');
  assert.match(c, /\.action-card \{\n {2}position: absolute;[^}]*width: 276px; height: auto; max-height: 500px;/);
  assert.doesNotMatch(c, /^\.action-card\[data-size=(l|x)\] \{ height:/m, 'the shelf has no fixed height for a size');
  assert.match(c, /\.action-card\.docked\[data-size=l\] \{ min-height: min\(300px, var\(--ac-max\)\); \}/, 'the phone\'s docked card keeps its sizes as the least it is, and grows with its words (17 Nov 2026)');
  assert.match(c, /\.action-card:not\(\.docked\) > \.ac-body \{ position: relative; inset: auto; \}/, 'its words are in its flow, which gives it its height');
  assert.doesNotMatch(c, /\.action-card\[data-size=x\]:not\(\.docked\) \{ height: 500px; \}/, 'a lobule part\'s card is no longer a fixed 500 px (Mohammad, 17 Nov 2026)');
  const cardJs = read('src/ui/card.js');
  assert.match(cardJs, /if \(sizes\.h > tallest\) tallest = sizes\.h;\n\s+else if \(sizes\.h < tallest - 0\.5\) el\.style\.minHeight = `\$\{tallest\}px`;/, 'it is as tall as its tallest words so far, and never shrinks while it is the same card');
  // a card of another shape is the old one going out and the new one coming in, never a height that jumps under crossfading words (worked out from the model: no read of the page)
  assert.match(card, /el\.dataset\.size !== size \|\| el\.dataset\.shape !== shape/);
  assert.doesNotMatch(card, /probe/);
  assert.match(read('src/ui/main.js'), /if \(card\?\.el\) ro\.observe\(card\.el\);/, 'the free stage follows the card\'s height');
});

test('cardShape tells cards of different heights apart, and the varices card from the TIPS card', async () => {
  await import('./dom-shim.js');
  const { cardFor } = await import('../src/ui/actions.js');
  const { cardShape, cardSize } = await import('../src/ui/card.js');
  const CTX = { canShunt: () => true, injectDye: () => {}, canDye: () => true };
  const P = { stenosis: {}, thrombus: {}, occluded: {}, spontaneous: {}, fibrosis: { R: {}, L: {} } };
  const a = cardFor({ type: 'edge', id: 'TIPS' }, CTX), b = cardFor({ type: 'organ', id: 'liver' }, CTX);
  assert.ok(a && b);
  assert.notEqual(cardShape(a, P), cardShape(b, P));
  assert.equal(cardShape(a, P), cardShape(a, P));
  assert.match(cardShape(a, P), /^[bv]\d\d\.\d\d\.\d\d\.\d$/);
  assert.ok(['s', 'l', 'x'].includes(cardSize(a, P)));
});
