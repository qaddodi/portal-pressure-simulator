import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.getComputedStyle ??= () => ({});
const { liveOf, specOpacity, chainM, shapeSource, bindShape } = await import('../src/ui/organ-paint.js');
const { createWireOut, createWireIn } = await import('../src/ui/organ-wire.js');

// A page element with the members the painter reads.
function el(name, { attrs = {}, style = {}, m = null } = {}) {
  const e = {
    nodeType: 1, localName: name, attrs: { ...attrs }, style: { ...style },
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    transform: { baseVal: { numberOfItems: m ? 1 : 0, consolidate: () => ({ matrix: { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] } }) } },
  };
  return e;
}
const set = (e, m) => { e.transform.baseVal.numberOfItems = 1; e.transform.baseVal.consolidate = () => ({ matrix: { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] } }); };

function scene() {
  const root = el('g', { style: { opacity: '0.5' } }), kid = el('g', { m: [1, 0, 0, 1, 10, 20], attrs: { opacity: '0.8' } });
  const path = el('path', { attrs: { d: 'M0 0L1 1', 'fill-opacity': '0.4' } });
  bindShape(path, shapeSource('M0 0L1 1', [['M', 0, 0], ['L', 1, 1]]));
  const op = { geom: { el: path, d: true }, m: [1, 0, 0, 1, 10, 20], kind: 'fill', paint: { solid: [1, 0, 0, 1] }, alpha: 0.5, el: path, chain: [kid, path], a0: 0, clip: null };
  return { root, kid, path, spec: { ops: [op], opacity: 0.5, mask: null, root } };
}

test('a group sent as values paints from the same live numbers, and follows a delta', () => {
  const { root, kid, path, spec } = scene();
  const out = createWireOut(), inn = createWireIn();
  const plain = structuredClone(out.encode(spec));
  inn.apply(structuredClone(out.delta()));
  const got = inn.decode(plain);
  const same = () => {
    assert.deepEqual(liveOf(got.ops[0]), liveOf(spec.ops[0]));
    assert.equal(specOpacity(got), specOpacity(spec));
    assert.deepEqual(chainM(got.ops[0].chain), chainM(spec.ops[0].chain));
  };
  same();
  assert.equal(got.ops[0].geom.el.getAttribute('d'), 'M0 0L1 1');
  // The page eases an opacity and moves a frame: only those elements are in the delta.
  kid.attrs.opacity = '0.3'; set(kid, [2, 0, 0, 2, 5, 5]); root.style.opacity = '0.9';
  const d = out.delta();
  assert.equal(d.length, 2);
  inn.apply(structuredClone(d));
  same();
  assert.equal(out.delta().length, 0);
  // The outline's text changes: the painter would read the new text.
  path.attrs.d = 'M0 0L2 2';
  inn.apply(structuredClone(out.delta()));
  assert.equal(got.ops[0].geom.el.getAttribute('d'), 'M0 0L2 2');
});

test('a shared element is one stand-in everywhere it is used', () => {
  const { spec, kid } = scene();
  spec.ops.push({ ...spec.ops[0], chain: [kid] });
  const out = createWireOut(), inn = createWireIn();
  const plain = out.encode(spec);
  inn.apply(out.delta());
  const got = inn.decode(structuredClone(plain));
  assert.equal(got.ops[0].chain[0], got.ops[1].chain[0]);
  assert.equal(inn.size, out.size);
});
