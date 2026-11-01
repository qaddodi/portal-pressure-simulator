// Off-GPU scan: lists every piece of src/, styles/ and index.html that draws, animates or reads layout off the GPU, and fails
// when there is any (the owner, 1 Nov 2026: "block everything until everything is on GPU"; the limit is zero).
//
//   node scripts/off-gpu-scan.mjs            print the hits, exit 1 if there are any
//   node scripts/off-gpu-scan.mjs --doc      also write docs/off-gpu-inventory.md (file, function, owning thread, counts)
//   node scripts/off-gpu-scan.mjs --summary  also append the list to $GITHUB_STEP_SUMMARY (the Pages gate)
//   node scripts/off-gpu-scan.mjs --json     print the hits as JSON
//
// What counts (docs/gpu-practices.md and the project's top rule):
//   ctx2d        getContext('2d') (or a kind that is not a literal 'webgl…'/'bitmaprenderer')
//   draw2d       drawImage, putImageData, getImageData (CPU pixels)
//   cpuBlur      a canvas 2D filter, or a CSS filter with blur()
//   svgRaster    an SVG turned into pixels by the browser: 'image/svg+xml' Blob/data URL, XMLSerializer
//   svgDom       SVG drawn by the page: createElementNS with the SVG namespace, '<svg' markup in script or index.html
//   backdrop     backdrop-filter (CSS or script) with any value but none
//   paintAnim    CSS transition/@keyframes or a WAAPI animate() of a property that repaints every frame it moves: mask*,
//                clip-path, background*, colours, borders, shadows, filter, outline, SVG fill/stroke/dash, border-radius, custom --vars
//   layoutAnim   CSS transition/@keyframes or a WAAPI animate() of width, height, top, left, right, bottom, inset,
//                margin*, padding*, min/max-width/height (a transition with no property, or 'all', counts too)
//   layoutWrite  a style write of one of those properties in a frame or motion callback
//   layoutRead   getBoundingClientRect, getClientRects, getComputedStyle, offset*, client*, scroll* reads in a frame or
//                motion callback
//   rawRaf       requestAnimationFrame anywhere but the one scheduler (src/ui/frame.js)
//   syncStatus   getShaderParameter(COMPILE_STATUS) / getProgramParameter(LINK_STATUS) not behind a COMPLETION_STATUS poll
//
// "Frame or motion callback": a function handed to requestAnimationFrame or the scheduler (frame, lateFrame, finalFrame,
// frameFor's raf) or to setInterval (a poll that lays out the page on a timer stalls whichever frame it lands in), a pointermove/touchmove/mousemove/scroll/wheel/gesture handler, a function named tick/loop/animate/…Frame,
// and every function those call, followed through this file and through imports.
import { readFileSync, writeFileSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OWNERS = JSON.parse(readFileSync(join(ROOT, 'scripts/off-gpu-owners.json'), 'utf8'));

export const CATS = {
  ctx2d: 'Canvas 2D context',
  draw2d: 'Canvas 2D pixel copy (drawImage / putImageData / getImageData)',
  cpuBlur: 'CPU or CSS blur filter',
  svgRaster: 'SVG rasterised by the browser',
  svgDom: 'SVG drawn as page content',
  backdrop: 'backdrop-filter',
  layoutAnim: 'Layout property animated (CSS / WAAPI)',
  paintAnim: 'Repainting property animated (mask, clip-path, colour, shadow… ; CSS / WAAPI)',
  layoutWrite: 'Layout style written in a frame or motion callback',
  layoutRead: 'Layout read in a frame or motion callback',
  rawRaf: 'Raw requestAnimationFrame (outside the scheduler)',
  syncStatus: 'Synchronous shader compile/link status read',
};

const LAYOUT_PROPS = new Set(['width', 'height', 'top', 'left', 'right', 'bottom', 'inset', 'margin', 'margin-top', 'margin-bottom', 'margin-left',
  'margin-right', 'margin-block', 'margin-inline', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'padding-block',
  'padding-inline', 'max-height', 'min-height', 'max-width', 'min-width', 'block-size', 'inline-size', 'grid-template-rows', 'grid-template-columns',
  'flex-basis', 'r', 'cx', 'cy', 'd', 'all']);
// Animated, these repaint every frame on the CPU (only transform and opacity stay on the compositor).
const isPaint = (p) => /^(-webkit-)?mask(-|$)/.test(p) || /^(-webkit-)?clip-path$/.test(p) || /^(background|border|outline|box-shadow|text-shadow|color|fill|stroke|filter|backdrop-filter|-webkit-backdrop-filter|caret-color|accent-color|text-decoration-color|column-rule|stop-color|flood-color|lighting-color|-webkit-text-stroke|-webkit-text-fill-color)/.test(p) || /^--/.test(p);
const PAINT_JS = /^(webkit)?[Mm]ask|^(webkit)?[Cc]lipPath$|^(background|border|outline|boxShadow|textShadow|color|fill|stroke|filter|backdropFilter|webkitBackdropFilter|stopColor)/;
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const LAYOUT_JS = new Set([...LAYOUT_PROPS].filter((p) => p !== 'all').map(camel));
const READ_PROPS = new Set(['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'offsetParent', 'clientWidth', 'clientHeight', 'clientTop',
  'clientLeft', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft']);
const READ_CALLS = new Set(['getBoundingClientRect', 'getClientRects', 'getComputedStyle', 'elementFromPoint', 'elementsFromPoint']);
const MOTION_EVENTS = new Set(['pointermove', 'touchmove', 'mousemove', 'scroll', 'wheel', 'gesturechange', 'drag']);
const FRAME_NAME = /^(tick|loop|animate|onFrame|step)$|Frame$|^frame$|Tick$|Loop$/;
const SCHEDULER = 'src/ui/frame.js';

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

export function ownerOf(file, cat, fn = '') {
  // (fns: an entry for some functions of a file only, matched against the hit's function path.)
  for (const o of OWNERS.byCategory) if (o.cats.includes(cat) && (!o.files || o.files.some((f) => file.includes(f))) && (!o.fns || o.fns.some((f) => String(fn).includes(f)))) return o.thread;
  for (const o of OWNERS.byFile) if (o.files.some((f) => file.includes(f))) return o.thread;
  return OWNERS.unassigned;
}

// ---- CSS (styles/*.css, index.html <style>, and CSS inside script strings) ----
// Every render or motion site looked at, on the GPU or not ("x/y on GPU"): the lines holding a drawing call, a context, an animation,
// a frame request, a layout read or write, a blur or a shader status read. A line with no hit is on the GPU (x); y is x plus the hits.
let sites = new Set();
const look = (kind, file, line) => sites.add(`${file}:${line}`);
function cssHits(text, file, lineBase, fn, push) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  let depth = 0, kfDepth = -1, sel = fn;
  const nl = [];
  for (let k = src.indexOf('\n'); k >= 0; k = src.indexOf('\n', k + 1)) nl.push(k);
  const lineAt = (i) => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < i) lo = m + 1; else hi = m; } return lineBase + lo; };
  const declRe = /([a-zA-Z-]+)\s*:\s*([^;{}]+)/g;
  let i;
  // Second pass: declarations with their enclosing block heads.
  const stack = [];
  let last = 0;
  const scanDecls = (from, to) => {
    const chunk = src.slice(from, to);
    declRe.lastIndex = 0;
    let m;
    while ((m = declRe.exec(chunk))) {
      const prop = m[1].toLowerCase(), val = m[2].trim(), at = lineAt(from + m.index);
      sel = stack.length ? stack[stack.length - 1] : fn;
      // (a selector like a:hover would read as a declaration; only those followed by ; } or end count)
      const after = chunk[m.index + m[0].length];
      if (after !== undefined && after !== ';' && after !== '}' && after !== '\n') continue;
      if (/^(-webkit-)?backdrop-filter$/.test(prop) || prop === 'filter') look('blur', file, at);
      if (/^(-webkit-)?backdrop-filter$/.test(prop) && !/^none\b/.test(val)) push('backdrop', file, at, sel, `${prop}: ${val}`);
      if (prop === 'filter' && /blur\(/.test(val)) push('cpuBlur', file, at, sel, `filter: ${val}`);
      if (prop === 'transition' || prop === 'transition-property') {
        for (const part of val.split(',')) {
          const first = part.trim().split(/\s+/)[0];
          const isTime = /^[\d.]+m?s$/.test(first) || /^var\(/.test(first) && prop === 'transition' && !/[a-z]-?[a-z]*\s*$/.test(first);
          const p = prop === 'transition' && (isTime || /^(ease|linear|cubic|steps)/.test(first)) ? 'all' : first;
          look('anim', file, at);
          if (LAYOUT_PROPS.has(p)) push('layoutAnim', file, at, sel, `${prop}: ${part.trim()}`);
          else if (isPaint(p)) push('paintAnim', file, at, sel, `${prop}: ${part.trim()}`);
        }
      }
      if (kfDepth >= 0) look('anim', file, at);
      if (kfDepth >= 0 && LAYOUT_PROPS.has(prop)) push('layoutAnim', file, at, sel, `@keyframes sets ${prop}: ${val}`);
      else if (kfDepth >= 0 && isPaint(prop)) push('paintAnim', file, at, sel, `@keyframes sets ${prop}: ${val}`);
    }
  };
  for (i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '}') {
      // (Before a '{' the text after the last ';' is a selector or an at-rule's head, such as @supports (backdrop-filter: …): not a declaration.)
      scanDecls(last, c === '{' ? Math.max(last, src.lastIndexOf(';', i) + 1) : i);
      last = i + 1;
      if (c === '{') {
        const head = src.slice(Math.max(src.lastIndexOf(';', i), src.lastIndexOf('{', i - 1), src.lastIndexOf('}', i)) + 1, i).trim().replace(/\s+/g, ' ');
        if (/^@(-webkit-)?keyframes/.test(head) && kfDepth < 0) kfDepth = depth;
        stack.push(head.slice(0, 80)); depth++;
      } else {
        depth--; stack.pop();
        if (depth === kfDepth) kfDepth = -1;
      }
    }
  }
  scanDecls(last, src.length);
}

