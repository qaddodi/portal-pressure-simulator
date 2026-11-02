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
//   layoutRead   getBoundingClientRect, getClientRects, getComputedStyle, getAnimations, checkVisibility, getBBox, getScreenCTM, getCTM,
//                getTotalLength, getPointAtLength, isPointInStroke/Fill, scrollIntoView, offset*, client*, scroll*, innerWidth/Height, innerText reads in a frame or
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

// The figure's two SVG trees in index.html are its model, not a drawing: stage.js lays the figure and its labels out there and the GPU
// layers (veins-gl, organs-gl, label-gl) read them; with the GPU on (.gl-plate) the browser paints none of their elements (measured
// 1 Nov 2026, cirr-decomp). The owner approved not counting them (1 Nov 2026, 7:36 PM ET, "Sure go with its pick"). This list may not grow.
export const MODEL_SVG = ['stage', 'labels'];

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
  'clientLeft', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft', 'innerWidth', 'innerHeight', 'innerText']);   // (the window's size and an element's rendered text: 2 Nov 2026)
// (2 Nov 2026, from an iPhone trace of a slide change: these bring the page's style or layout up to date when called too, and were
// not counted: an element's animations, its visibility check, an SVG box, matrix or outline length, a point test on a stroke or fill,
// and a scroll into view.)
const READ_CALLS = new Set(['getBoundingClientRect', 'getClientRects', 'getComputedStyle', 'elementFromPoint', 'elementsFromPoint',
  'getAnimations', 'checkVisibility', 'getBBox', 'getScreenCTM', 'getCTM', 'getTotalLength', 'getPointAtLength', 'isPointInStroke', 'isPointInFill', 'scrollIntoView']);
