import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// The context guard (gpu-two-contexts-plan.md, X0). Every place in src/ that asks for a WebGL context is listed here, with how many
// times. The end state is two real contexts, the figure's (veins-gl.js) and the chart pool's (trace-gl.js), plus the throwaway
// probes in gl-support.js and sw-yield.js. Each package that removes a context deletes (or lowers) its own line below. A new
// getContext('webgl2') anywhere else, or one more in a listed file, fails this test: share the figure's or the pool's context instead.
const ALLOWED = {
  // end state
  'src/ui/veins-gl.js': 1,      // the figure
  'src/ui/trace-gl.js': 2,      // the chart pool (its full-screen drawer is U2's to place)
  'src/ui/gl-support.js': 2,    // probes: made once, thrown away
  'src/ui/sw-yield.js': 2,      // probe (webgl2, then webgl, on one line)
  // today's sites, each deleted by the package named
  'src/ui/stage.js': 2,         // S2/split: the software-yield probe on the figure's canvas
  'src/ui/lobule-zoom.js': 1,   // F2: software-yield probe on the lobule's own canvas
  'src/ui/sinusoid-view.js': 1, // F2
  'src/ui/sinusoid-gl.js': 1,   // F2
  'src/ui/tissue-gl.js': 1,     // F2
  'src/ui/fx-gl.js': 1,         // F2
  'src/ui/wide-gl.js': 1,       // F2
  'src/ui/field-gl.js': 1,      // F2
  'src/ui/label-gl.js': 1,      // S2: own-canvas mode
  'src/ui/res-cover-gl.js': 1,  // L2
  'src/ui/fibroscan-gl.js': 1,  // U1
  'src/ui/vitals-gl.js': 1,     // U1
  'src/ui/ink-gl.js': 1,        // F1
};

const root = new URL('../src/', import.meta.url).pathname;
const files = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? files(p) : /\.(m?js|ts)$/.test(n) ? [p] : [];
});

// Every getContext( call whose first argument is not the 2d or bitmaprenderer literal counts as a WebGL context (a variable
// argument could be anything). The line-comment text is dropped first; the declaration `function getContext(` is not a call.
function sites() {
  const found = {};
  for (const f of files(root)) {
    const rel = relative(new URL('..', import.meta.url).pathname, f).split(sep).join('/');
    let n = 0;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const code = line.replace(/\/\/.*$/, '');
      for (const m of code.matchAll(/(?<!function\s)\bgetContext\(\s*(['"`]?)([^'"`),\s]*)/g)) {
        if (m[1] && (m[2] === '2d' || m[2] === 'bitmaprenderer')) continue;
        n++;
      }
    }
    if (n) found[rel] = n;
  }
  return found;
}

test('only the listed files make a WebGL context, and no more of them than listed', () => {
  const found = sites();
  const extra = Object.keys(found).filter((f) => !(f in ALLOWED));
  assert.deepEqual(extra, [], `new WebGL context site(s) outside the allow-list: ${extra.join(', ')}. Share the figure's context (veins-gl.js) or the chart pool's (trace-gl.js) instead.`);
  const over = Object.entries(found).filter(([f, n]) => n > ALLOWED[f]).map(([f, n]) => `${f} has ${n}, allowed ${ALLOWED[f]}`);
  assert.deepEqual(over, [], `more WebGL contexts than listed: ${over.join('; ')}`);
});

test('the allow-list holds no stale line (a site that is gone is deleted from the list)', () => {
  const found = sites();
  const stale = Object.entries(ALLOWED).filter(([f, n]) => (found[f] || 0) < n).map(([f, n]) => `${f}: listed ${n}, found ${found[f] || 0}`);
  assert.deepEqual(stale, [], `lower or delete these allow-list lines: ${stale.join('; ')}`);
});
