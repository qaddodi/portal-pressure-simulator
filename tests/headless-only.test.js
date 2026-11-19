// One layout-only opener (DBG-6, bible review 19 Nov 2026; owner, 18 Nov 2026 17:07 ET: headless only with every GL draw stubbed, no pictures). Every layout runner opens the app through
// scripts/headless.mjs, which stubs the draws itself; none imports the picture tool's `openApp` or pastes its own stub, and the opener has no screenshot. The two phone scripts that drew every frame
// on SwiftShader are gone: their structure cards are gallery specimens and their sheets are the `sheet` fit rule.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { GL_STUB, layoutScript } from '../scripts/headless.mjs';
import { readSheet, judgeSheet, KINDS } from '../src/ui/gallery/fit-rules.js';
import { runRules } from '../src/ui/selfcheck/rules.js';
import '../src/ui/selfcheck/rules-fit.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
const RUNNERS = ['card-fit', 'deck-sweep', 'gallery-sweep', 'rotate-sweep', 'packet-headless'];

test('every layout runner opens the app through headless.mjs: no openApp, no pasted stub, no direct chromium launch', () => {
  for (const r of RUNNERS) {
    const s = src(`scripts/${r}.mjs`);
    assert.match(s, /from '\.\/headless\.mjs'/, `${r} imports headless.mjs`);
    assert.ok(!/\bopenApp\b/.test(s), `${r} does not call the picture tool's openApp`);
    assert.ok(!/drawElementsInstanced/.test(s), `${r} keeps no copy of the GL stub`);
    assert.ok(!/chromium\.launch/.test(s), `${r} does not launch its own browser`);
    assert.ok(!/from '\.\/shoot\.mjs'/.test(s), `${r} does not import the picture tool`);
    assert.ok(!/\.screenshot\(/.test(s), `${r} takes no picture`);
  }
});

test('the picture scripts that drew every frame are gone', () => {
  for (const f of ['scripts/phone-card-fit.mjs', 'scripts/phone-sheet-fit.mjs']) assert.equal(existsSync(new URL(`../${f}`, import.meta.url)), false, `${f} is folded into the gallery`);
});

test('the opener stubs every GL draw and exports no screenshot', () => {
  const s = src('scripts/headless.mjs');
  for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) assert.ok(GL_STUB.includes(`'${k}'`), k);
  assert.ok(!/export (async )?(function|const) \w*[sS]creenshot/.test(s));
  assert.match(s, /app\.page\.screenshot = refuse/);
  assert.equal(layoutScript().includes('ppsLayoutOnly'), false);
  assert.ok(layoutScript({ layoutOnly: true }).includes('window.ppsLayoutOnly = true'));
  const c = layoutScript({ cardsOnly: true });
  assert.ok(c.includes('window.ppsLayoutOnly = true') && c.includes('window.ppsCardsOnly = true'));
  assert.ok(layoutScript({ extra: 'window.x = 1;' }).endsWith('window.x = 1;'));
});

// ── the sheet rule, folded in from phone-sheet-fit.mjs ──
const sheet = (o = {}) => ({ cls: 'menu.as-sheet.from-dock', name: 'Settings', pal: false, top: 300, bottom: 800, h: 500, topBar: 56, room: 244, scrolls: true, moving: false, ...o });

test('sheet: a phone sheet that scrolls while it stops short of the room under the top bar is named', () => {
  const p = judgeSheet(sheet());
  assert.equal(p.length, 1); assert.equal(p[0].kind, 'sheet'); assert.match(p[0].text, /Settings scrolls while stopping 244px short/);
  assert.ok(KINDS.includes('sheet'));
  const f = runRules({ cards: { sheet: sheet() } }, { families: ['fit'] }).filter((x) => x.rule === 'fit-sheet');
  assert.equal(f.length, 1); assert.match(f[0].what, /Phone sheet/); assert.ok(f[0].owner && f[0].why);
});

test('sheet must not fire: it fills the room, it does not scroll, it is gliding, Layers (short on purpose), the palette (fixed list), no sheet, a wide screen', () => {
  for (const m of [sheet({ room: 30 }), sheet({ scrolls: false }), sheet({ moving: true }), sheet({ name: 'Layers' }), sheet({ pal: true, name: 'Command palette' }), null]) assert.deepEqual(judgeSheet(m), []);
  assert.deepEqual(runRules({ cards: {} }, { families: ['fit'] }).filter((x) => x.rule === 'fit-sheet'), []);
});

test('readSheet reads the sheet on show on a phone, and is null with none or on a wide screen', async () => {
  const { dom } = await import('./screen-dom.js');
  const w = dom.window, d = w.document;
  d.body.innerHTML = '<div class="topbar"></div><div class="menu as-sheet" aria-label="Settings"><div class="body">x</div></div>';
  const rects = new Map([['topbar', { top: 0, bottom: 56, height: 56 }], ['menu', { top: 300, bottom: 800, height: 500 }]]);
  const io = { style: (e) => ({ display: 'block', visibility: 'visible', opacity: '1', overflowY: e.classList.contains('body') ? 'auto' : 'visible' }), box: (e) => rects.get(e.classList[0]) || { top: 0, bottom: 0, height: 0 }, metric: (e, k) => (k === 'scrollHeight' ? 900 : 400) };
  const keepW = globalThis.window, keepD = globalThis.document;
  w.innerWidth = 390; globalThis.window = w; globalThis.document = d;
  try {
  const m = readSheet(io);
  assert.deepEqual([m.name, m.room, m.scrolls, m.pal, m.moving], ['Settings', 244, true, false, false]);
  assert.equal(judgeSheet(m).length, 1);
  w.innerWidth = 1200;
  assert.equal(readSheet(io), null, 'a wider screen\'s are popovers');
  w.innerWidth = 390; d.body.innerHTML = '';
  assert.equal(readSheet(io), null, 'no sheet on show');
  } finally { globalThis.window = keepW; globalThis.document = keepD; }
});