// ---- JS ----
const SKIP = new Set(['parent', 'loc', 'range', 'start', 'end']);
function visit(node, parent, fn) {
  if (!node || typeof node.type !== 'string') return;
  node.parent = parent;
  fn(node);
  for (const k of Object.keys(node)) {
    if (SKIP.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) visit(c, node, fn); else if (v && typeof v.type === 'string') visit(v, node, fn);
  }
}
const isFn = (n) => n && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);
function fnName(f) {
  if (f.id?.name) return f.id.name;
  const p = f.parent;
  if (p?.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
  if ((p?.type === 'Property' || p?.type === 'MethodDefinition' || p?.type === 'PropertyDefinition') && !p.computed) return p.key.name ?? p.key.value;
  if (p?.type === 'AssignmentExpression') return p.left.type === 'Identifier' ? p.left.name : p.left.property?.name;
  return null;
}
const enclosing = (n) => { for (let p = n.parent; p; p = p.parent) if (isFn(p)) return p; return null; };
function label(f) {
  if (!f) return '(module top level)';
  const chain = [];
  for (let p = f; p; p = enclosing(p)) chain.unshift(fnName(p) || (p.parent?.type === 'CallExpression' ? `(callback of ${calleeName(p.parent) || 'call'})` : '(anonymous)'));
  return chain.join(' › ');
}
function calleeName(call) {
  const c = call.callee;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed) return c.property.name;
  return null;
}
const strOf = (n) => n?.type === 'Literal' && typeof n.value === 'string' ? n.value : n?.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked ?? q.value.raw).join('${}') : null;

