// Keyboard and focus hardening (production pass, 31 Oct): a talk leaves Enter and Space to a control Tab reached, Esc closes one
// layer at a time (the Settings sheet, the Why card, Search), a menu takes focus in and gives it back, a dialog traps the page
// behind it. The pure rule runs for real; the wiring is read from source, as the repo's other review tests do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { controlOwnsKey, KEY_OWNERS } from '../src/ui/key-owner.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const el = (sel, visible) => ({ matches: (q) => q === ':focus-visible' ? visible : q === KEY_OWNERS ? sel : false });

test('a control the keyboard reached keeps Enter and Space; after a mouse click the talk still moves on', () => {
  assert.equal(controlOwnsKey(el(true, true), 'Enter'), true);
  assert.equal(controlOwnsKey(el(true, true), ' '), true);
  assert.equal(controlOwnsKey(el(true, false), ' '), false, 'clicked, no focus ring: a clicker presses Space for the next slide');
  assert.equal(controlOwnsKey(el(false, true), ' '), false, 'not a control: the talk takes it');
  assert.equal(controlOwnsKey(null, ' '), false);
  assert.equal(controlOwnsKey({}, 'Enter'), false);
});

test('the arrows, Esc and the other keys are never a control\'s, and a half-typed slide number keeps its Enter', () => {
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageDown', 'PageUp', 'Home', 'End', 'Escape', 'Backspace', 'g'])
    assert.equal(controlOwnsKey(el(true, true), k), false, k);
  assert.equal(controlOwnsKey(el(true, true), 'Enter', '12'), false);
  assert.equal(controlOwnsKey(el(true, true), ' ', '12'), true, 'Space is not the number\'s key');
});

test('the talk\'s key handler asks the rule, and leaves Esc to an open menu', () => {
  const p = read('src/ui/presenter.js');
  const fn = p.slice(p.indexOf('function onKey(e)'), p.indexOf("addEventListener('keydown', onKey, true)"));
  assert.match(fn, /if \(controlOwnsKey\(e\.target, k, digits\)\) return;/);
  assert.match(fn, /if \(k === 'Escape' && popoverOpen\(\)\) return;/);
  assert.match(p, /import \{ controlOwnsKey \} from '\.\/key-owner\.js/);
});

test('a menu: named, focused from the keyboard, focus handed back; a dialog traps the page and returns to its first opener', () => {
  const u = read('src/ui/util.js');
  const pop = u.slice(u.indexOf('export function popover('), u.indexOf('export function fadeWhileMore'));
  assert.match(pop, /role: 'dialog', 'aria-label': anchor\.getAttribute\?\.\('aria-label'\)/);
  assert.match(pop, /if \(anchor\.matches\?\.\(':focus-visible'\)\) setTimeout\(/);
  const close = u.slice(u.indexOf('export function closePopover'), u.indexOf('/** Over the thumb dock'));
  assert.match(close, /el\.contains\(document\.activeElement\) && openMenu\.anchor\.isConnected\) openMenu\.anchor\.focus/);
  assert.ok(close.indexOf('anchor.focus') < close.indexOf('el.inert = true'), 'focus moves before the menu goes inert');
  const open = u.slice(u.indexOf('export function openModal'), u.indexOf('export const isModalOpen'));
  assert.match(open, /if \(!back\.classList\.contains\('show'\)\) modalReturn = /);
  assert.match(open, /appEl\.inert = true/);
  assert.match(open, /appEl\.inert = false/);
});

test('a toast with buttons stays 9 s and while the pointer or focus is on it; the Speed button names its value; the slide list shows its focus', () => {
  const u = read('src/ui/util.js');
  assert.match(u, /const life = actions\?\.length \? 9000 : note && sub \? 5200 : 4200/);
  assert.match(u, /t\.addEventListener\('focusin', \(\) => clearTimeout\(timer\)\)/);
  assert.match(read('src/ui/timeline.js'), /speedBtn\.setAttribute\('aria-label', `Playback speed, \$\{speedBtn\.textContent\}`\)/);
  assert.match(read('styles/app.css'), /\.pzj-list button:focus-visible \{[^}]*outline: 2px solid var\(--focus\)/);
});

test('every icon id in the icon art is defined once', () => {
  const html = read('scripts/icon-art.html');
  const ids = [...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dup, []);
});
