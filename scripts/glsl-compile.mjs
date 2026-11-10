// The shader compile check (brief S0-K, 10 Nov 2026): compiles and links the shader strings of scripts/glsl-compile-list.mjs in headless
// Chromium's WebGL2 and prints each program's `ok`, or the shader and program info logs with the failing source lines numbered.
//
//   node scripts/glsl-compile.mjs [name-fragment ...]     (with names, only the list entries whose name contains one of them)
//   exit status: 0 all ok (skipped entries are noted, not failed), 1 any program failed, 2 the check itself could not run
//
// WHAT IT IS, AND IS NOT. It is the ONE headless step the project allows besides smoke-lite (owner, 10 Nov 2026): it opens `about:blank`
// (NOT the app), makes a WebGL2 context on a 16 x 16 canvas, and asks the driver whether each vertex and fragment text compiles and links.
// It draws nothing, takes no picture, judges no look and measures no speed, and it is not part of `npm test`, lint, CI or any workflow.
// `tests/glsl-lint.js` is not a compiler; this is. The context is Chromium's software WebGL2 (SwiftShader, through ANGLE): it can differ
// from an iPhone's, iPad's or Mac's driver (a limit one has and the other lacks, a stricter or looser reading of the language), so `ok` here
// is strong evidence and not a guarantee; a failure here is real unless the log names a SwiftShader limit.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { programs } from './glsl-compile-list.mjs';

// The software WebGL2 flags scripts/shoot.mjs uses (CHROMIUM_ARGS there); copied, not imported, so this script never pulls in the code
// that opens the app. Keep the two in step.
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

const want = process.argv.slice(2).map((s) => s.toLowerCase());
const list = programs();
const picked = want.length ? list.filter((p) => want.some((w) => p.name.toLowerCase().includes(w))) : list;
const skipped = (programs.skipped || []).filter((s) => !want.length || want.some((w) => s.name.toLowerCase().includes(w)));

/** The failing lines of `src` the info log names ("ERROR: 0:123: ..."), numbered, with two lines around each. */
export function numbered(src, log) {
  const lines = src.split('\n');
  const bad = new Set();
  for (const m of log.matchAll(/(?:ERROR|WARNING):\s*\d+:(\d+)/g)) bad.add(+m[1]);
  if (!bad.size) return '';
  const show = new Set();
  for (const n of bad) for (let k = n - 2; k <= n + 2; k++) if (k >= 1 && k <= lines.length) show.add(k);
  const out = [];
  let last = 0;
  for (const k of [...show].sort((a, b) => a - b)) {
    if (last && k > last + 1) out.push('      ...');
    out.push(`  ${bad.has(k) ? '>>' : '  '} ${String(k).padStart(5)} | ${lines[k - 1]}`);
    last = k;
  }
  return out.join('\n');
}

/** Run in the page: compile and link each { vs, fs }; answer the logs. No drawing. */
function inPage(items) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const gl = canvas.getContext('webgl2');
  if (!gl) return { noContext: true };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const one = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    const ok = !!gl.getShaderParameter(sh, gl.COMPILE_STATUS);
    const log = gl.getShaderInfoLog(sh) || '';
    return { sh, ok, log };
  };
  const results = items.map((it) => {
    const r = { name: it.name, vsOk: null, fsOk: null, vsLog: '', fsLog: '', linked: null, linkLog: '' };
    const f = one(gl.FRAGMENT_SHADER, it.fs);
    r.fsOk = f.ok; r.fsLog = f.log;
    let v = null;
    if (it.vs) { v = one(gl.VERTEX_SHADER, it.vs); r.vsOk = v.ok; r.vsLog = v.log; }
    if (v && v.ok && f.ok) {
      const p = gl.createProgram();
      gl.attachShader(p, v.sh);
      gl.attachShader(p, f.sh);
      gl.linkProgram(p);
      r.linked = !!gl.getProgramParameter(p, gl.LINK_STATUS);
      r.linkLog = gl.getProgramInfoLog(p) || '';
      gl.deleteProgram(p);
    }
    gl.deleteShader(f.sh);
    if (v) gl.deleteShader(v.sh);
    return r;
  });
  return { renderer, version: gl.getParameter(gl.VERSION), results };
}

async function main() {
  for (const s of skipped) console.log(`skip  ${s.name}  (${s.why})`);
  const bad = picked.filter((p) => p.error);
  for (const p of bad) console.log(`FAIL  ${p.name}\n      ${p.error}`);
  const todo = picked.filter((p) => !p.error);
  if (want.length && !picked.length && !skipped.length) { console.error(`no list entry matches: ${want.join(', ')}`); return 2; }
  if (!todo.length) return bad.length ? 1 : 0;

  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch (e) { console.error(`playwright is not installed (npm ci): ${e.message}`); return 2; }
  let browser;
  try { browser = await chromium.launch({ headless: true, args: ARGS, ...(EXE ? { executablePath: EXE } : {}) }); } catch (e) { console.error(`Chromium did not start: ${e.message}`); return 2; }
  let failed = bad.length;
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    const got = await page.evaluate(inPage, todo.map(({ name, vs, fs }) => ({ name, vs, fs })));
    if (got.noContext) { console.error('this Chromium gave no WebGL2 context: nothing could be checked'); return 2; }
    console.log(`WebGL2 renderer: ${got.renderer}  (${got.version})`);
    for (let i = 0; i < todo.length; i++) {
      const p = todo[i], r = got.results[i];
      const ok = r.fsOk && (p.vs ? r.vsOk && r.linked : true);
      const parts = `vs ${p.vs ? p.vs.split('\n').length : '-'} lines, fs ${p.fs.split('\n').length} lines`;
      if (ok) { console.log(`ok    ${p.name}  (${parts}${p.vs ? ', linked' : ', compiled alone'})${p.note ? `  [${p.note}]` : ''}`); continue; }
      failed++;
      console.log(`FAIL  ${p.name}  (${parts})`);
      if (r.vsOk === false) console.log(`    vertex shader log:\n${indent(r.vsLog)}\n${numbered(p.vs, r.vsLog)}`);
      if (r.fsOk === false) console.log(`    fragment shader log:\n${indent(r.fsLog)}\n${numbered(p.fs, r.fsLog)}`);
      if (r.linked === false) console.log(`    program link log:\n${indent(r.linkLog)}`);
    }
  } finally { await browser.close(); }
  console.log(failed ? `\n${failed} program(s) failed` : `\nall ${todo.length} program(s) ok${skipped.length ? `, ${skipped.length} skipped` : ''}`);
  return failed ? 1 : 0;
}
const indent = (s) => (s || '(empty log)').trim().split('\n').map((l) => `      ${l}`).join('\n');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