function parseJs(file, text) {
  try { return espree.parse(text, { ecmaVersion: 'latest', sourceType: 'module', loc: true }); } catch {
    return espree.parse(text, { ecmaVersion: 'latest', sourceType: 'script', loc: true });
  }
}

export function scan({ root = ROOT } = {}) {
  const hits = [];
  sites = new Set();
  const push = (cat, file, line, fn, detail) => (look(cat, file, line), hits.push({ cat, file, line, fn, detail: String(detail).slice(0, 260), owner: ownerOf(file, cat, fn) }));
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'styles')), join(root, 'index.html')].map((p) => relative(root, p).split('\\').join('/'));

  // Per JS file: functions, their calls, frame seeds, deferred hits (frame-only categories).
  const mods = new Map();
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    if (file.endsWith('.css')) { cssHits(text, file, 1, '(stylesheet)', push); continue; }
    if (file.endsWith('.html')) {
      const re = /<style[^>]*>([\s\S]*?)<\/style>/g; let m;
      while ((m = re.exec(text))) cssHits(m[1], file, text.slice(0, m.index).split('\n').length, '<style>', push);
      text.split('\n').forEach((l, i) => { if (/<svg[\s>]/.test(l)) push('svgDom', file, i + 1, '(markup)', l.trim()); });
      continue;
    }
    if (!file.endsWith('.js')) continue;
    const ast = parseJs(file, text);
    const mod = { file, fns: new Map(), calls: new Map(), imports: new Map(), exports: new Map(), seeds: new Set(), late: [] };
    mods.set(file, mod);
    const frameCallers = new Set(['requestAnimationFrame', 'frame', 'lateFrame', 'finalFrame']);
    // (raf = frameFor('x'), and imported scheduler names under any local alias)
    visit(ast, null, (n) => {
      if (n.type === 'ImportDeclaration') {
        const from = resolve(dirname(join(root, file)), n.source.value.split('?')[0]);
        const rel = relative(root, from).split('\\').join('/');
        for (const s of n.specifiers) if (s.type === 'ImportSpecifier') {
          mod.imports.set(s.local.name, [rel, s.imported.name]);
          if (rel === SCHEDULER && ['frame', 'lateFrame', 'finalFrame'].includes(s.imported.name)) frameCallers.add(s.local.name);
        }
      }
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init?.type === 'CallExpression' && calleeName(n.init) === 'frameFor') frameCallers.add(n.id.name);
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /raf|Frame$/i.test(n.id.name) && n.init && /frameFor|frame\(|Frame\(/.test(text.slice(n.init.start, n.init.end))) frameCallers.add(n.id.name);
    });
    const keyOf = (f) => f.__key || (f.__key = `${fnName(f) || 'anon'}@${f.loc.start.line}`);
    visit(ast, null, (n) => {
      if (isFn(n)) {
        const name = fnName(n);
        mod.fns.set(keyOf(n), n);
        const outer = enclosing(n);
        if (outer) { mod.kids ||= new Map(); if (!mod.kids.has(outer)) mod.kids.set(outer, []); mod.kids.get(outer).push(n); }
        if (name) { if (!mod.byName) mod.byName = new Map(); if (!mod.byName.has(name)) mod.byName.set(name, []); mod.byName.get(name).push(n); }
        if (name && FRAME_NAME.test(name)) mod.seeds.add(n);
        const p = n.parent;
        if (p?.type === 'CallExpression' && p.arguments.includes(n)) {
          const cn = calleeName(p);
          if (frameCallers.has(cn) || cn === 'setInterval') mod.seeds.add(n);
          if (cn === 'addEventListener' && MOTION_EVENTS.has(strOf(p.arguments[0]))) mod.seeds.add(n);
        }
        if (p?.type === 'AssignmentExpression' && /^on(pointermove|touchmove|mousemove|scroll|wheel)$/.test(p.left.property?.name || '')) mod.seeds.add(n);
      }
      if (n.type === 'ExportNamedDeclaration') {
        const d = n.declaration;
        if (d?.type === 'FunctionDeclaration') mod.exports.set(d.id.name, d.id.name);
        if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier') mod.exports.set(v.id.name, v.id.name);
        for (const s of n.specifiers || []) mod.exports.set(s.exported.name, s.local.name);
      }
      if (n.type === 'CallExpression') {
        const cn = calleeName(n), f = enclosing(n);
        const key = f ? keyOf(f) : '(top)';
        if (!mod.calls.has(key)) mod.calls.set(key, new Set());
        if (cn) mod.calls.get(key).add(cn);
        // Callbacks handed by name to the scheduler or a motion listener.
        if ((frameCallers.has(cn) || cn === 'setInterval') && n.arguments[0]?.type === 'Identifier') (mod.seedNames ||= new Set()).add(n.arguments[0].name);
        if (cn === 'addEventListener' && MOTION_EVENTS.has(strOf(n.arguments[0])) && n.arguments[1]?.type === 'Identifier') (mod.seedNames ||= new Set()).add(n.arguments[1].name);
        if (cn === 'addEventListener' && MOTION_EVENTS.has(strOf(n.arguments[0])) && n.arguments[1]?.type === 'MemberExpression') (mod.seedNames ||= new Set()).add(n.arguments[1].property.name);

        // Always-hits.
        const a0 = n.arguments[0];
        if (cn === 'getContext' || cn === 'drawImage' || cn === 'putImageData' || cn === 'getImageData' || cn === 'createElementNS' || frameCallers.has(cn)
          || /^(drawArrays|drawElements|drawArraysInstanced|drawElementsInstanced|drawRangeElements|blitFramebuffer)$/.test(cn || '')
          || (cn === 'getShaderParameter' || cn === 'getProgramParameter') && /COMPILE_STATUS|LINK_STATUS/.test(text.slice(n.arguments[1]?.start ?? 0, n.arguments[1]?.end ?? 0))
          || cn === 'animate' && n.callee.type === 'MemberExpression' && a0) look(cn, file, n.loc.start.line);
        if (cn === 'getContext') {
          const k = strOf(a0);
          if (k === '2d' || (k == null) || !/^(webgl|webgl2|experimental-webgl|bitmaprenderer|webgpu)$/.test(k)) push('ctx2d', file, n.loc.start.line, label(f), text.slice(n.start, n.end));
        }
        if (cn === 'drawImage' || cn === 'putImageData' || cn === 'getImageData') push('draw2d', file, n.loc.start.line, label(f), text.slice(n.start, Math.min(n.end, n.start + 120)));
        if (cn === 'requestAnimationFrame' && file !== SCHEDULER) push('rawRaf', file, n.loc.start.line, label(f), text.slice(n.start, Math.min(n.end, n.start + 100)));
        if (cn === 'createElementNS' && /svg/.test(text.slice(a0?.start ?? 0, a0?.end ?? 0) + (strOf(a0) || ''))) push('svgDom', file, n.loc.start.line, label(f), text.slice(n.start, Math.min(n.end, n.start + 100)));
        if ((cn === 'getShaderParameter' || cn === 'getProgramParameter') && /COMPILE_STATUS|LINK_STATUS/.test(text.slice(n.arguments[1]?.start ?? 0, n.arguments[1]?.end ?? 0)) && !/COMPLETION_STATUS/.test(text.slice(n.arguments[1].start, n.arguments[1].end))) {
          // A module that polls COMPLETION_STATUS (KHR_parallel_shader_compile) before it reads the status does not wait on the driver.
          const polled = /COMPLETION_STATUS_KHR\)/.test(text);
          if (!polled) push('syncStatus', file, n.loc.start.line, label(f), text.slice(n.start, Math.min(n.end, n.start + 100)));
        }
        if (cn === 'animate' && n.callee.type === 'MemberExpression' && a0) {
          const kf = text.slice(a0.start, a0.end);
          const props = [...kf.matchAll(/\b([a-zA-Z]+)\s*:/g)].map((m) => m[1]).filter((p) => LAYOUT_JS.has(p));
          if (props.length) push('layoutAnim', file, n.loc.start.line, label(f), `animate() of ${[...new Set(props)].join(', ')}`);
          const paints = [...kf.matchAll(/\b([a-zA-Z]+)\s*:/g)].map((m) => m[1]).filter((p) => PAINT_JS.test(p) && !/^(easing|offset|composite)$/.test(p));
          if (paints.length) push('paintAnim', file, n.loc.start.line, label(f), `animate() of ${[...new Set(paints)].join(', ')}`);
        }
        if (cn === 'setProperty' && LAYOUT_PROPS.has(strOf(a0))) mod.late.push(['layoutWrite', n, f, `setProperty('${strOf(a0)}')`]);
        if (READ_CALLS.has(cn)) mod.late.push(['layoutRead', n, f, `${cn}()`]);
        if (cn === 'XMLSerializer') push('svgRaster', file, n.loc.start.line, label(f), 'XMLSerializer');
      }
      if (n.type === 'NewExpression' && n.callee.name === 'XMLSerializer') push('svgRaster', file, n.loc.start.line, label(enclosing(n)), 'new XMLSerializer()');
      if (n.type === 'MemberExpression' && !n.computed && READ_PROPS.has(n.property.name)) {
        const p = n.parent;
        const written = p?.type === 'AssignmentExpression' && p.left === n;
        if (!written) mod.late.push(['layoutRead', n, enclosing(n), `.${n.property.name}`]);
      }
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed) {
        const prop = n.left.property.name, obj = n.left.object;
        const onStyle = obj.type === 'MemberExpression' && !obj.computed && obj.property.name === 'style';
        if (onStyle && /^(transition|filter|backdropFilter|webkitBackdropFilter)$/.test(prop) || prop === 'filter') look(prop, file, n.loc.start.line);
        if (onStyle && LAYOUT_JS.has(prop)) mod.late.push(['layoutWrite', n, enclosing(n), `style.${prop} =`]);
        if (onStyle && /^(webkitB|b)ackdropFilter$/.test(prop) && !/^['"`]none['"`]$/.test(text.slice(n.right.start, n.right.end))) push('backdrop', file, n.loc.start.line, label(enclosing(n)), text.slice(n.start, Math.min(n.end, n.start + 100)));
        if (prop === 'filter' && !onStyle && /blur\(/.test(text.slice(n.right.start, n.right.end))) push('cpuBlur', file, n.loc.start.line, label(enclosing(n)), `canvas filter: ${text.slice(n.right.start, Math.min(n.right.end, n.right.start + 80))}`);
        if (onStyle && prop === 'filter' && /blur\(/.test(text.slice(n.right.start, n.right.end))) push('cpuBlur', file, n.loc.start.line, label(enclosing(n)), text.slice(n.start, Math.min(n.end, n.start + 100)));
        if (onStyle && prop === 'transition') {
          const v = strOf(n.right) || text.slice(n.right.start, n.right.end);
          for (const part of v.split(',')) { const first = part.trim().replace(/^['"`]/, '').split(/\s+/)[0]; if (isPaint(first)) push('paintAnim', file, n.loc.start.line, label(enclosing(n)), `style.transition = ${part.trim()}`); if (LAYOUT_PROPS.has(first)) push('layoutAnim', file, n.loc.start.line, label(enclosing(n)), `style.transition = ${part.trim()}`); }
        }
      }
      // Strings: SVG rasters, SVG markup, and CSS text (cssText, style sheets built in script).
      const s = (n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral' ? strOf(n) : null;
      if (s && n.parent?.type !== 'ImportDeclaration' && n.parent?.type !== 'TemplateLiteral') {
        const f = enclosing(n);
        if (/image\/svg\+xml/.test(s) && !/parseFromString/.test(n.parent?.type === 'CallExpression' ? calleeName(n.parent) || '' : '')) push('svgRaster', file, n.loc.start.line, label(f), s.slice(0, 100));
        if (/<svg[\s>]/.test(s)) push('svgDom', file, n.loc.start.line, label(f), s.slice(0, 100).replace(/\s+/g, ' '));
        if (/(backdrop-filter|transition|filter)\s*:/.test(s)) cssHits(s.replace(/\$\{\}/g, '0'), file, n.loc.start.line, label(f), push);
      }
    });
    if (mod.seedNames) for (const nm of mod.seedNames) for (const f of mod.byName?.get(nm) || []) mod.seeds.add(f);
  }

  // Frame reach: from the seeds, through calls by name in the same file and through imports into other files.
  const reach = new Map(), queue = [];   // key -> the key that reached it (null for a seed)
  let from = null;
  const add = (mod, f) => { const k = `${mod.file}#${f.__key}`; if (!reach.has(k)) { reach.set(k, from); queue.push([mod, f]); } };
  for (const mod of mods.values()) for (const f of mod.seeds) add(mod, f);
  while (queue.length) {
    const [mod, f] = queue.shift();
    from = `${mod.file}#${f.__key}`;
    // Callbacks it hands to an array method, and functions it calls on the spot, run with it; nested functions it only
    // defines run when called (by name, below) or when handed to the scheduler or a listener (seeds of their own).
    for (const g of mod.kids?.get(f) || []) {
      const p = g.parent;
      const inline = p?.type === 'CallExpression' && (p.callee === g || p.arguments.includes(g) && /^(forEach|map|filter|some|every|reduce|find|findIndex|sort|flatMap|call|apply)$/.test(calleeName(p) || ''));
      if (inline) add(mod, g);
    }
    for (const nm of mod.calls.get(f.__key) || []) {
      for (const g of mod.byName?.get(nm) || []) add(mod, g);
      const imp = mod.imports.get(nm);
      if (imp) {
        const other = mods.get(imp[0]);
        const local = other?.exports.get(imp[1]);
        for (const g of (local && other.byName?.get(local)) || []) add(other, g);
      }
    }
  }
  for (const mod of mods.values()) for (const [cat, n, f, detail] of mod.late) {
    look(cat, mod.file, n.loc.start.line);
    let hit = null;
    for (let p = f; p && !hit; p = enclosing(p)) if (reach.has(`${mod.file}#${p.__key}`)) hit = `${mod.file}#${p.__key}`;
    if (!hit) continue;
    // How a frame reaches it: the chain of calls back to the frame callback or motion listener (shortened).
    const chain = [];
    for (let k = hit; k && chain.length < 8; k = reach.get(k)) chain.push(k.split('#')[0] === mod.file ? k.split('#')[1] : k.replace(/^src\/ui\//, ''));
    push(cat, mod.file, n.loc.start.line, label(f), `${detail} — frame path: ${chain.reverse().join(' → ')}`);
  }
  // One hit per place: a line can match twice (a string scanned as CSS and as a declaration).
  const seen = new Set();
  const out = hits.filter((h) => { const k = `${h.cat}|${h.file}|${h.line}|${h.detail}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.cat.localeCompare(b.cat));
  const hitLines = new Set(out.map((h) => `${h.file}:${h.line}`));
  const onGpu = [...sites].filter((k) => !hitLines.has(k)).length;
  out.onGpu = onGpu; out.sites = onGpu + out.length;
  return out;
}
export const score = (hits) => `${hits.onGpu}/${hits.sites} on GPU (${hits.sites ? Math.floor(100 * hits.onGpu / hits.sites) : 100}%), ${hits.length} off`;

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\n/g, ' ');
export function inventory(hits, { commit = '' } = {}) {
  const byCat = Object.fromEntries(Object.keys(CATS).map((c) => [c, 0]));
  const byOwner = {};
  for (const h of hits) { byCat[h.cat]++; byOwner[h.owner] = (byOwner[h.owner] || 0) + 1; }
  const L = [];
  L.push('# Off-GPU inventory', '');
  L.push('Generated by `node scripts/off-gpu-scan.mjs --doc`; do not edit by hand. The Pages gate and `npm run lint` fail while this list is not empty',
    '(owner, 1 Nov 2026: block everything until everything is on the GPU). What each category means is at the top of the script.', '');
  L.push(`**${score(hits)}**${commit ? ` at \`${commit}\`` : ''}.`, '');
  L.push('| Category | Count |', '|---|---|');
  for (const [c, n] of Object.entries(byCat)) L.push(`| ${CATS[c]} (\`${c}\`) | ${n} |`);
  L.push('', '| Owning thread | Count |', '|---|---|');
  for (const [o, n] of Object.entries(byOwner).sort((a, b) => b[1] - a[1])) L.push(`| ${esc(o)} | ${n} |`);
  L.push('', '## Every hit', '', '| File:line | Category | Function | What | Owner |', '|---|---|---|---|---|');
  for (const h of hits) L.push(`| ${h.file}:${h.line} | ${h.cat} | ${esc(h.fn)} | ${esc(h.detail)} | ${esc(h.owner)} |`);
  return L.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const hits = scan();
  if (args.has('--json')) { console.log(JSON.stringify(hits, null, 1)); process.exit(hits.length ? 1 : 0); }
  if (args.has('--doc')) writeFileSync(join(ROOT, 'docs/off-gpu-inventory.md'), inventory(hits, { commit: process.env.GITHUB_SHA?.slice(0, 8) || '' }));
  if (args.has('--summary') && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, inventory(hits, { commit: process.env.GITHUB_SHA?.slice(0, 8) || '' }));
  const byCat = {};
  for (const h of hits) byCat[h.cat] = (byCat[h.cat] || 0) + 1;
  if (!hits.length) { console.log(`off-gpu: ${score(hits)}. Nothing off the GPU.`); process.exit(0); }
  for (const h of hits) console.error(`${h.file}:${h.line}  ${h.cat}  ${h.fn}  ${h.detail}  [${h.owner}]`);
  console.error(`\noff-gpu: ${score(hits)} (${Object.entries(byCat).map(([c, n]) => `${c} ${n}`).join(', ')}). The limit is 0; see docs/off-gpu-inventory.md.`);
  process.exit(1);
}