const MOTION_EVENTS = new Set(['pointermove', 'touchmove', 'mousemove', 'scroll', 'wheel', 'gesturechange', 'drag', 'dragover', 'pointerrawupdate']);
// An argument that names a motion event, also as one choice of several (isTouch ? 'touchmove' : 'pointermove').
const MOTION_RE = /['"`](pointermove|touchmove|mousemove|scroll|wheel|gesturechange|drag|dragover|pointerrawupdate)['"`]/;
// Calls that keep a function to run later, not now (its own frame or event, if any, makes it a seed).
const DEFERRED = /^(setTimeout|setInterval|requestIdleCallback|queueMicrotask|addEventListener|removeEventListener|then|catch|finally|Promise|ResizeObserver|IntersectionObserver|MutationObserver|PerformanceObserver|afterMotion|whenQuiet|restPass|idle|onRenderScale|onFigLab|watchFrames|observe|subscribe|on|once|frame|lateFrame|finalFrame|requestAnimationFrame|nextFrame|easeFrame|drawFrame)$/;
// Receivers whose methods are the browser's own (a Map's set, a class list's add): a call on one never runs an app function.
const BUILTIN_NEW = /^(Map|Set|WeakMap|WeakSet|Array|Float32Array|Float64Array|Int8Array|Int16Array|Int32Array|Uint8Array|Uint8ClampedArray|Uint16Array|Uint32Array|Image|URLSearchParams|FormData|Date|RegExp|Path2D|DOMMatrix|ResizeObserver|IntersectionObserver|MutationObserver|AbortController|Worker|BroadcastChannel|Blob|URL|TextEncoder|TextDecoder)$/;
const BUILTIN_RECV = new Set(['classList', 'style', 'dataset', 'console', 'Math', 'JSON', 'Object', 'Array', 'Promise', 'Number', 'String', 'Reflect',
  'performance', 'document', 'window', 'globalThis', 'location', 'localStorage', 'sessionStorage', 'navigator', 'history', 'URL', 'Atomics', 'crypto']);
const ARRAY_OUT = /^(map|filter|slice|concat|flat|flatMap|from|keys|values|entries|split|querySelectorAll|getElementsByClassName|getElementsByTagName|sort|reverse|fill)$/;
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
      text.split('\n').forEach((l, i) => { if (/<svg[\s>]/.test(l) && !MODEL_SVG.some((id) => l.includes(`<svg id="${id}"`))) push('svgDom', file, i + 1, '(markup)', l.trim()); });
      continue;
    }
    if (!file.endsWith('.js')) continue;
    const ast = parseJs(file, text);
    const mod = { file, text, motionProps: [], fns: new Map(), origins: new Map(), calls: new Map(), imports: new Map(), exports: new Map(), seeds: new Set(), late: [] };
    mods.set(file, mod);
    const frameCallers = new Set(['requestAnimationFrame', 'frame', 'lateFrame', 'finalFrame']);
    // (raf = frameFor('x'), and imported scheduler names under any local alias)
    visit(ast, null, (n) => {
      if (n.type === 'ImportDeclaration') {
        const from = resolve(dirname(join(root, file)), n.source.value.split('?')[0]);
        const rel = relative(root, from).split('\\').join('/');
        for (const s of n.specifiers) if (s.type === 'ImportNamespaceSpecifier') mod.origins.set(s.local.name, rel);
        for (const s of n.specifiers) if (s.type === 'ImportSpecifier') {
          mod.imports.set(s.local.name, [rel, s.imported.name]);
          const made = /^(create|make)([A-Z]\w*)$/.exec(s.local.name);
          if (made) mod.origins.set(made[2][0].toLowerCase() + made[2].slice(1), rel);
          if (rel === SCHEDULER && ['frame', 'lateFrame', 'finalFrame'].includes(s.imported.name)) frameCallers.add(s.local.name);
        }
      }
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init?.type === 'CallExpression' && /^(frameFor|lateFrameFor|finalFrameFor)$/.test(calleeName(n.init) || '')) frameCallers.add(n.id.name);
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /raf|Frame$/i.test(n.id.name) && n.init && /frameFor|frame\(|Frame\(/.test(text.slice(n.init.start, n.init.end))) frameCallers.add(n.id.name);
    });
    let uid = 0;
    const keyOf = (f) => f.__key || (f.__key = `${fnName(f) || 'anon'}@${f.loc.start.line}${++uid > 0 && mod.fns.has(`${fnName(f) || 'anon'}@${f.loc.start.line}`) ? `.${uid}` : ''}`);
    mod.top = []; mod.containers = new Set(BUILTIN_RECV); mod.exposed = new Map(); mod.frameCallers = frameCallers;
    const builtinValue = (v) => v && (v.type === 'NewExpression' && BUILTIN_NEW.test(v.callee.name || '') || v.type === 'ArrayExpression'
      || v.type === 'Literal' || v.type === 'TemplateLiteral' || v.type === 'CallExpression' && ARRAY_OUT.test(calleeName(v) || ''));
    visit(ast, null, (n) => {
      if (isFn(n)) {
        const name = fnName(n);
        mod.fns.set(keyOf(n), n);
        const outer = enclosing(n);
        if (outer) { mod.kids ||= new Map(); if (!mod.kids.has(outer)) mod.kids.set(outer, []); mod.kids.get(outer).push(n); }
        if (name) { if (!mod.byName) mod.byName = new Map(); if (!mod.byName.has(name)) mod.byName.set(name, []); mod.byName.get(name).push(n); }
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
      // Containers (receivers whose methods are built in) and functions exposed under a property name ({ draw } or { draw: paint }).
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && builtinValue(n.init)) mod.containers.add(n.id.name);
      // Receivers made by an imported factory: R = createX(…), { R: createX(…) }, this.R = createX(…).
      const madeBy = (v) => v?.type === 'CallExpression' && v.callee.type === 'Identifier' && mod.imports.get(v.callee.name)?.[0];
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && madeBy(n.init)) mod.origins.set(n.id.name, madeBy(n.init));
      if (n.type === 'AssignmentExpression' && madeBy(n.right)) { const l = n.left; const nm = l.type === 'Identifier' ? l.name : !l.computed ? l.property?.name : null; if (nm) mod.origins.set(nm, madeBy(n.right)); }
      if (n.type === 'Property' && !n.computed && madeBy(n.value)) mod.origins.set(n.key.name ?? n.key.value, madeBy(n.value));
      if (n.type === 'AssignmentExpression' && builtinValue(n.right)) { const l = n.left; const nm = l.type === 'Identifier' ? l.name : !l.computed ? l.property?.name : null; if (nm) mod.containers.add(nm); }
      if (n.type === 'Property' && !n.computed && /^(pointermove|touchmove|mousemove|scroll|wheel|gesturechange|drag|dragover|on(Pointer|Touch|Mouse)Move|onScroll|onWheel|onDrag|move)$/.test(n.key.name ?? n.key.value ?? '')) mod.motionProps.push([n.value, enclosing(n)]);
      if (n.type === 'Property' && !n.computed && n.parent?.type === 'ObjectExpression') {
        const k = n.key.name ?? n.key.value;
        if (builtinValue(n.value)) mod.containers.add(k);
        if (n.value.type === 'Identifier') { if (!mod.exposed.has(k)) mod.exposed.set(k, new Set()); mod.exposed.get(k).add(n.value.name); }
      }
      if (n.type === 'CallExpression') {
        const cn = calleeName(n), f = enclosing(n);
        const c = n.callee, member = c.type === 'MemberExpression';
        const o = member ? c.object : null;
        const recv = !o ? null : o.type === 'Identifier' ? o.name : o.type === 'ThisExpression' ? 'this' : o.type === 'MemberExpression' && !o.computed ? o.property.name : null;
        if (cn) (f ? (f.__calls ||= []) : mod.top).push({ name: cn, member: member && !c.computed, recv, node: n, at: f });

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
  }

  // ---- Call resolution: by scope and import for a bare call, by method or exposed property for a member call ----
  const declKind = (g) => {
    const p = g.parent;
    if (g.type === 'FunctionDeclaration') return 'binding';
    if (p?.type === 'VariableDeclarator' && p.init === g) return 'binding';
    if (p?.type === 'AssignmentExpression' && p.right === g) return p.left.type === 'Identifier' ? 'binding' : 'method';
    if (p?.type === 'Property' || p?.type === 'MethodDefinition' || p?.type === 'PropertyDefinition') return 'method';
    return null;
  };
  const chainOf = (f) => { const c = []; for (let p = f; p; p = enclosing(p)) c.push(p); return c; };
  // The function a bare name means at a call inside `at`: the innermost binding in scope, else the import of that name.
  function resolveBare(mod, name, at) {
    const binds = (mod.byName?.get(name) || []).filter((g) => declKind(g) === 'binding');
    if (binds.length) {
      const chain = chainOf(at);
      let best = null, depth = Infinity;
      for (const g of binds) {
        const sc = enclosing(g);
        const d = sc ? chain.indexOf(sc) : chain.length;   // (top level: visible everywhere, outermost)
        if (d >= 0 && d < depth) { best = g; depth = d; }
      }
      if (best) return [[mod, best]];
    }
    const imp = mod.imports.get(name);
    if (imp) {
      const other = mods.get(imp[0]);
      const local = other?.exports.get(imp[1]);
      return local ? resolveBare(other, local, null) : [];
    }
    // (Not a binding in scope nor an import: a parameter or a variable holding some function. Every function of that name in the
    // file is followed, so a callback handed in under its own name, opts.onClose as onClose, is never missed.)
    return (mod.byName?.get(name) || []).map((g) => [mod, g]);
  }
  // A member call: the file's methods of that name and the functions it exposes under that name; none on a built-in receiver.
  // (Conservative: an unknown receiver may be any of them, so every one is followed.)
  function resolveCall(mod, call) {
    if (!call.member) return resolveBare(mod, call.name, call.at);
    if (call.recv && call.recv !== 'this' && mod.containers.has(call.recv)) return [];
    const out = (mod.byName?.get(call.name) || []).filter((g) => declKind(g) === 'method').map((g) => [mod, g]);
    for (const nm of mod.exposed.get(call.name) || []) for (const g of mod.byName?.get(nm) || []) if (declKind(g) === 'binding') out.push([mod, g]);
    // (The receiver may be an object an imported module made: ui.zoom = createCardZoom(…), or named for the factory, stage for
    // createStage. That module's methods of the name are followed too.)
    const origin = call.recv && mod.origins.get(call.recv);
    for (const m of origin ? [mods.get(origin)].filter(Boolean) : []) {
      for (const g of m.byName?.get(call.name) || []) if (declKind(g) === 'method') out.push([m, g]);
      for (const nm of m.exposed.get(call.name) || []) for (const g of m.byName?.get(nm) || []) if (declKind(g) === 'binding') out.push([m, g]);
      const ex = m.exports.get(call.name);
      if (ex) out.push(...resolveBare(m, ex, null));
    }
    return out;
  }
  // A function handed to the scheduler, setInterval or a motion listener is a frame callback; so is one handed to a function that
  // passes that parameter on to one of them (a "taker"), followed until nothing changes.
  const takers = new Map();   // fn -> Set of argument indexes it hands to a frame
  const paramIndex = (fn, name) => fn ? fn.params.findIndex((p) => p.type === 'Identifier' && p.name === name) : -1;
  const seedArg = (mod, arg, at) => {
    if (!arg) return false;
    if (isFn(arg)) { const had = mod.seeds.has(arg); mod.seeds.add(arg); return !had; }
    let changed = false;
    if (arg.type === 'Identifier') {
      for (const [m, g] of resolveBare(mod, arg.name, at)) if (!m.seeds.has(g)) { m.seeds.add(g); changed = true; }
      for (const e of chainOf(at)) { const i = paramIndex(e, arg.name); if (i >= 0) { if (!takers.has(e)) takers.set(e, new Set()); if (!takers.get(e).has(i)) { takers.get(e).add(i); changed = true; } break; } }
    }
    if (arg.type === 'MemberExpression' && !arg.computed) for (const [m, g] of resolveCall(mod, { member: true, name: arg.property.name, recv: arg.object.type === 'ThisExpression' ? 'this' : arg.object.name, at })) if (!m.seeds.has(g)) { m.seeds.add(g); changed = true; }
    return changed;
  };
  const allCalls = (mod) => { const out = [...mod.top]; for (const g of mod.fns.values()) if (g.__calls) out.push(...g.__calls); return out; };
  for (let changed = true, round = 0; changed && round < 12; round++) {
    changed = false;
    for (const mod of mods.values()) for (const [v, at] of mod.motionProps) changed = seedArg(mod, v, at) || changed;
    for (const mod of mods.values()) for (const call of allCalls(mod)) {
      const a = call.node.arguments;
      if (mod.frameCallers.has(call.name) || call.name === 'setInterval') changed = seedArg(mod, a[0], call.at) || changed;
      // (addEventListener, or any helper that takes the event's name first: on('touchmove', fn), listen(el, 'scroll', fn)…)
      const ev = a.findIndex((x) => x && MOTION_RE.test(mod.text.slice(x.start, x.end)) && (x.type === 'Literal' || x.type === 'TemplateLiteral' || x.type === 'ConditionalExpression' || x.type === 'LogicalExpression'));
      if (ev >= 0) for (const x of a.slice(ev + 1)) changed = seedArg(mod, x, call.at) || changed;
      if (takers.size) for (const [, g] of resolveCall(mod, call)) for (const i of takers.get(g) || []) changed = seedArg(mod, a[i], call.at) || changed;
    }
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
      // (Handed to any call, it is taken to run then, as gpuProbe.time's or framePart's do, unless the call is one that runs it later.)
      const inline = (p?.type === 'CallExpression' || p?.type === 'NewExpression') && (p.callee === g || p.arguments.includes(g) && !DEFERRED.test(calleeName(p) || p.callee?.name || ''));
      if (inline) add(mod, g);
    }
    for (const call of f.__calls || []) for (const [m, g] of resolveCall(mod, call)) add(m, g);
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
// The deploy gate (owner, 1 Nov 2026, 6:29 PM ET: "at 90% you can let things through"): lint, the unit test and the Pages step
// pass once at least GATE_PCT of the sites are on the GPU. The scan stays as strict as ever and every hit is still listed; the goal
// is still nothing off the GPU.
export const GATE_PCT = 85;   // (6:45 PM ET: "ok let things through now at 85%"; 90 from 6:29 PM)
export const pctOf = (hits) => (hits.sites ? Math.floor(100 * hits.onGpu / hits.sites) : 100);
export const passes = (hits) => pctOf(hits) >= GATE_PCT;
export const score = (hits) => `${hits.onGpu}/${hits.sites} on GPU (${pctOf(hits)}%), ${hits.length} off`;

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\n/g, ' ');
export function inventory(hits, { commit = '' } = {}) {
  const byCat = Object.fromEntries(Object.keys(CATS).map((c) => [c, 0]));
  const byOwner = {};
  for (const h of hits) { byCat[h.cat]++; byOwner[h.owner] = (byOwner[h.owner] || 0) + 1; }
  const L = [];
  L.push('# Off-GPU inventory', '');
  L.push('Generated by `node scripts/off-gpu-scan.mjs --doc`; do not edit by hand. The Pages gate, the unit test and `npm run lint` fail while less than the gate is on the GPU',
    '(owner, 1 Nov 2026: block everything until everything is on the GPU; let things through from 85%). What each category means is at the top of the script.', '');
  L.push(`Deploy gate: ${GATE_PCT}% on the GPU (owner, 1 Nov 2026); now ${passes(hits) ? 'passes' : 'fails'}. The goal is still 0 off.`, '');
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
  if (args.has('--json')) { console.log(JSON.stringify(hits, null, 1)); process.exit(passes(hits) ? 0 : 1); }
  if (args.has('--doc')) writeFileSync(join(ROOT, 'docs/off-gpu-inventory.md'), inventory(hits, { commit: process.env.GITHUB_SHA?.slice(0, 8) || '' }));
  if (args.has('--summary') && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, inventory(hits, { commit: process.env.GITHUB_SHA?.slice(0, 8) || '' }));
  const byCat = {};
  for (const h of hits) byCat[h.cat] = (byCat[h.cat] || 0) + 1;
  if (!hits.length) { console.log(`off-gpu: ${score(hits)}. Nothing off the GPU.`); process.exit(0); }
  for (const h of hits) console.error(`${h.file}:${h.line}  ${h.cat}  ${h.fn}  ${h.detail}  [${h.owner}]`);
  console.error(`\noff-gpu: ${score(hits)} (${Object.entries(byCat).map(([c, n]) => `${c} ${n}`).join(', ')}). The goal is 0; see docs/off-gpu-inventory.md.`);
  console.error(passes(hits) ? `off-gpu: ${pctOf(hits)}% is at or above the gate (${GATE_PCT}%): passes. The goal is still 0 off.` : `off-gpu: ${pctOf(hits)}% is below the gate (${GATE_PCT}%): fails.`);
  process.exit(passes(hits) ? 0 : 1);
}
