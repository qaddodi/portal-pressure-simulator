import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard, letterOf } from '../src/ui/keyboard.js';

// The page's keys (src/ui/keyboard.js, out of main.js: SHL-7), driven with a fake page. These replace the tests that read main.js's text for the same rules.

function page(over = {}) {
  const log = [], st = { selection: null, running: false, speed: 1, lapse: 0, view: 'anatomy', imaging: false, colorMode: 'a', tool: 'select', sinusoid: false, lobule: false };
  const flags = { modal: false, menu: false, popover: false, talk: false, palette: false, projecting: false, treat: false, history: false, held: false, panel: false, detailsOpen: false, cardOpen: false };
  const mk = (n) => (...a) => { log.push([n, ...a]); };
  const d = {
    palette: { isOpen: () => flags.palette, close: mk('palette.close'), open: mk('palette.open') },
    isModalOpen: () => flags.modal, closeModal: mk('closeModal'), popoverOpen: () => flags.popover, closePopover: mk('closePopover'),
    mainMenu: { isOpen: () => flags.menu, close: mk('menu.close') }, toggleProjector: mk('toggleProjector'),
    app: { classList: { contains: () => false } }, dock: { setState: mk('dock.setState'), close: mk('dock.close'), toggle: mk('dock.toggle') },
    treatOpen: () => flags.treat, closeTreat: mk('closeTreat'), historyOpen: () => flags.history, closeHistory: mk('closeHistory'),
    stage: { isShunting: () => false, cancelShunt: mk('cancelShunt'), zoomIn: mk('zoomIn'), zoomOut: mk('zoomOut'), fit: mk('fit'), releaseDye: mk('releaseDye'), keyItem: () => null },
    store: { get: () => st, set: (p) => { log.push(['store.set', p]); Object.assign(st, p); } },
    setTool: mk('setTool'), setViewKey: mk('setViewKey'), viewKey: () => st.view, panelShown: () => flags.panel, closePanel: mk('closePanel'),
    card: { isOpen: () => flags.cardOpen, trigger: (n) => { log.push(['card.trigger', n]); return true; }, detailsOpen: () => flags.detailsOpen, closeDetails: mk('card.closeDetails') },
    presenter: { active: () => flags.talk }, keyHeldBack: (e) => flags.held && !(e.ctrlKey || e.metaKey) && e.key !== 'Escape', doRedo: mk('redo'), doUndo: mk('undo'), controlOwnsKey: () => false,
    host: { send: mk('host.send') }, runOn: { type: 'run', running: true }, runOff: mk('runOff'),
    speeds: [0.25, 0.5, 1, 2, 4, 8], lapses: [[30, 0, '1 month'], [90, 0, '3 months']], setSpeed: mk('setSpeed'), toast: mk('toast'),
    lensKeys: () => ['a', 'b', 'c'], lenses: { a: ['Pressure', 'x'], b: ['Flow', 'y'], c: ['Oxygen', 'z'] }, lcFirst: (t) => t.toLowerCase(),
    settle: mk('settle'), openHelp: mk('openHelp'), openTreat: mk('openTreat'), timeline: { togglePin: mk('togglePin') }, injectDye: mk('injectDye'),
    projecting: () => flags.projecting, ...over,
  };
  const kb = createKeyboard(d);
  const ev = (key, o = {}) => ({ code: '', keyCode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, preventDefault: mk('preventDefault'), getModifierState: () => false, ...o, key,
    target: { tagName: 'DIV', id: '', isContentEditable: false, closest: () => null, blur: mk('blur'), ...(o.target || {}) } });
  const press = (key, o) => { log.length = 0; kb.onKeyDown(ev(key, o)); return log.map((l) => l[0]); };
  return { kb, log, flags, st, press, ev };
}

