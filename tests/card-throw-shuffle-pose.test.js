// CRD-3 (bible review, 19 Nov 2026): the throw and the Shuffle had two movers for `transform` on the same cards. The throw's inline `transform !important` outranks the Shuffle's
// paused animation, so a Shuffle card lost its lift and scale for the whole throw and snapped back at the end; and the Shuffle's keyframes were built from the heights the cards
// had when it was built, so the new, taller words of the next slide were clipped for the old height and, with no hiding animation of their own, stood over the card in front.
import test from 'node:test';
import assert from 'node:assert/strict';

let T = 0, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
const MOs = [];
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.t = []; MOs.push(this); } observe(el) { this.t.push(el); } disconnect() { this.t = []; } };
const { createShuffle, shufPoseCss, shufFall, shufKeyframes, SHUF } = await import('../src/ui/card-shuffle.js');
const ct = await import('../src/ui/card-throw.js');
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };

// A card with a style, a class list, children, and animate() that records what it was given.
const anim = (target, frames, opts) => ({ target, frames, opts, effect: { target }, currentTime: 0, cancelled: false, pause() {}, cancel() { this.cancelled = true; } });
const card = (h = 300, w = 340) => {
  const s = new Map(), pr = new Map(), c = new Set(), el = {
    style: { setProperty: (k, v, p) => { s.set(k, v); pr.set(k, p || ''); }, getPropertyPriority: (k) => pr.get(k) || '', removeProperty: (k) => { s.delete(k); pr.delete(k); }, get transform() { return s.get('transform') || ''; }, get opacity() { return s.get('opacity') || ''; } },
    classList: { contains: (n) => c.has(n), add: (n) => c.add(n), remove: (n) => c.delete(n), toggle: (n, on) => (on ? c.add(n) : c.delete(n)) },
    isConnected: true, hidden: false, offsetHeight: h, children: [], anims: [], nodeType: 1,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: w, height: h, right: 10 + w, bottom: 20 + h }),
    querySelectorAll: () => [],
  };
  el.animate = (frames, opts) => { const a = anim(el, frames, opts); el.anims.push(a); return a; };
  return el;
};
const child = () => { const el = card(20, 100); return el; };
const rig = () => {
  const root = card(), text = card(300), shade = card(300), data = card(340);
  text.children.push(child(), child()); shade.children.push(child()); data.children.push(child(), child());
  const live = { ui: { root, text, shade, data } };
  const sh = createShuffle(live);
  sh.sync(true, 's1');
  return { live, sh, text, shade, data, root };
};

test('shufPoseCss is shufFall in a share of the card\'s own box and one length: the same place at the foot for any height', () => {
  const num = /^translateY\(calc\((-?[\d.]+)% \+ (-?[\d.]+)px\)\)$/;
  const geo = { H: 393, pad: 24 };
  for (const card of ['words', 'text', 'data']) for (const p of [0, 0.2, 0.5, 0.8, 1]) for (const h of [200, 264, 340]) {
    const m = num.exec(shufPoseCss(card, p, geo));
    assert.ok(m, shufPoseCss(card, p, geo));
    const ty = +m[1] / 100 * h + +m[2], g = card === 'data' ? 1 - p : p;   // (g: how far toward the foot: the words' two layers go as p goes, the instrument's as 1 - p)
    assert.ok(Math.abs(ty - shufFall(card, h, geo) * g) < 0.02, `${card} ${p} at ${h}`);
  }
  // (the words' own box is two paddings shorter than the glass it stands on: its fall is the glass's, so both layers land at the same place)
  const hGlass = 300, hWords = hGlass - 2 * geo.pad;
  assert.ok(Math.abs(shufFall('words', hGlass, geo) - shufFall('text', hWords, geo)) < 1e-9);
});

test('the keyframes carry the pose, the contents\' opacity and the strip\'s name from behind (one end) to in front (the other)', () => {
  const k = shufKeyframes('data', { H: 393, pad: 0 });
  for (const list of [k.tf, k.ink, k.name]) { assert.equal(list.length, SHUF.steps + 1); assert.equal(list[0].offset, 0); assert.equal(list.at(-1).offset, 1); }
  assert.match(k.tf[0].transform, /^translateY\(calc\(50\.000% \+ /); assert.equal(k.tf.at(-1).transform, 'translateY(calc(0.000% + 0.00px))');
});

test('a card thrown on a slide change keeps the Shuffle\'s pose: the throw composes it into its own transform, never drops it', () => {
  const { text, shade, data, sh } = rig();
  assert.equal(sh.active(), true);
  sh.go(1); for (let i = 0; i < 90; i++) tick(16);   // the instrument is in front, the words behind
  assert.equal(sh.front(), 'data');
  ct.throwOut(text, 'next', 300); ct.throwOut(shade, 'next', 300); ct.throwOut(data, 'next', 300);
  tick(16); tick(16);
  for (const [el, kind] of [[text, 'text'], [shade, 'words'], [data, 'data']]) {
    const t = el.style.transform;
    assert.match(t, /^translateX\(-?[\d.]+px\) /, 'the throw\'s own translate first');
    assert.ok(t.endsWith(shufPoseCss(kind, 1)), `${kind}: and the shuffle's pose for this position after it: ${t}`);
    assert.equal(el.style.getPropertyPriority('transform'), 'important');
  }
  for (let i = 0; i < 80; i++) tick(16);
  // (landed out: the card behind is still behind at its pose, which its animation shows again when the throw lets go)
  ct.throwIn(text, 'next', 0);
  for (let i = 0; i < 6; i++) tick(16);
  assert.ok(text.style.transform.endsWith(shufPoseCss('text', 1)), 'in, it keeps the pose too');
});

test('a card the Shuffle does not hold, or a Shuffle that is off, is thrown by its own translate alone', () => {
  const { sh, live } = rig();
  const other = card();
  assert.equal(ct.throwTransform(other, -12.5), 'translateX(-12.50px)');
  sh.sync(false, 'x');
  assert.equal(ct.throwTransform(live.ui.text, 7), 'translateX(7.00px)');
});

test('words that arrive while the shuffle stands are hidden by the same animation the old ones had, before any frame', () => {
  const { text, sh } = rig();
  for (const c of text.children) assert.equal(c.anims.length, 1, 'each old child has its hiding animation');
  const mo = MOs.find((m) => m.t.includes(text));
  assert.ok(mo, 'the card\'s children are watched');
  const old = text.children[0], fresh = child(), fresh2 = child();
  text.children.splice(0, text.children.length, fresh, fresh2);
  mo.cb([{ target: text, removedNodes: [old], addedNodes: [fresh, fresh2] }]);
  for (const c of [fresh, fresh2]) {
    assert.equal(c.anims.length, 1, 'a new child has its hiding animation');
    assert.ok(c.anims[0].frames.every((f) => 'opacity' in f) && c.anims[0].opts.composite === 'add');
  }
  assert.equal(old.anims[0].cancelled, true, 'the one of the child that left is gone');
  // (a child already seen is not given a second one)
  mo.cb([{ target: text, removedNodes: [], addedNodes: [fresh] }]);
  assert.equal(fresh.anims.length, 1);
  assert.equal(sh.active(), true);
});
