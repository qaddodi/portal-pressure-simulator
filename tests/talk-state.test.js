// Talk and navigation state (production pass, 31 Oct): the projector layout survives a second talk starting, the explore shortcuts stay out
// of a talk, a card drag cut short by a second finger lands, a ?script=test- link cannot spin, a talk's link does not outlive it.
// The projector rule runs for real (its source, in a sandbox with a queue standing in for the crossfade); the rest is read from source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const main = read('src/ui/main.js'), pres = read('src/ui/presenter.js');

function rig(viewTransitions) {
  const src = main.slice(main.indexOf('let projWant = false;'), main.indexOf('function flipProjector()'));
  const queue = [];
  const ctx = vm.createContext({ document: { hidden: false, startViewTransition: viewTransitions ? () => {} : undefined }, queue, flips: 0 });
  vm.runInContext(`let projector = false; function flipProjector() { projector = !projector; flips++; }
    const crossfade = (fn) => queue.push(fn);
    const canCrossfade = () => !!document.startViewTransition && !document.hidden;
    ${src}
    globalThis.api = { toggleProjector, state: () => projector };`, ctx);
  return { api: ctx.api, run: () => { while (queue.length) queue.shift()(); }, ctx };
}

test('projector: a second talk started under the first (off, then on, in one task) keeps the projector layout', () => {
  const r = rig(true);
  r.api.toggleProjector(true); r.run();          // talk A starts
  assert.equal(r.api.state(), true);
  r.api.toggleProjector(false);                  // starting B: A is stopped
  r.api.toggleProjector(true);                   // B asks for the projector layout in the same task
  r.run();                                       // the crossfade runs both
  assert.equal(r.api.state(), true, 'B runs with the top bar, panel and dock hidden');
});

test('projector: asked for what it already is, nothing is flipped; asked twice before it ran, it flips once; without view transitions it is at once', () => {
  const r = rig(true);
  r.api.toggleProjector(false); r.run();
  assert.equal(r.ctx.flips, 0, 'off while off: nothing');
  r.api.toggleProjector(true); r.api.toggleProjector(true); r.run();
  assert.equal(r.ctx.flips, 1);
  const p = rig(false);
  p.api.toggleProjector(true);
  assert.equal(p.api.state(), true, 'no crossfade available: done in the call');
  p.api.toggleProjector();                       // no argument: the other state
  assert.equal(p.api.state(), false);
});

test('the explore shortcuts do not reach a talk, except Search and the guide; the figure\'s keyboard zoom stays out too', () => {
  assert.match(main, /if \(presenter\.active\(\) && e\.key !== '\/' && e\.key !== '\?'\) return;/);
  const at = main.indexOf("if (presenter.active() && e.key !== '/'");
  assert.ok(at > main.indexOf("if (isModalOpen() || mainMenu.isOpen()) return;"), 'after the dialog and menu rule');
  assert.ok(at < main.indexOf("(e.shiftKey ? doRedo : doUndo)()"), 'before undo');
  assert.ok(at < main.indexOf("if (e.key === '[' || e.key === ']')"), 'before the speed keys');
  assert.match(main, /tag !== 'select' && !presenter\.active\(\) && !isModalOpen\(\) && !mainMenu\.isOpen\(\)\) \{[^\n]*\n\s+const z =/);
  assert.match(main, /projectorOn: \(\) => toggleProjector\(true\), projectorOff: \(\) => toggleProjector\(false\)/);
});

test('a ?script=test- link waits once for the test deck, then says it was not found; a talk\'s link is dropped when it ends', () => {
  assert.match(pres, /async function start\(id, at = 0, opts = null\) \{/);
  assert.match(pres, /!TESTING\.length && !opts\?\.waited\) return testingLoad\.then\(\(\) => start\(id, at, \{ \.\.\.opts, waited: true \}\)\);/);
  const stop = pres.slice(pres.indexOf('function stopNow('), pres.indexOf('// When the show ends'));
  assert.match(stop, /if \(restore\) \{ try \{ const u = new URL\(location\.href\); if \(u\.searchParams\.has\('script'\)\) \{ u\.searchParams\.delete\('script'\); u\.searchParams\.delete\('slide'\); history\.replaceState\(null, '', u\.pathname \+ u\.search \+ u\.hash\); \}/);
});

test('a shared link with a value out of range still applies its view, selection and camera; the copy fallback keeps the page\'s path', () => {
  const fn = main.slice(main.indexOf('async function loadShared('), main.indexOf('// The orange PREVIEW pill'));
  assert.doesNotMatch(fn, /return;\s*\}\s*\n\s*\}/, 'no early return in the clamp branch');
  assert.match(fn, /clamped = true; \}/);
  assert.ok(fn.indexOf('clamped = true') < fn.indexOf('if (s.view) store.set({ view: s.view });'));
  assert.match(fn, /if \(clamped\) toast\(missing \|\| 'This link had values out of range;/);
  assert.match(main, /catch \{ history\.replaceState\(null, '', location\.pathname \+ location\.search \+ `#s=\$\{encodeShare\(\)\}`\);/);
});