test('the letter a key stands for: its Latin character, else its place on the board; a Dvorak ; is not Z', () => {
  assert.equal(letterOf({ key: 'A', code: 'KeyA' }), 'a');
  assert.equal(letterOf({ key: 'ф', code: 'KeyA' }), 'a', "a Russian layout's key in the A place");
  assert.equal(letterOf({ key: 'ش', code: 'KeyA' }), 'a', "an Arabic layout's");
  assert.equal(letterOf({ key: '[', code: 'BracketLeft' }), '[');
  assert.equal(letterOf({ key: 'Enter', code: 'Enter' }), 'enter');
  assert.equal(letterOf({ key: ';', code: 'KeyZ' }), ';', 'Dvorak: the key in Z\'s place makes ;');
  assert.equal(letterOf({ key: 'Dead', code: 'KeyA' }), 'dead');
  assert.equal(letterOf({ key: 'z', code: 'KeyZ' }), 'z');
});

test('Esc closes one thing, in the order popover, dialog, menu, projector, then the selection', () => {
  const p = page();
  p.flags.popover = true; p.flags.modal = true;
  assert.deepEqual(p.press('Escape'), ['closePopover'], 'only the popover');
  p.flags.popover = false;
  assert.deepEqual(p.press('Escape'), ['closeModal'], 'then the dialog');
  p.flags.modal = false; p.flags.menu = true;
  assert.deepEqual(p.press('Escape'), ['menu.close']);
  p.flags.menu = false; p.flags.detailsOpen = true;
  assert.deepEqual(p.press('Escape'), ['card.closeDetails'], "a card's details before the card");
  p.flags.detailsOpen = false;
  assert.deepEqual(p.press('Escape'), ['store.set']);
  assert.equal(p.st.selection, null);
});

test('a text field keeps all of its keys, a slider or switch keeps only its own, composing text is left alone', () => {
  const p = page();
  assert.deepEqual(p.press('z', { target: { tagName: 'TEXTAREA' } }), [], 'a text box');
  assert.deepEqual(p.press('a', { target: { tagName: 'INPUT', type: 'text' } }), []);
  assert.deepEqual(p.press('a', { target: { tagName: 'DIV', isContentEditable: true } }), []);
  assert.deepEqual(p.press('Escape', { target: { tagName: 'INPUT', type: 'text' } }), ['blur'], 'Esc leaves a text field');
  assert.deepEqual(p.press('ArrowLeft', { target: { tagName: 'INPUT', type: 'range' } }), [], 'a slider keeps the arrows');
  assert.ok(p.press('z', { target: { tagName: 'INPUT', type: 'range' } }).includes('settle'), 'but not the letters');
  assert.deepEqual(p.press(' ', { target: { tagName: 'INPUT', type: 'checkbox' } }), [], 'a switch keeps Space');
  p.log.length = 0; p.kb.onKeyDown(p.ev('z', { isComposing: true })); assert.deepEqual(p.log, [], 'an input method composing');
  p.log.length = 0; p.kb.onKeyDown(p.ev('z', { keyCode: 229 })); assert.deepEqual(p.log, []);
});

test("a talk owns the keyboard: only Search and the guide pass, and the figure's zoom keys stay out", () => {
  const p = page();
  p.flags.talk = true;
  for (const k of ['z', 'a', '+', '-', '0', '[', ' ', 'l', 'i']) assert.deepEqual(p.press(k), [], `${k} does not reach a talk`);
  assert.ok(p.press('/').includes('palette.open'));
  assert.ok(p.press('?').includes('openHelp'));
});

test("the figure's zoom is on the plain + - 0; Ctrl or Cmd with them is the browser's", () => {
  const p = page();
  assert.ok(p.press('+').includes('zoomIn')); assert.ok(p.press('=').includes('zoomIn'));
  assert.ok(p.press('-').includes('zoomOut')); assert.ok(p.press('0').includes('fit'));
  for (const k of ['+', '-', '0']) { assert.deepEqual(p.press(k, { ctrlKey: true }), [], `Ctrl ${k}`); assert.deepEqual(p.press(k, { metaKey: true }), [], `Cmd ${k}`); }
});

