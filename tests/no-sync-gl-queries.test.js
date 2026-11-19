// GPU-6 (19 Nov 2026 review): gl.isTexture, gl.isFramebuffer, gl.isEnabled and their kind are synchronous queries. In WebKit's GPU process each one is a round trip that waits for
// the queued work (the 8 Nov isEnabled reads were 7.6 of 10.9 s of a Safari recording), and trace-gl.js asked two of them on the first stroke of every chart frame. A WebGL object lives
// until its context is lost, so code that needs to know whether one is still good keeps the context's generation (gl-state.js glGen, the pool's gen) and asks nothing of the driver;
// enabled switches come from the context's record (glOn). The few calls left are listed: setup that runs once, or the record's own fallback. None may be added.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

const ALLOWED = {
  'src/ui/gl-compile.js': 3,   // isProgram: a program started in this context is found again; made when a program is asked for, never in a frame's draw
  'src/ui/gl-state.js': 3,     // isEnabled: the record's first sweep of a context, its fallback where it has no record (and the comment naming it)
  'src/ui/keep-screen.js': 1,  // isFramebuffer: once, as a context is attached
};

test('no synchronous GL object or state query outside the listed setup calls', () => {
  const found = {};
  for (const f of walk('src').filter((x) => x.endsWith('.js'))) {
    const code = readFileSync(join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const n = code.match(/\.is(Texture|Framebuffer|Renderbuffer|Buffer|Program|Shader|Enabled|VertexArray|Sampler|Query|Sync)\(/g)?.length || 0;
    if (n) found[f.split('\\').join('/')] = n;
  }
  const bad = Object.entries(found).filter(([f, n]) => n > (ALLOWED[f] || 0)).map(([f, n]) => `${f}: ${n} calls, ${ALLOWED[f] || 0} allowed`);
  assert.deepEqual(bad, [], 'keep the context generation (glGen) and ask the driver nothing; enabled switches: glOn(gl, cap)');
  for (const [f, n] of Object.entries(ALLOWED)) assert.ok((found[f] || 0) >= n, `${f} has fewer calls than allowed (${found[f] || 0} of ${n}): lower the allowance`);
});
