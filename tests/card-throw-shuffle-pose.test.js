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
const { createShuffle, shufPose, shufPoseCss, shufKeyframes, SHUF } = await import('../src/ui/card-shuffle.js');
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

test('shufPoseCss is shufPose in percentages of the card\'s own box: the same top edge, the same slip, for any height and width', () => {
  const num = /translate\(calc\((-?[\d.]+)% \+ (-?[\d.]+)px\), calc\((-?[\d.]+)px - (-?[\d.]+)%\)\) rotate\((-?[\d.]+)deg\) scale\((-?[\d.]+)\)/;
  for (const card of ['words', 'data']) for (const p of [0, 0.2, 0.5, 0.8, 1]) for (const [h, w] of [[200, 300], [340, 520]]) {
    const m = num.exec(shufPoseCss(card, p));
    assert.ok(m, shufPoseCss(card, p));
    const x = +m[1] / 100 * w + +m[2], ty = +m[3] - +m[4] / 100 * h, g = shufPose(card, p, h, SHUF.strip, w);
    assert.ok(Math.abs(x - g.x) < 0.01, `${card} ${p}: x`);
    assert.ok(Math.abs(ty - g.ty) < 0.01, `${card} ${p}: ty`);
    assert.ok(Math.abs(+m[6] - g.s) < 1e-4, `${card} ${p}: scale`);
  }
});

test('the clip\'s foot is a share of the card\'s height: for any height it shows what shufPose says shows', () => {
  const k = shufKeyframes('data');
  const re = /^inset\((-?[\d.]+)px (-?[\d.]+)px calc\(\(100% - (\d+)px\) \* ([\d.]+) - ([\d.]+)px\) (-?[\d.]+)px round/;
  for (const h of [150, 340, 600]) for (let i = 0; i <= SHUF.steps; i++) {
    const m = re.exec(k.clip[i].clipPath), foot = (h - +m[3]) * +m[4] - +m[5], g = shufPose('data', i / SHUF.steps, h);
    assert.ok(Math.abs(foot - (h - g.vis - 40 * g.f)) < 0.2, `h ${h} step ${i}`);
  }
});

test('a card thrown on a slide change keeps the Shuffle\'s pose: the throw composes it into its own transform, never drops it', () => {
  const { text, shade, data, sh } = rig();
  assert.equal(sh.active(), true);
  sh.go(1); for (let i = 0; i < 90; i++) tick(16);   // the instrument is in front, the words behind
  assert.equal(sh.front(), 'data');
  ct.throwOut(text, 'next', 300); ct.throwOut(shade, 'next', 300); ct.throwOut(data, 'next', 300);
  tick(16); tick(16);
  for (const [el, kind] of [[text, 'words'], [shade, 'words'], [data, 'data']]) {
    const t = el.style.transform;
    assert.match(t, /^translateX\(-?[\d.]+px\) /, 'the throw\'s own translate first');
    assert.ok(t.endsWith(shufPoseCss(kind, 1)), `${kind}: and the shuffle's pose for this position after it: ${t}`);
    assert.equal(el.style.getPropertyPriority('transform'), 'important');
  }
  for (let i = 0; i < 80; i++) tick(16);
  // (landed out: the card behind is still behind at its pose, which its animation shows again when the throw lets go)
  ct.throwIn(text, 'next', 0);
  for (let i = 0; i < 6; i++) tick(16);
  assert.ok(text.style.transform.endsWith(shufPoseCss('words', 1)), 'in, it keeps the pose too');
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
