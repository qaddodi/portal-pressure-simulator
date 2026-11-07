import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// R10 (review pass 2): a quality step allocates nothing (the tiers' targets grow only, never remade for a canvas resize), and
// Locked never carries over the frames of a surface animating on screen; what it does carry is counted per surface.
const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const vitals = readFileSync(new URL('../src/ui/vitals-monitor.js', import.meta.url), 'utf8');

test('the tiers\' targets are made once and kept through canvas resizes and tier steps', () => {
  const src = veins.slice(veins.indexOf('  function lowTargets(w, h) {'), veins.indexOf('  function lowPass(m, look) {'));
  let made = 0, pw = 1000, ph = 800;
  const gl = { FRAMEBUFFER: 1, TEXTURE_2D: 2, createFramebuffer: () => ({}), bindFramebuffer() {}, bindTexture() {}, texImage2D() { made++; }, framebufferTexture2D() {}, drawBuffers() {}, texParameteri() {}, TEXTURE_MIN_FILTER: 3, TEXTURE_MAG_FILTER: 4, LINEAR: 5 };
  const env = { gl, ATTACH: [0, 1, 2], dataTex: () => ({}), layerFmt: () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]], PW: () => pw, PH: () => ph, lowTop: 0.85, lowMade: 0, lw: { fbo: null, tex: null, w: 0, h: 0 } };
  const lowTargets = new Function('env', `with (env) { ${src} return lowTargets; }`)(env);
  lowTargets(850, 680);
  assert.equal(made, 3, 'made once (three attachments)');
  for (const k of [0.85, 0.71, 0.5, 0.71, 0.85]) lowTargets(Math.round(pw * k), Math.round(ph * k));
  assert.equal(made, 3, 'tier steps make nothing');
  for (const s of [0.75, 0.5, 0.9, 1]) { pw = 1000 * s; ph = 800 * s; lowTargets(Math.round(pw * 0.71), Math.round(ph * 0.71)); }
  assert.equal(made, 3, 'a smaller or equal canvas makes nothing');
  pw = 1400; ph = 1000; lowTargets(Math.round(pw * 0.71), Math.round(ph * 0.71));
  assert.equal(made, 6, 'outgrown by a larger canvas: made once more');
  assert.equal(env.lowMade, 2);
});

test('Locked never sheds an animating surface, and counts what it sheds', async () => {
  globalThis.requestAnimationFrame ||= () => 0;
  const fr = await import('../src/ui/frame.js');
  assert.equal(typeof fr.frameAnimating, 'function');
  fr.frameAnimating('vitals-monitor', true); fr.frameAnimating('vitals-monitor', true);
  assert.deepEqual(fr.shedStats().animating, ['vitals-monitor']);
  fr.frameAnimating('vitals-monitor', false);
  assert.deepEqual(fr.shedStats().animating, ['vitals-monitor'], 'one of two strips still scrolls');
  fr.frameAnimating('vitals-monitor', false);
  assert.deepEqual(fr.shedStats().animating, []);
  assert.equal(typeof fr.shedStats().byTag, 'object');
  const frame = readFileSync(new URL('../src/ui/frame.js', import.meta.url), 'utf8');
  assert.match(frame, /!frameT0 \|\| animatingTags\.has\(tag\)\) \{/);   // (before the governor's and the watchdog's rules alike)
  assert.match(frame, /shedBy\.set\(tag, \(shedBy\.get\(tag\) \|\| 0\) \+ 1\);/);
  // The strip marks itself while it scrolls, and lets go when it stops or is disposed.
  assert.match(vitals, /ticking = true; frameAnimating\('vitals-monitor', true\);/);
  assert.match(vitals, /ticking = false; frameAnimating\('vitals-monitor', false\);/);
  assert.match(vitals, /if \(ticking\) frameAnimating\('vitals-monitor', false\); ticking = false;/);
});
