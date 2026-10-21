import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gapLine, gestureText } from '../src/ui/perf-readout.js';
import { gpuProbe } from '../src/ui/gpu-probe.js';

// The ?perf readout (perf-readout.js): what blocks frames after a gesture, measured on the owner's own devices (21 Oct).
// Without ?perf it must change nothing: never fetched, the probe off, no panel.

test('the readout is loaded only with ?perf in the address, and nothing else imports it', () => {
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(new URLSearchParams\(location\.search\)\.has\('perf'\)\) import\('\.\/perf-readout\.js\?v=[0-9a-f]+'\)\.then\(\(\{ startPerfReadout \}\) => startPerfReadout\(/);
  const dir = new URL('../src/ui/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /from '\.\/perf-readout\.js/, `${f} imports it statically`);
    if (f !== 'main.js') assert.doesNotMatch(src, /import\(\s*'\.\/perf-readout\.js/, `${f} loads it`);
  }
  assert.equal((main.match(/perf-readout\.js\?v=/g) || []).length, 1);
});

test('without the readout the probe is off and never waits for the GPU; with it, it times script only', () => {
  assert.equal(gpuProbe.on, false);
  assert.equal(gpuProbe.cpuOnly, false);
  let finished = 0;
  const gl = { finish: () => { finished++; } };
  try {
    gpuProbe.on = true; gpuProbe.cpuOnly = true; gpuProbe.take();
    assert.equal(gpuProbe.time(gl, 'step', () => 7), 7);
    assert.equal(finished, 0, 'no gl.finish: the page runs as it does for everyone');
    assert.ok('step' in gpuProbe.take());
  } finally { gpuProbe.on = false; gpuProbe.cpuOnly = false; gpuProbe.take(); }
  const src = readFileSync(new URL('../src/ui/perf-readout.js', import.meta.url), 'utf8');
  assert.match(src, /gpuProbe\.cpuOnly = true; gpuProbe\.on = true;/);
  // The panel is written only when a gesture's window closes, never on each frame.
  const tick = src.slice(src.indexOf('const tick'), src.indexOf('requestAnimationFrame(tick);\n  };'));
  assert.equal((tick.match(/paint\(\)/g) || []).length, 1);
  assert.match(tick, /if \(t - cur\.t0 >= cur\.win\) \{ reports\.unshift\(cur\); reports\.length = Math\.min\(reports\.length, KEEP\); cur = null; paint\(\); \}/);
});

test('a gesture reads as one line per slow frame, with its steps largest first and the rest of the page', () => {
  assert.equal(gapLine({ at: 312.4, dt: 64.2, parts: { 'vessel sync (script)': 11.6, 'organ picture: draw': 30.2, tiny: 0.2 } }),
    '  +312 ms: frame took 64 ms (organ picture: draw 30, vessel sync (script) 12, rest of page 22)');
  const t = gestureText({ n: 3, kind: 'pan', view: 'circuit', zoom: '1.25', frames: 110, worst: 64.2, gaps: [], tasks: [{ at: 300, dt: 70, src: 'syncVeins stage.js 50 ms' }] });
  assert.equal(t, '#3 pan in circuit, zoom 1.25, 110 frames in 2 s, worst 64 ms\n  no frame over 20 ms\n  long task +300 ms: 70 ms (syncVeins stage.js 50 ms)');
});

test('a window lists what it measured as it stood (the blood squares a frame repaints) and says when it was GPU timed', () => {
  const t = gestureText({ n: 4, kind: 'at rest', view: 'anatomy', zoom: '4.24', frames: 86, worst: 50, gaps: [], tasks: [], gpu: true, gauges: { 'blood squares on screen': '310 of 1031, 5.7 MP of 8.6, 136 px each', empty: '' } });
  assert.equal(t, '#4 at rest in anatomy, zoom 4.24, 86 frames in 2 s, worst 50 ms, GPU timed\n  blood squares on screen: 310 of 1031, 5.7 MP of 8.6, 136 px each\n  no frame over 20 ms');
  try {
    gpuProbe.on = false; gpuProbe.gauge('x', 1); assert.deepEqual(gpuProbe.takeGauges(), {}, 'off, nothing is kept');
    gpuProbe.on = true; gpuProbe.gauge('x', 1); gpuProbe.gauge('x', 2); assert.deepEqual(gpuProbe.takeGauges(), { x: 2 });
    assert.deepEqual(gpuProbe.takeGauges(), {});
  } finally { gpuProbe.on = false; gpuProbe.takeGauges(); }
  // The GPU switch starts off: the readout times script only until it is turned on.
  const src = readFileSync(new URL('../src/ui/perf-readout.js', import.meta.url), 'utf8');
  assert.match(src, /gpu\.onclick = \(\) => \{ gpuProbe\.cpuOnly = !gpuProbe\.cpuOnly; gpuLabel\(\); \};/);
});

test('a recording runs 6 s and counts the frames that redrew the whole picture or had the organ picture down', () => {
  const t = gestureText({ n: 5, kind: 'recording', view: 'anatomy', zoom: '0.84', win: 6000, frames: 300, worst: 90, gaps: [], tasks: [], tally: { 'whole picture': 120, 'organ picture down': 200 } });
  assert.equal(t, '#5 recording in anatomy, zoom 0.84, 300 frames in 6 s, worst 90 ms\n  whole picture in 120 of 300 frames, organ picture down in 200 of 300 frames\n  no frame over 20 ms');
  const src = readFileSync(new URL('../src/ui/perf-readout.js', import.meta.url), 'utf8');
  assert.match(src, /rec\.onclick = \(\) => \{ begin\('recording', 6000\);/);
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /if \(gpuProbe\.on\) \{ if \(full\) gpuProbe\.note\('whole picture'\); if \(!look\.plate\) gpuProbe\.note\('organ picture down'\); \}/);
});

test('a running change names its parts in the readout: the vessel sync and the update are split by job', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  for (const name of ['vessel sync: list', 'vessel sync: radii', 'vessel sync: binning', 'vessel sync: colours', 'update: geometry', 'update: tubes', 'update: overlays', 'update: bridges', 'update: labels', 'update: organs', 'update: slide marks', 'update: nodes']) {
    assert.match(src, new RegExp(`gpuProbe\\.time\\(null, '${name}', \\(\\) => `), name);
  }
});

test('the ?perf test switch leaves out the live organs or the GPU picture for a recording, and says so in its report', () => {
  const src = readFileSync(new URL('../src/ui/perf-readout.js', import.meta.url), 'utf8');
  assert.match(src, /const HIDES = \['', 'no live organs', 'no figure SVG', 'no labels', 'no GPU picture'\];/);
  assert.match(src, /hideStyle\.textContent = HIDE_CSS\[HIDES\[hideAt\]\] \|\| '';/);
  assert.match(src, /hide: HIDES\[hideAt\] \};/);
  assert.match(src, /\$\{r\.hide \? `, TEST: \$\{r\.hide\}` : ''\}/);
  assert.match(src, /gpuProbe\.skipGL = HIDES\[hideAt\] === 'no GPU picture';/);
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /if \(gpuProbe\.skipGL\) \{ skipped = true; return; \}\n\s+if \(skipped\) \{ skipped = false; full = true; \}/, 'whole again after');
});
