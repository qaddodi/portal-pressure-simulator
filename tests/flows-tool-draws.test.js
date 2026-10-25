// The flows card (tool-flows.js) draws with a Healthy bar. target() once read `hide` before its const was declared, which
// threw "Cannot access 'hide' before initialization" the moment a Healthy bar existed (Varices deck, phone). This runs the
// real card: it configures it, runs its animation frame and checks it drew, for a Now bar equal to Healthy and for one that differs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { EDGES } from '../src/engine/topology.js';

const idx = Object.fromEntries(EDGES.map((e, k) => [e.id, k]));
const node = (tag) => ({
  tag, attrs: {}, kids: [], style: {}, dataset: {}, isConnected: true, clientWidth: 420, clientHeight: 160,
  setAttribute(k, v) { this.attrs[k] = v; },
  append(...k) { this.kids.push(...k); },
  replaceChildren(...k) { this.kids = k; },
  getBoundingClientRect() { return { width: 420, height: 160 }; },
});
globalThis.document.createElement = (tag) => (tag === 'canvas' ? { getContext: () => null } : node(tag));
globalThis.document.createElementNS = (ns, tag) => node(tag);
globalThis.getComputedStyle = () => ({ fontSize: '14px', getPropertyValue: () => '' });
let frames = [];
globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
globalThis.cancelAnimationFrame = () => {};
const { createFlowsTool } = await import('../src/ui/tool-flows.js');

const fp = (pv, ha, shunt = 0, c3 = 0) => {
  const Q = new Array(EDGES.length).fill(0);
  Q[idx.PRE_R] = pv / 2; Q[idx.PRE_L] = pv / 2; Q[idx.A_HR] = ha / 2; Q[idx.A_HL] = ha / 2; Q[idx.C3] = c3; Q[idx.PV_TRUNK] = pv + c3;
  return { at: { Q }, shunt };
};
const drawn = (card) => { while (frames.length) frames.shift()(); return card.el.kids[0]; };

for (const of of ['portal', 'inflow']) {
  test(`the ${of} card draws its Healthy bar, Now bar equal or not, without throwing`, () => {
    const healthy = fp(73, 27);
    for (const now of [healthy, fp(40, 60, 0.3, 30)]) {
      frames = [];
      const card = createFlowsTool();
      card.configure({ kind: 'flows', of }, { fp: now, healthy: () => healthy });
      const svg = drawn(card);
      assert.equal(svg?.tag, 'svg', 'the first frame drew the card');
      assert.ok(svg.attrs['aria-label'].includes('healthy'), 'the Healthy bar is on the card');
      card.dispose();
    }
  });
}