test('with Settings > Keyboard shortcuts off, only Esc and Ctrl or Cmd with a key are the page\'s', () => {
  const p = page();
  p.flags.held = true;
  assert.deepEqual(p.press('z'), []); assert.deepEqual(p.press('+'), []);
  assert.ok(p.press('Escape').includes('store.set'));
  assert.ok(p.press('z', { ctrlKey: true }).includes('undo'));
});

test('a held key is one press; a held Space stays the figure\'s and does not scroll the page', () => {
  const p = page();
  assert.deepEqual(p.press('z', { repeat: true }), [], 'a held Settle runs once');
  assert.deepEqual(p.press(' ', { repeat: true }), ['preventDefault'], 'a held Space is ours: it must not scroll the panel behind');
  assert.ok(p.press(' ').includes('host.send'), 'a Space is play or pause');
  assert.ok(p.press('j').includes('injectDye')); assert.deepEqual(p.press('j', { repeat: true }), [], 'a held J is the dye, started once');
});

test('AltGr brackets reach the speed keys; a Polish ą (AltGr+A) does not; Ctrl+A is the browser\'s; Option+[ works on a Mac', () => {
  const p = page();
  const gr = { getModifierState: (k) => k === 'AltGraph', ctrlKey: true, altKey: true };
  assert.ok(p.press('[', gr).includes('setSpeed'), 'German Windows: AltGr+8'); assert.ok(p.press(']', gr).includes('setSpeed'));
  assert.deepEqual(p.press('ą', gr), []);
  assert.deepEqual(p.press('a', { ctrlKey: true }), [], 'Ctrl+A');
  assert.ok(p.press('[', { altKey: true }).includes('setSpeed'), 'Option+[ on a Mac');
  assert.deepEqual(p.press('a', { altKey: true }), []);
});

test('the speed keys step one ladder: real-time speeds, then the time-lapse rates', () => {
  const p = page();
  p.log.length = 0; p.kb.onKeyDown(p.ev(']'));
  assert.deepEqual(p.log.find((l) => l[0] === 'setSpeed'), ['setSpeed', 2, false], 'from 1× up to 2×');
  p.log.length = 0; p.kb.onKeyDown(p.ev('['));
  assert.deepEqual(p.log.find((l) => l[0] === 'setSpeed'), ['setSpeed', 0.5, false]);
  p.st.speed = 8;
  p.log.length = 0; p.kb.onKeyDown(p.ev(']'));
  assert.deepEqual(p.log.find((l) => l[0] === 'setSpeed'), ['setSpeed', 30, true], 'past 8× the ladder goes on to the time-lapse');
});

test('undo and redo on Ctrl or Cmd Z, Search on / and Ctrl K, the dialog and menu keep the keys', () => {
  const p = page();
  assert.ok(p.press('z', { ctrlKey: true }).includes('undo')); assert.ok(p.press('z', { metaKey: true, shiftKey: true }).includes('redo'));
  assert.ok(p.press('k', { ctrlKey: true }).includes('palette.open'));
  p.flags.modal = true; assert.deepEqual(p.press('z'), [], 'a dialog is open');
  p.flags.modal = false; p.flags.palette = true; assert.deepEqual(p.press('z'), [], 'Search is open: no letter reaches the figure behind it');
});

test('A flips the view, L steps the colouring, J holds the dye and its release lets go', () => {
  const p = page();
  assert.ok(p.press('a').includes('setViewKey'));
  p.st.sinusoid = true; assert.deepEqual(p.press('a'), [], 'not in the sinusoid view');
  p.st.sinusoid = false;
  p.log.length = 0; p.kb.onKeyDown(p.ev('l'));
  assert.deepEqual(p.log.find((l) => l[0] === 'store.set'), ['store.set', { colorMode: 'b' }]);
  p.log.length = 0; p.kb.onKeyUp(p.ev('j')); assert.deepEqual(p.log, [['releaseDye']]);
});
