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
//   domWrite     textContent/innerHTML/innerText/outerHTML written, or nodes added (append, insertBefore, replaceChildren…), in a frame
//                or motion callback (2 Nov 2026 review)
//   paintWrite   a repainting style (colour, fill, stroke, shadow, filter, mask…) written in a frame or motion callback
//   attrWrite    setAttribute/setAttributeNS/removeAttribute/toggleAttribute, dataset, .hidden/.disabled/.value/.data/.src/.href writes, and
//                remove()/removeChild()/removeProperty() in a frame or motion callback (2 Nov 2026 independent audit: 498 sites uncounted)
//   varWrite     style.setProperty (custom properties and dynamic names), style.cssText, and any other inline style (transform, opacity,
//                translate, scale, display, visibility…) written in a frame or motion callback: script-driven style, not compositor-only
//                (2 Nov 2026 independent audit: 295 sites uncounted)
//   alloc        a new array, object, typed array, Map/Set, closure, spread, array-returning call (map, filter, slice, concat, split,
//                Object.keys/entries…) or string build (template with a value, string +, toFixed/toString/padStart/JSON.stringify) in a frame or
//                motion callback: garbage every frame, and the collector's pause lands in a frame (2 Nov 2026: 570 KB a frame measured on
//                the must path by scripts/frame-alloc.mjs). One hit per line. The cure is a kept buffer or object, written in place.
//   observerRead a layout read in a MutationObserver callback, or anything it calls: a microtask straight after the writes
//                A line marked `// alloc-rare: <reason>` (`alloc-once:` is accepted as the same tag) (or directly under a comment-only line that is) is a branch that never runs per frame
//                (first use, a changed key, a resize, a context loss): it leaves the count and is listed with its reason (out.rare, inventory).
//   unreached    a site of the categories above that no frame, motion or observer path reaches, and that is not setup. Either it runs during use
//                (reached from an event handler, timer, promise, observer or store listener; the reason is in its detail) or no caller was found.
//                Never credited as "on GPU" (2 Nov 2026 audit: the score had counted every such site as on the GPU).
//   setup        not a hit: a site in code that runs once at module load or boot (reached from module top level) and that nothing run during
//                use calls. Left out of the count on both sides, listed in full in the inventory (out.setup).
//
// Blind spots closed 2 Nov 2026 (audit 1d83acc0): (1) dynamic dispatch: a callback kept in a map, array, set or handler object, or
// handed to a function that keeps it (store.on, onChange(fn), handlers[k] = fn, OPS[op](…)), runs wherever a reached function calls
// through that registry (listeners.get(k)[i](…), cb() over a list, map.get(k)()), so those callbacks are frame-reached with it;
// (2) a style written through a computed name (el.style[k] = v, Object.assign(el.style, …)) is counted by its name, or as a script-driven
// style when the name is not a literal; (3) a site no path reaches is `unreached`, never credited as on the GPU.
//
// "Frame or motion callback": a function handed to requestAnimationFrame or the scheduler (frame, lateFrame, finalFrame,
// frameFor's raf) or to setInterval (a poll that lays out the page on a timer stalls whichever frame it lands in), a pointermove/touchmove/mousemove/scroll/wheel/gesture handler, a function named tick/loop/animate/…Frame,
// and every function those call, followed through this file and through imports.
import { readFileSync, writeFileSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as espree from 'espree';

const scopeIds = new WeakMap();
let scopeCount = 0;
const scopeId = (fn) => { let k = scopeIds.get(fn); if (!k) scopeIds.set(fn, k = ++scopeCount); return k; };

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
  domWrite: 'DOM content written in a frame or motion callback (text, markup, nodes: the page laid out and painted again)',
  paintWrite: 'Repainting style written in a frame or motion callback (colour, fill, stroke, shadow, filter, mask…)',
  attrWrite: 'Attribute, dataset, hidden/disabled or node removal written in a frame or motion callback (setAttribute, dataset, removeAttribute, remove…: a style recalc, and a repaint for SVG attributes)',
  varWrite: 'Inline style or custom property written in a frame or motion callback (setProperty, style.transform/opacity/display…, cssText: script-driven style every frame)',
  alloc: 'Memory allocated in a frame or motion callback (new array, object, typed array, closure, spread, string build: garbage every frame; keep a buffer and write in place)',
  observerRead: 'Layout read in a mutation observer callback (a microtask straight after the writes)',
  unreached: 'Site no frame path reaches, that runs during use (event, timer, promise, listener) or has no caller the scan can find: never credited as on the GPU, with its reason',
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
// (Also repainting, exact names: SVG geometry and the text-decoration, clip and blend properties the prefix list above does not reach.
// 8 Nov 2026: a transition of any of them repaints every frame it moves just as a shadow does.)
const PAINT_EXACT = new Set(['clip', 'mix-blend-mode', 'paint-order', 'scrollbar-color', 'shape-outside', 'font-variation-settings', 'points', 'rx', 'ry', 'x', 'y', 'visibility-paint']);
const isPaintProp = (p) => isPaint(p) || PAINT_EXACT.has(p) || /^(-webkit-)?text-(decoration|emphasis|underline)/.test(p);
const PAINT_JS = /^(webkit)?[Mm]ask|^(webkit)?[Cc]lipPath$|^(background|border|outline|boxShadow|textShadow|color|fill|stroke|filter|backdropFilter|webkitBackdropFilter|stopColor)/;
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const LAYOUT_JS = new Set([...LAYOUT_PROPS].filter((p) => p !== 'all').map(camel));
const READ_PROPS = new Set(['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'offsetParent', 'clientWidth', 'clientHeight', 'clientTop',
  'clientLeft', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft', 'innerWidth', 'innerHeight', 'innerText']);   // (the window's size and an element's rendered text: 2 Nov 2026)
// (2 Nov 2026, from an iPhone trace of a slide change: these bring the page's style or layout up to date when called too, and were
// not counted: an element's animations, its visibility check, an SVG box, matrix or outline length, a point test on a stroke or fill,
// and a scroll into view.)
const READ_CALLS = new Set(['getComputedTiming', 'getBoundingClientRect', 'getClientRects', 'getComputedStyle', 'elementFromPoint', 'elementsFromPoint',
  'getAnimations', 'checkVisibility', 'getBBox', 'getScreenCTM', 'getCTM', 'getTotalLength', 'getPointAtLength', 'isPointInStroke', 'isPointInFill', 'scrollIntoView',
  // (The page's reads made through the one place that asks the browser (src/ui/layout-snap.js): the same reads, by their own names, so a
  // frame path that reaches one is still found.)
  'readBox', 'readRects', 'readStyle', 'readCTM', 'readLocalCTM', 'readBBox', 'readLength', 'readPoint', 'readMetric', 'readElAt', 'readElsAt',
  'readAnims', 'readTiming', 'readVisible', 'readInStroke', 'readInFill', 'scrollInto']);
const MOTION_EVENTS = new Set(['pointermove', 'touchmove', 'mousemove', 'scroll', 'wheel', 'gesturechange', 'drag', 'dragover', 'pointerrawupdate']);
// An argument that names a motion event, also as one choice of several (isTouch ? 'touchmove' : 'pointermove').
const MOTION_RE = /['"`](pointermove|touchmove|mousemove|scroll|wheel|gesturechange|drag|dragover|pointerrawupdate)['"`]/;
// Calls that keep a function to run later, not now (its own frame or event, if any, makes it a seed).
const DEFERRED = /^(setTimeout|setInterval|requestIdleCallback|queueMicrotask|addEventListener|removeEventListener|then|catch|finally|Promise|ResizeObserver|IntersectionObserver|MutationObserver|PerformanceObserver|afterMotion|whenQuiet|restPass|runSoon|idle|onRenderScale|onFigLab|watchFrames|observe|subscribe|on|once|frame|lateFrame|finalFrame|requestAnimationFrame|nextFrame|easeFrame|drawFrame)$/;
// Receivers whose methods are the browser's own (a Map's set, a class list's add): a call on one never runs an app function.
const FN = Symbol('fn');   // (a name declared as a function: a call of it is a call of that function, not through a registry)
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

// ---- Transition lists (8 Nov 2026) ----
// A transition's property names, wherever they stand in the list: `transition: 0.2s box-shadow` and `transition: opacity 1s, box-shadow 1s
// cubic-bezier(.2, .8, .2, 1)` name box-shadow as much as `transition: box-shadow 1s` does (the list is split on the commas outside
// brackets, and a property may come before or after its times). A name held in a custom property (`transition: var(--t-glow)` with
// `--t-glow: box-shadow .4s ease`) is read from that property's declarations anywhere in the styles, every value it is given. A part that
// names no property at all transitions everything ('all'), as in CSS.
const customVals = new Map();   // (custom property name -> every value any rule gives it; filled from the styles at the start of a scan)
export function noteCustomProps(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const re = /(?:^|[;{}\s])(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+)/g;
  let m;
  while ((m = re.exec(src))) { const v = m[2].trim().replace(/\s*!important$/, ''); const a = customVals.get(m[1]) || []; if (!a.includes(v)) a.push(v); customVals.set(m[1], a); }
}
const splitTop = (str, sep) => {
  const out = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (sep === ',' ? ch === ',' : /\s/.test(ch))) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};
const NOT_PROP = /^(?:[+-]?[\d.]+m?s|ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|normal|allow-discrete|none|inherit|initial|unset|revert|revert-layer|!important)$|^(?:cubic-bezier|steps|linear)\(/i;
/** The property names a transition value (or transition-property value) names: [{ prop, part }], one per name; 'all' for a part naming none. */
export function transitionProps(val, { longhand = false, depth = 0 } = {}) {
  const out = [];
  for (const part of splitTop(String(val).replace(/^['"`]|['"`]$/g, ''), ',')) {
    const found = []; let none = false;
    for (const tok of splitTop(part, ' ')) {
      const t = tok.replace(/^['"`]|['"`]$/g, '');
      const v = /^var\(\s*(--[\w-]+)/.exec(t);
      if (v) {
        // (A custom property: what it holds, each value it is given; one nobody declares stands for a time or a curve, as it always did.)
        if (depth < 4) for (const held of customVals.get(v[1]) || []) for (const r of transitionProps(held, { longhand, depth: depth + 1 })) if (r.explicit) found.push(r.prop);
        continue;
      }
      if (t.toLowerCase() === 'none') none = true;
      if (NOT_PROP.test(t)) continue;
      if (/^-{0,2}[a-z][a-z0-9-]*$/i.test(t)) found.push(t.toLowerCase());
    }
    if (found.length) for (const prop of found) out.push({ prop, part, explicit: true });
    else if (none) continue;   // (transition: none)
    else if (!longhand || part) out.push({ prop: 'all', part, explicit: false });
  }
  return out;
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
        look('anim', file, at);
        for (const { prop: p, part } of transitionProps(val.replace(/\s*!important$/, ''), { longhand: prop === 'transition-property' })) {
          if (LAYOUT_PROPS.has(p)) push('layoutAnim', file, at, sel, `${prop}: ${part}`);
          else if (isPaintProp(p)) push('paintAnim', file, at, sel, `${prop}: ${part}`);
        }
      }
      if (kfDepth >= 0) look('anim', file, at);
      if (kfDepth >= 0 && LAYOUT_PROPS.has(prop)) push('layoutAnim', file, at, sel, `@keyframes sets ${prop}: ${val}`);
      else if (kfDepth >= 0 && isPaintProp(prop)) push('paintAnim', file, at, sel, `@keyframes sets ${prop}: ${val}`);
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

// The name of the registry an expression reads from or stores into: listeners, this.cbs, bus.handlers, X[k], X.get(k), X.values().
function baseName(e) {
  if (!e) return null;
  if (e.type === 'Identifier') return e.name;
  if (e.type === 'ThisExpression') return 'this';
  if (e.type === 'ChainExpression') return baseName(e.expression);
  if (e.type === 'MemberExpression') return e.computed ? baseName(e.object) : e.property.name;
  if (e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && !e.callee.computed && /^(get|slice|filter|values|keys|entries|from|flat)$/.test(e.callee.property.name)) return baseName(e.callee.object);
  if (e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && e.callee.object.type === 'Identifier' && /^(Object|Array)$/.test(e.callee.object.name)) return baseName(e.arguments[0]);
  return null;
}
// A style key given by name: the kind of write it is (layout, repainting, or script-driven style).
const styleKeyCat = (key) => { const k = camel(key); return LAYOUT_JS.has(k) ? 'layoutWrite' : PAINT_JS.test(k) && k !== 'transition' ? 'paintWrite' : 'varWrite'; };

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
  customVals.clear();
  for (const file of files) {
    if (file.endsWith('.css')) noteCustomProps(readFileSync(join(root, file), 'utf8'));
    else if (file.endsWith('.html')) for (const m of readFileSync(join(root, file), 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) noteCustomProps(m[1]);
  }

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
    const mod = { file, text, motionProps: [], fns: new Map(), origins: new Map(), calls: new Map(), imports: new Map(), exports: new Map(), seeds: new Set(), obsSeeds: new Set(), softSeeds: new Set(), late: [], regs: [], alias: new Map(), decls: new Map(), shapes: new Map() };
    mods.set(file, mod);
    const frameCallers = new Set(['requestAnimationFrame', 'frame', 'readFrame', 'lateFrame', 'finalFrame']);
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
          if (rel === SCHEDULER && ['frame', 'readFrame', 'lateFrame', 'finalFrame'].includes(s.imported.name)) frameCallers.add(s.local.name);
        }
      }
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init?.type === 'CallExpression' && /^(frameFor|readFrameFor|lateFrameFor|finalFrameFor)$/.test(calleeName(n.init) || '')) frameCallers.add(n.id.name);
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /raf|Frame$/i.test(n.id.name) && n.init && /frameFor|frame\(|Frame\(/.test(text.slice(n.init.start, n.init.end))) frameCallers.add(n.id.name);
    });
    let uid = 0;
    const keyOf = (f) => f.__key || (f.__key = `${fnName(f) || 'anon'}@${f.loc.start.line}${++uid > 0 && mod.fns.has(`${fnName(f) || 'anon'}@${f.loc.start.line}`) ? `.${uid}` : ''}`);
    mod.top = []; mod.containers = new Set(BUILTIN_RECV); mod.exposed = new Map(); mod.frameCallers = frameCallers;
    // (Not null: let veins = null is a place kept for an object made later, veins = createVeinsGL(…), whose methods are the file's to follow; with null counted
    // as a built-in value every call on veins was dropped and the scan never reached the vessel renderer, 2 Nov 2026.)
    const builtinValue = (v) => v && (v.type === 'NewExpression' && BUILTIN_NEW.test(v.callee.name || '') || v.type === 'ArrayExpression'
      || v.type === 'Literal' && v.value !== null || v.type === 'TemplateLiteral' || v.type === 'CallExpression' && ARRAY_OUT.test(calleeName(v) || ''));
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
          if (cn === 'setTimeout') mod.softSeeds.add(n);
          if (cn === 'addEventListener' && MOTION_EVENTS.has(strOf(p.arguments[0]))) mod.seeds.add(n);
        }
        if (p?.type === 'AssignmentExpression' && /^on(pointermove|touchmove|mousemove|scroll|wheel)$/.test(p.left.property?.name || '')) mod.seeds.add(n);
        // (A mutation observer's callback runs as a microtask straight after the script that wrote: a read there lays the page out then.)
        if (p?.type === 'NewExpression' && p.callee.name === 'MutationObserver' && p.arguments[0] === n) mod.obsSeeds.add(n);
      }
      if (n.type === 'ExportNamedDeclaration') {
        const d = n.declaration;
        if (d?.type === 'FunctionDeclaration') mod.exports.set(d.id.name, d.id.name);
        if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier') mod.exports.set(v.id.name, v.id.name);
        for (const s of n.specifiers || []) mod.exports.set(s.exported.name, s.local.name);
      }
      // Containers (receivers whose methods are built in) and functions exposed under a property name ({ draw } or { draw: paint }).
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && builtinValue(n.init)) mod.containers.add(n.id.name);
      // Every declaration of a name with the function it is made in and what it was given (true: a built-in value; a name: another variable,
      // a built-in when that one is; false: anything else, a parameter included), so that a call on it is told from a call on an object of the
      // file's own: S.fill(0) on a Float32Array is not the recorder's fill method (paint-gl.js, 2 Nov 2026).
      const declare = (nm, scope, kind) => { if (!mod.decls.has(nm)) mod.decls.set(nm, []); mod.decls.get(nm).push({ scope, kind }); };
      const patNames = (p) => !p ? [] : p.type === 'Identifier' ? [p.name] : p.type === 'AssignmentPattern' ? patNames(p.left) : p.type === 'RestElement' ? patNames(p.argument)
        : p.type === 'ArrayPattern' ? p.elements.flatMap(patNames) : p.type === 'ObjectPattern' ? p.properties.flatMap((q) => patNames(q.type === 'Property' ? q.value : q)) : [];
      if (n.type === 'VariableDeclarator') for (const nm of patNames(n.id)) declare(nm, enclosing(n), n.id.type === 'Identifier' && n.init ? (isFn(n.init) ? FN : builtinValue(n.init) ? true : n.init.type === 'Identifier' ? n.init.name : false) : false);
      if (isFn(n)) for (const pm of n.params) for (const nm of patNames(pm)) declare(nm, n, false);
      if (n.type === 'FunctionDeclaration' && n.id) declare(n.id.name, enclosing(n), FN);
      // What each name holds, to tell a plain object (o.data = …, R.value = …) from an element: the shape of what each declaration and each
      // assignment gives it ('obj': an object literal; 'elem': an item of some table; a name: whatever that one is; 'other': anything else).
      const shapeOf = (v) => !v ? 'other' : v.type === 'ObjectExpression' ? 'obj' : v.type === 'AssignmentExpression' && v.operator === '=' ? shapeOf(v.right)
        : v.type === 'Identifier' ? v.name : v.type === 'MemberExpression' && v.computed ? 'elem' : 'other';
      const shape = (nm, scope, k, assigned) => { if (!mod.shapes.has(nm)) mod.shapes.set(nm, []); mod.shapes.get(nm).push({ scope, k, assigned }); };
      if (n.type === 'VariableDeclarator') for (const nm of patNames(n.id)) shape(nm, enclosing(n), n.id.type === 'Identifier' ? shapeOf(n.init) : 'other', false);
      if (isFn(n)) for (const pm of n.params) for (const nm of patNames(pm)) shape(nm, n, 'other', false);
      if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier') shape(n.left.name, enclosing(n), shapeOf(n.right), true);
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
        // A step handed by name to the timing wrappers that run it on the spot (gpuProbe.time(null, name, fn, a, b, c), framePart(tag, fn, a, b, c)) is called there, as the closure
        // `() => fn(a)` it replaced was: the name is a call of the function around (a function made to pass arguments is not a way out of the scan).
        if ((cn === 'time' && recv === 'gpuProbe') || cn === 'framePart') {
          const fa = n.arguments[cn === 'time' ? 2 : 1];
          if (fa?.type === 'Identifier') (f ? (f.__calls ||= []) : mod.top).push({ name: fa.name, member: false, recv: null, node: n, at: f });
        }

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
        // (The namespace by a name of the file's own, NS = 'http://www.w3.org/2000/svg', counts as well: 2 Nov 2026, a callout's outline went uncounted.)
        const nsOf = (q) => (q?.type === 'Identifier' ? (new RegExp(`\\b${q.name}\\s*=\\s*['"\`]([^'"\`]*)`).exec(text)?.[1] || '') : '');
        if (cn === 'createElementNS' && /svg/i.test(text.slice(a0?.start ?? 0, a0?.end ?? 0) + (strOf(a0) || '') + nsOf(a0))) push('svgDom', file, n.loc.start.line, label(f), text.slice(n.start, Math.min(n.end, n.start + 100)));
        // (And each SVG element made with util.js s() outside the figure's own model (stage.js, MODEL_SVG): leaders and other page-drawn SVG.)
        if (cn === 's' && !member && !/(^|\/)(stage|util)\.js$/.test(file) && /import \{[^}]*\bs\b[^}]*\} from '\.\/util\.js/.test(text) && strOf(a0)) push('svgDom', file, n.loc.start.line, label(f), text.slice(n.start, Math.min(n.end, n.start + 100)));
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
        if (member && /^(insertAdjacentHTML|insertAdjacentText|replaceChildren|appendChild|insertBefore|replaceChild|replaceWith|prepend|append)$/.test(cn || '') && !(recv && mod.containers.has(recv) && recv !== 'document')) mod.late.push(['domWrite', n, f, `${cn}()`]);
        if (member && /^(add|remove|toggle|replace)$/.test(cn || '') && n.callee.object.type === 'MemberExpression' && n.callee.object.property.name === 'classList') mod.late.push(['domWrite', n, f, `classList.${cn}()`]);
        if (cn === 'setProperty' && /^(stroke|fill|color|background|border|outline|box-shadow|text-shadow|filter|mask|clip-path)/.test(strOf(a0) || '')) mod.late.push(['paintWrite', n, f, `setProperty('${strOf(a0)}')`]);
        if (member && cn === 'setAttribute' && !/^['"`](class|id|role|aria-|data-|tabindex|type|href|width|height|viewBox|xmlns)/.test((strOf(a0)||'')) ) mod.late.push(['attrWrite', n, f, `setAttribute('${strOf(a0)}')`]);
        if (member && cn === 'setAttribute' && /^(width|height|viewBox)$/.test(strOf(a0)||'')) mod.late.push(['attrWrite', n, f, `setAttribute('${strOf(a0)}')`]);
        if (member && cn === 'setAttribute' && /^(class|data-|aria-)/.test(strOf(a0)||'')) mod.late.push(['attrWrite', n, f, `setAttribute('${strOf(a0)}')`]);
        if (member && cn === 'setAttribute' && strOf(a0) == null) mod.late.push(['attrWrite', n, f, `setAttribute(<dyn>)`]);
        if (member && cn === 'setProperty' && /^['"`]--/.test(text.slice(a0?.start ?? 0, a0?.end ?? 0))) mod.late.push(['varWrite', n, f, `setProperty('--var')`]);
        if (member && cn === 'setProperty' && strOf(a0) == null) mod.late.push(['varWrite', n, f, `setProperty(<dyn>)`]);
        if (member && /^(remove|removeChild|removeAttribute|toggleAttribute|setAttributeNS|removeProperty)$/.test(cn||'') && !(n.callee.object.type==='MemberExpression' && n.callee.object.property.name==='classList')) mod.late.push(['attrWrite', n, f, `${cn}()`]);
        if (cn === 'XMLSerializer') push('svgRaster', file, n.loc.start.line, label(f), 'XMLSerializer');
      }
      // Allocation sites (late: only those a frame or motion callback reaches count).
      {
        const f = enclosing(n);
        if (f) {
          const par = n.parent;
          if (n.type === 'ArrayExpression') mod.late.push(['alloc', n, f, par?.type === 'ReturnStatement' || par?.type === 'ArrowFunctionExpression' ? 'array literal (returned)' : 'array literal']);
          else if (n.type === 'ObjectExpression') mod.late.push(['alloc', n, f, 'object literal']);
          else if (n.type === 'NewExpression' && BUILTIN_NEW.test(n.callee.name || '') && !/^(Worker|BroadcastChannel|AbortController|ResizeObserver|IntersectionObserver|MutationObserver)$/.test(n.callee.name)) mod.late.push(['alloc', n, f, `new ${n.callee.name}`]);
          else if ((n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') && par && par.type !== 'MethodDefinition' && !(par.type === 'Property' && par.method)) mod.late.push(['alloc', n, f, 'closure']);
          else if (n.type === 'TemplateLiteral' && n.expressions.length && par?.type !== 'TaggedTemplateExpression') mod.late.push(['alloc', n, f, 'template string with a value']);
          else if (n.type === 'BinaryExpression' && n.operator === '+' && (strOf(n.left) != null || strOf(n.right) != null || n.left.type === 'BinaryExpression' && n.left.operator === '+' && n.left.__str)) { n.__str = true; if (par?.type !== 'BinaryExpression' || !par.__str) mod.late.push(['alloc', n, f, 'string concatenation']); }
          else if (n.type === 'SpreadElement') mod.late.push(['alloc', n, f, 'spread']);
          else if (n.type === 'CallExpression') {
            const cn = calleeName(n), c = n.callee;
            const objName = c.type === 'MemberExpression' && c.object.type === 'Identifier' ? c.object.name : '';
            if (c.type === 'MemberExpression' && !c.computed && /^(map|filter|slice|concat|flat|flatMap|split|toSorted|toReversed|substring|substr|padStart|padEnd|toFixed|toString|toLowerCase|toUpperCase|replace|replaceAll|trim|join|querySelectorAll)$/.test(cn) && !(cn === 'slice' && /Array$/.test(objName)) && !(cn === 'toString' && n.arguments.length === 0 && false)) mod.late.push(['alloc', n, f, `.${cn}()`]);
            else if (objName === 'Array' && /^(from|of)$/.test(cn)) mod.late.push(['alloc', n, f, `Array.${cn}()`]);
            else if (objName === 'Object' && /^(keys|values|entries|assign|fromEntries)$/.test(cn) && !(cn === 'assign' && n.arguments[0]?.type !== 'ObjectExpression')) mod.late.push(['alloc', n, f, `Object.${cn}()`]);
            else if (objName === 'JSON') mod.late.push(['alloc', n, f, `JSON.${cn}()`]);
            else if (c.type === 'Identifier' && /^(String|Array)$/.test(c.name)) mod.late.push(['alloc', n, f, `${c.name}()`]);
          }
        }
      }
      // (A ResizeObserver, IntersectionObserver or PerformanceObserver made with `new` runs its callback during use: the callback and
      // what it calls are use sites, 2 Nov 2026; before, only a MutationObserver's was, so everything a resize callback reached read as "no caller".)
      if (n.type === 'NewExpression' && /^(Resize|Intersection|Performance)Observer$/.test(n.callee.name || '')) (mod.newObs ||= []).push({ arg: n.arguments[0], at: enclosing(n) });
      // (A module read in by import('./x.js'): its exports are its entry points, called by whatever read it in, so they are use seeds below.)
      if (n.type === 'ImportExpression' && n.source?.type === 'Literal' && typeof n.source.value === 'string' && n.source.value.startsWith('.')) {
        const from = resolve(dirname(join(root, file)), n.source.value.split('?')[0]);
        // (Made by a lazy(() => import(…), make) loader it is run when first wanted, during use; read in straight at boot, as ?perf's HUD is,
        // its entry point runs once, at boot.)
        let viaLazy = false;
        for (let a = n.parent; a && !viaLazy; a = a.parent) if (a.type === 'CallExpression' && calleeName(a) === 'lazy') viaLazy = true;
        (mod.dynImports ||= []).push({ rel: relative(root, from).split('\\').join('/'), viaLazy });
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
        if (onStyle && PAINT_JS.test(prop) && prop !== 'transition') mod.late.push(['paintWrite', n, enclosing(n), `style.${prop} =`]);
        if (prop === 'cssText' && onStyle === false && obj.property?.name==='style') mod.late.push(['varWrite', n, enclosing(n), 'style.cssText =']);
        if (onStyle && prop !== 'transition' && !LAYOUT_JS.has(prop) && !PAINT_JS.test(prop)) mod.late.push(['varWrite', n, enclosing(n), `style.${prop} =`]);
        if (obj.type === 'MemberExpression' && !obj.computed && obj.property.name === 'dataset') mod.late.push(['attrWrite', n, enclosing(n), 'dataset write']);
        if (/^(nodeValue|data|hidden|disabled|value|checked|src|href)$/.test(prop) && !onStyle) mod.late.push(['attrWrite', n, enclosing(n), `.${prop} =`]);
        if (/^(textContent|innerHTML|innerText|outerHTML|className)$/.test(prop)) mod.late.push(['domWrite', n, enclosing(n), `.${prop} =`]);
        if (onStyle && /^(webkitB|b)ackdropFilter$/.test(prop) && !/^['"`]none['"`]$/.test(text.slice(n.right.start, n.right.end))) push('backdrop', file, n.loc.start.line, label(enclosing(n)), text.slice(n.start, Math.min(n.end, n.start + 100)));
        if (prop === 'filter' && !onStyle && /blur\(/.test(text.slice(n.right.start, n.right.end))) push('cpuBlur', file, n.loc.start.line, label(enclosing(n)), `canvas filter: ${text.slice(n.right.start, Math.min(n.right.end, n.right.start + 80))}`);
        if (onStyle && prop === 'filter' && /blur\(/.test(text.slice(n.right.start, n.right.end))) push('cpuBlur', file, n.loc.start.line, label(enclosing(n)), text.slice(n.start, Math.min(n.end, n.start + 100)));
        if (onStyle && prop === 'transition') {
          // (Every string in the value, also in a condition's two branches or a concatenation: a name held in a variable is not read.)
          const strs = []; const collect = (x) => { if (!x || typeof x.type !== 'string') return; const str = strOf(x); if (str != null) { strs.push(str); return; } for (const k of ['test', 'consequent', 'alternate', 'left', 'right', 'expressions']) for (const c of [].concat(x[k] ?? [])) collect(c); };
          collect(n.right);
          const v = strs.join(', ');
          for (const { prop: p, part } of transitionProps(v)) { if (isPaintProp(p)) push('paintAnim', file, n.loc.start.line, label(enclosing(n)), `style.transition = ${part}`); if (LAYOUT_PROPS.has(p)) push('layoutAnim', file, n.loc.start.line, label(enclosing(n)), `style.transition = ${part}`); }
        }
      }
      // ---- Dynamic dispatch (2 Nov 2026): registries, what is stored in them, and calls through them ----
      {
        const f0 = enclosing(n);
        const note = (map, k, v) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };
        // (An alias is the name of a local that holds a registry's element: it holds in the function that declares it and the ones nested in
        // it, never in the whole file. Kept by scope, 2 Nov 2026: `r.toFixed()` in one function was taken for a call of every callback in
        // the file's registries because another function had a `(r) =>` over one.)
        const aliasKey = (fn, name) => `${fn ? scopeId(fn) : 0}|${name}`;
        // (A name declared in a nearer function hides the alias of the same name further out: its own `const r` is not the outer loop's r.)
        const patIds = (pt, out = []) => { if (!pt) return out; if (pt.type === 'Identifier') out.push(pt.name); else if (pt.type === 'ArrayPattern') pt.elements.forEach((e) => patIds(e, out)); else if (pt.type === 'ObjectPattern') pt.properties.forEach((q) => patIds(q.value || q.argument, out)); else if (pt.type === 'AssignmentPattern') patIds(pt.left, out); else if (pt.type === 'RestElement') patIds(pt.argument, out); return out; };
        if (n.type === 'VariableDeclarator') for (const nm of patIds(n.id)) (mod.declared ||= new Set()).add(aliasKey(f0, nm));
        if (isFn(n)) for (const pm of n.params) for (const nm of patIds(pm)) (mod.declared ||= new Set()).add(aliasKey(n, nm));
        const isVal = (v) => v && (isFn(v) || v.type === 'Identifier' || (v.type === 'MemberExpression' && !v.computed));
        // a registry is kept under a local key and, when it is a property of some object, a global one (another file may store into it)
        const store = (R, v, viaMember, at) => {
          if (!R || !isVal(v)) return;
          for (const key of viaMember ? [`${file}:${R}`, `*:${R}`] : [`${file}:${R}`]) mod.regs.push({ key, v, at });
        };
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && !isFn(n.init)) {
          const i = n.init;
          if ((i.type === 'MemberExpression' && i.computed) || (i.type === 'CallExpression' && i.callee.type === 'MemberExpression' && i.callee.property.name === 'get') || (i.type === 'ChainExpression')) { const R = baseName(i); if (R) note(mod.alias, aliasKey(f0, n.id.name), R); }
          if (i.type === 'ObjectExpression') for (const pr of i.properties) if (pr.type === 'Property') store(n.id.name, pr.value, false, f0);
          if (i.type === 'ArrayExpression') for (const el of i.elements) store(n.id.name, el, false, f0);
          if (i.type === 'NewExpression' && /^(Map|Set)$/.test(i.callee.name || '') && i.arguments[0]?.type === 'ArrayExpression') for (const el of i.arguments[0].elements) { if (el?.type === 'ArrayExpression') for (const e2 of el.elements) store(n.id.name, e2, false, f0); else store(n.id.name, el, false, f0); }
        }
        if (n.type === 'ForOfStatement' || n.type === 'ForInStatement') {
          const d = n.left.type === 'VariableDeclaration' ? n.left.declarations[0]?.id : n.left;
          const R = baseName(n.right);
          if (R && d) for (const id of d.type === 'ArrayPattern' ? d.elements : [d]) if (id?.type === 'Identifier') note(mod.alias, aliasKey(f0, id.name), R);
        }
        if (n.type === 'CallExpression') {
          const c = n.callee, cn0 = calleeName(n);
          // callbacks of forEach/map/... over a registry
          if (c.type === 'MemberExpression' && !c.computed && /^(forEach|map|some|every|find|filter)$/.test(c.property.name) && isFn(n.arguments[0])) {
            const R = baseName(c.object);
            if (R) for (const pm of n.arguments[0].params) { const id = pm.type === 'ArrayPattern' ? pm.elements[pm.elements.length - 1] : pm; if (id?.type === 'Identifier') note(mod.alias, aliasKey(n.arguments[0], id.name), R); }
          }
          // calls through a registry: X[k](…), l[i](…), cb(…) over a list, X.get(k)(…)
          let R = null;
          if (c.type === 'MemberExpression' && c.computed) R = baseName(c.object);
          else if (c.type === 'Identifier') R = c.name;
          else if (c.type === 'CallExpression' && c.callee.type === 'MemberExpression' && c.callee.property.name === 'get') R = baseName(c.callee.object);
          else if (c.type === 'ChainExpression') R = baseName(c.expression);
          if (R && f0) (f0.__disp ||= new Set()).add(R);
          // a method called on an element of a registry (for (const t of tops) t.draw(): an object stored in a registry, its functions are
          // the callbacks; only a name that is an alias of a registry counts, never the registry's own name: tops.indexOf(t) calls nothing in it)
          if (!R && f0 && c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier') (f0.__dispM ||= new Set()).add(c.object.name);
          // stores into a registry
          if (c.type === 'MemberExpression' && !c.computed && /^(push|unshift|add|set)$/.test(c.property.name)) {
            const RR = baseName(c.object), viaMember = c.object.type === 'MemberExpression' || c.object.type === 'CallExpression';
            for (const a of n.arguments) store(RR, a, viaMember, f0);
          }
        }
        if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.operator === '=') {
          const o = n.left.object;
          store(baseName(o), n.right, o.type === 'MemberExpression' || o.type === 'CallExpression', f0);
        }
      }
      // ---- Style and element properties written through a computed name (el.style[k] = v) ----
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.computed) {
        const obj = n.left.object, f1 = enclosing(n), key = strOf(n.left.property);
        const onStyle = obj.type === 'MemberExpression' && !obj.computed && obj.property.name === 'style';
        const onData = obj.type === 'MemberExpression' && !obj.computed && obj.property.name === 'dataset';
        if (onStyle && key != null) mod.late.push([styleKeyCat(key), n, f1, `style['${key}'] =`]);
        else if (onStyle) mod.late.push(['varWrite', n, f1, 'style[<dynamic name>] =']);
        else if (onData) mod.late.push(['attrWrite', n, f1, 'dataset[<name>] =']);
        else if (key != null && /^(textContent|innerHTML|innerText|outerHTML|className)$/.test(key)) mod.late.push(['domWrite', n, f1, `['${key}'] =`]);
        else if (key != null && /^(nodeValue|data|hidden|disabled|value|checked|src|href)$/.test(key)) mod.late.push(['attrWrite', n, f1, `['${key}'] =`]);
      }
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'Object' && n.callee.property.name === 'assign') {
        const t0 = n.arguments[0], src0 = n.arguments[1];
        if (t0?.type === 'MemberExpression' && !t0.computed && t0.property.name === 'style') {
          const f1 = enclosing(n);
          if (src0?.type === 'ObjectExpression' && src0.properties.every((pr) => pr.type === 'Property' && !pr.computed)) {
            // (One hit per call, of the heaviest kind among its keys.)
            const keys = [...new Set(src0.properties.map((pr) => String(pr.key.name ?? pr.key.value)))], cats = keys.map(styleKeyCat);
            mod.late.push([['layoutWrite', 'paintWrite', 'varWrite'].find((c) => cats.includes(c)) || 'varWrite', n, f1, `Object.assign(style, { ${keys.join(', ')} })`]);
          }
          else mod.late.push(['varWrite', n, f1, 'Object.assign(style, <dynamic>)']);
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
    // A receiver taken from a local getter that returns an object an imported factory made (const g = glNow(), where glNow returns gl and
    // gl = createVeinsGL(…)) is that factory's object too: g.draw(…) reaches its draw, as gl.draw(…) does (2 Nov 2026: moving the creation
    // out of the frame path had dropped the vessel layer's own per-frame methods, which only the creating function's reach had counted).
    visit(ast, null, (n) => {
      if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || n.init?.type !== 'CallExpression' || n.init.callee.type !== 'Identifier') return;
      for (const g of mod.byName?.get(n.init.callee.name) || []) {
        if (g.type !== 'FunctionDeclaration' && g.parent?.type !== 'VariableDeclarator') continue;
        visit(g.body, g, (r) => {
          if (r.type !== 'ReturnStatement' || r.argument?.type !== 'Identifier' || enclosing(r) !== g) return;
          const o = mod.origins.get(r.argument.name);
          if (o && !mod.origins.has(n.id.name)) mod.origins.set(n.id.name, o);
        });
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
  // A name that holds a plain object where it is used: every declaration of it in the nearest function that declares it, and every assignment
  // to it made inside that function, gives an object literal or an item of a table (R = regions[key] = { … }), and at least one an object literal.
  const isPlainObject = (mod, name, at, depth = 0) => {
    const ds = mod.shapes.get(name);
    if (!ds || depth > 4) return false;
    const chain = [...chainOf(at), null];
    let scope, found = false;
    for (const sc of chain) if (ds.some((d) => !d.assigned && d.scope === sc)) { scope = sc; found = true; break; }
    if (!found) return false;
    const inside = (d) => d.scope === scope || scope === null || chainOf(d.scope).includes(scope);
    const mine = ds.filter((d) => (d.assigned ? inside(d) : d.scope === scope));
    let obj = false;
    for (const d of mine) {
      if (d.k === 'obj') obj = true;
      else if (d.k === 'elem') continue;
      else if (d.k === 'other' || d.k === name) return false;
      else if (isPlainObject(mod, d.k, d.scope, depth + 1)) obj = true;
      else return false;
    }
    return obj;
  };
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
    // (Not the function bindings of that name: a name bound to a function that is not in scope here is another variable of the same name, a
    // panel or an el handed to a function, not a call of that function, 2 Nov 2026: presenter's cardIn(panel, …) is not wallsVisual's panel arrow.)
    return (mod.byName?.get(name) || []).filter((g) => declKind(g) !== 'binding').map((g) => [mod, g]);
  }
  // A member call: the file's methods of that name and the functions it exposes under that name; none on a built-in receiver.
  // (Conservative: an unknown receiver may be any of them, so every one is followed.)
  function resolveCall(mod, call) {
    if (!call.member) return resolveBare(mod, call.name, call.at);
    if (call.recv && call.recv !== 'this' && mod.containers.has(call.recv)) return [];
    // (A receiver that is a built-in value where the call is made: the innermost function around it that declares the name decides.)
    if (call.recv && call.recv !== 'this' && mod.decls.has(call.recv)) {
      const ds = mod.decls.get(call.recv);
      for (const sc of [...chainOf(call.at), null]) {
        const here = ds.filter((d) => d.scope === sc);
        if (here.length) { if (here.every((d) => d.kind === true || (typeof d.kind === 'string' && mod.containers.has(d.kind)))) return []; break; }
      }
    }
    const out =(mod.byName?.get(call.name) || []).filter((g) => declKind(g) === 'method').map((g) => [mod, g]);
    for (const nm of mod.exposed.get(call.name) || []) for (const g of mod.byName?.get(nm) || []) if (declKind(g) === 'binding') out.push([mod, g]);
    // (The receiver may be an object an imported module made: ui.zoom = createCardZoom(…), or named for the factory, stage for
    // createStage. That module's methods of the name are followed too.)
    // (Or an object imported by name, store.on(…) with store from './store.js': that module's methods of the name, 2 Nov 2026.)
    const imp = call.recv && mod.imports.get(call.recv);
    // (Not when the binding is a built-in container there, export const shownVel = new Map(): its .set is the Map's, not a method of the module.)
    if (imp && mods.get(imp[0]) && !mods.get(imp[0]).containers.has(mods.get(imp[0]).exports.get(imp[1]) ?? imp[1])) {
      const m = mods.get(imp[0]);
      for (const g of m.byName?.get(call.name) || []) if (declKind(g) === 'method') out.push([m, g]);
    }
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
  // ---- Registries (dynamic dispatch, 2 Nov 2026): what each one holds, filled by direct stores and through functions that keep their argument ----
  const regs = new Map();     // registry key -> Map(fn key -> [mod, fn])
  const sinks = new Map();    // fn -> [{ key, idx }]: a function that stores its idx-th parameter into the registry `key`
  const addReg = (key, m, g) => { if (!regs.has(key)) regs.set(key, new Map()); const k = `${m.file}#${g.__key}`; if (regs.get(key).has(k)) return false; regs.get(key).set(k, [m, g]); return true; };
  const addSink = (g, key, idx) => { if (!sinks.has(g)) sinks.set(g, []); if (sinks.get(g).some((x) => x.key === key && x.idx === idx)) return false; sinks.get(g).push({ key, idx }); return true; };
  const targetsOf = (mod, v, at) => v.type === 'Identifier' ? resolveBare(mod, v.name, at) : isFn(v) ? [[mod, v]]
    : v.type === 'MemberExpression' && !v.computed ? resolveCall(mod, { member: true, name: v.property.name, recv: v.object.type === 'ThisExpression' ? 'this' : v.object.name, at }) : [];
  const paramOf = (v, at) => { if (v.type !== 'Identifier') return null; for (const e of chainOf(at)) { const i = paramIndex(e, v.name); if (i >= 0) return [e, i]; } return null; };
  function fillRegistries() {
    for (let changed = true, round = 0; changed && round < 12; round++) {
      changed = false;
      for (const mod of mods.values()) for (const r of mod.regs) {
        const pm = r.at && paramOf(r.v, r.at);
        if (pm) { changed = addSink(pm[0], r.key, pm[1]) || changed; continue; }
        for (const [m, g] of targetsOf(mod, r.v, r.at)) changed = addReg(r.key, m, g) || changed;
      }
      // (A handler object handed to a method of an object the scan cannot follow back to its module, host.add({ order, prep, draw }) with host a
      // parameter: the methods of that name, in any module, that keep their argument in a registry.)
      const keepers = (call) => {
        if (!call.member || !call.node.arguments.some((a) => a.type === 'ObjectExpression')) return [];
        const out = [];
        for (const m of mods.values()) for (const g of m.byName?.get(call.name) || []) if (declKind(g) === 'method' && sinks.has(g)) out.push([m, g]);
        return out;
      };
      if (sinks.size) for (const mod of mods.values()) for (const call of allCalls(mod)) for (const [, g] of [...resolveCall(mod, call), ...keepers(call)]) for (const sk of sinks.get(g) || []) {
        const arg = call.node.arguments[sk.idx];
        if (!arg) continue;
        const pm = call.at && paramOf(arg, call.at);
        if (pm) changed = addSink(pm[0], sk.key, pm[1]) || changed;
        else if (arg.type === 'ObjectExpression') {
          // (an object handed to a function that keeps it, host.add({ order, prep, draw }): each function it carries is held by the registry)
          for (const pr of arg.properties) if (pr.type === 'Property') for (const [m, h] of targetsOf(mod, pr.value, call.at)) changed = addReg(sk.key, m, h) || changed;
        } else for (const [m, h] of targetsOf(mod, arg, call.at)) changed = addReg(sk.key, m, h) || changed;
      }
    }
  }
  // The callbacks a reached function can run by calling through a registry of its module (or one stored into from elsewhere by property).
  const dispatched = (mod, f) => {
    const out = [];
    const aliasOf = (name) => { const out = new Set(); for (let p = f; ; p = enclosing(p)) { const k = `${p ? scopeId(p) : 0}|${name}`; for (const R of mod.alias.get(k) || []) out.add(R); if (!p || mod.declared?.has(k)) break; } return out; };
    // (A bare call of a name that is a function declared in f or around it is a call of that function: the scan follows it by name, and it is
    // not a call through a registry of that name, which every function stored in any registry of that name would be taken to run: stage.js
    // clampTextBox's a(k), a small arrow, reached every function other files stored under a.)
    const isFnHere = (name) => {
      const ds = mod.decls.get(name);
      if (!ds) return false;
      for (const sc of [...chainOf(f), null]) { const here = ds.filter((d) => d.scope === sc); if (here.length) return here.every((d) => d.kind === FN); }
      return false;
    };
    for (const R0 of f.__disp || []) if (!isFnHere(R0)) for (const R of [R0, ...aliasOf(R0)]) for (const key of [`${mod.file}:${R}`, `*:${R}`]) for (const t of regs.get(key)?.values() || []) out.push(t);
    for (const R0 of f.__dispM || []) for (const R of aliasOf(R0)) for (const key of [`${mod.file}:${R}`, `*:${R}`]) for (const t of regs.get(key)?.values() || []) out.push(t);
    return out;
  };
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
  fillRegistries();
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
  const drain = () => {
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
      for (const [m, g] of dispatched(mod, f)) add(m, g);
    }
  };
  for (const mod of mods.values()) for (const f of mod.seeds) add(mod, f);
  drain();
  // Wide count: timers (setTimeout) are seeds too (resize and intersection observers are not: they report after layout, where a read is clean), but a site only they reach is scored apart (hit.wide), so
  // the gate does not move for them while the honest total shows them.
  const hardKeys = new Set(reach.keys());
  from = null;
  for (const mod of mods.values()) for (const f of mod.softSeeds) add(mod, f);
  drain();
  // Observer reach: from the mutation observers' callbacks the same way, for the layout reads only (2 Nov 2026 review: a read there runs
  // in the microtask straight after the writes, and lays the page out then, as a read in a frame does).
  const obsReach = new Map();
  {
    const frameReach = new Map(reach);
    reach.clear();
    from = null;
    for (const mod of mods.values()) for (const f of mod.obsSeeds) add(mod, f);
    while (queue.length) {
      const [mod, f] = queue.shift();
      from = `${mod.file}#${f.__key}`;
      for (const g of mod.kids?.get(f) || []) {
        const p = g.parent;
        const inline = (p?.type === 'CallExpression' || p?.type === 'NewExpression') && (p.callee === g || p.arguments.includes(g) && !DEFERRED.test(calleeName(p) || p.callee?.name || ''));
        if (inline) add(mod, g);
      }
      for (const call of f.__calls || []) for (const [m, g] of resolveCall(mod, call)) add(m, g);
      for (const [m, g] of dispatched(mod, f)) add(m, g);
    }
    for (const [k, v] of reach) obsReach.set(k, v);
    reach.clear();
    for (const [k, v] of frameReach) reach.set(k, v);
  }
  // ---- Triage of the sites no frame path reaches (2 Nov 2026) ----
  // setup: in code that runs once, at module load or from it, and that nothing run during use calls: not during motion, not off the GPU.
  // use: reached from an event handler, timer, promise, observer or store listener: runs while the app is used, flagged with that reason.
  // neither: no caller found (dead code, or a call the scan cannot follow): flagged, never assumed to be setup.
  const boundOf = (a) => a.type === 'CallExpression' && a.callee.type === 'MemberExpression' && !a.callee.computed && a.callee.property.name === 'bind' && (a.callee.object.type === 'Identifier' || (a.callee.object.type === 'MemberExpression' && !a.callee.object.computed)) ? a.callee.object : null;
  function reachFrom(seeds, withDispatch, byName = false) {
    const r = new Map(), q = [];
    const put = (m, g, fromK) => { const k = `${m.file}#${g.__key}`; if (!r.has(k)) { r.set(k, fromK); q.push([m, g]); } };
    for (const [m, g] of seeds) put(m, g, null);
    while (q.length) {
      const [mod, f] = q.shift(), fk = `${mod.file}#${f.__key}`;
      for (const g of mod.kids?.get(f) || []) {
        const pr = g.parent;
        if ((pr?.type === 'CallExpression' || pr?.type === 'NewExpression') && (pr.callee === g || pr.arguments.includes(g) && !DEFERRED.test(calleeName(pr) || pr.callee?.name || ''))) put(mod, g, fk);
      }
      for (const call of f.__calls || []) {
        for (const [m, g] of resolveCall(mod, call)) put(m, g, fk);
        // (Last resort, for a site that nothing else reaches: a method called on an object the scan cannot follow (a registry entry's
        // make(), a handler object's open()) runs any method of that name in the app. Over-reaches, so it is used only to find who might call.)
        if (byName && call.member) for (const m of mods.values()) for (const g of m.byName?.get(call.name) || []) if (declKind(g) === 'method') put(m, g, fk);
        // (A function handed by name to a call that runs it, refineStep('read', bakeAll): it runs where that call does. Not for a call that
        // keeps it to run later: that function is a seed of its own, with its own kind. Triage only, 2 Nov 2026; the frame reach is unchanged.)
        // (And a bound one, restPass(exitAnims.bind(null, el, go)): the same function, bound.)
        if (!DEFERRED.test(call.name)) for (const a of call.node.arguments) {
          const id = a.type === 'Identifier' ? a : boundOf(a);
          if (id) for (const [m, g] of resolveBare(mod, id.name, call.at)) put(m, g, fk);
          // (Or kept in an options object handed to the call, createDock({ revealDock, onWhy: openWhy }).)
          if (a.type === 'ObjectExpression') for (const pr of a.properties) if (pr.type === 'Property' && pr.value.type === 'Identifier') for (const [m, g] of resolveBare(mod, pr.value.name, call.at)) put(m, g, fk);
        }
      }
      if (withDispatch) for (const [m, g] of dispatched(mod, f)) put(m, g, fk);
    }
    return r;
  }
  const useSeeds = [], seedKind = new Map();
  const addUse = (m, g, kind) => { useSeeds.push([m, g]); const k = `${m.file}#${g.__key}`; if (!seedKind.has(k)) seedKind.set(k, kind); };
  const initSeeds = [];
  for (const mod of mods.values()) {
    for (const g of mod.fns.values()) {
      const pr = g.parent;
      if (pr?.type === 'CallExpression' && pr.arguments.includes(g)) {
        const cn = calleeName(pr) || '';
        if (/^(setTimeout|setInterval|requestIdleCallback|idle|afterMotion|whenQuiet|restPass|queueMicrotask|nextFrame)$/.test(cn)) addUse(mod, g, 'timer or rest pass');
        else if (/^(then|catch|finally)$/.test(cn)) addUse(mod, g, 'promise');
        else if (/Observer$/.test(pr.callee?.name || '')) addUse(mod, g, 'observer');
        else if (cn === 'addEventListener' || cn === 'on' || cn === 'once' || cn === 'subscribe' || cn === 'listen') addUse(mod, g, 'event handler');
        else if (!enclosing(g) && !DEFERRED.test(cn)) initSeeds.push([mod, g]);
      } else if (pr?.type === 'CallExpression' && pr.callee === g && !enclosing(g)) initSeeds.push([mod, g]);
      if (pr?.type === 'AssignmentExpression' && /^on[a-z]+$/.test(pr.left.property?.name || '')) addUse(mod, g, 'event handler');
      // (A closure kept in an array, an object, a returned value or a ternary is run later by whatever holds it, never at module load:
      // ['frame chrome', (f, now) => paintChrome(f, now)], { onClick: () => sendFeedback() }.)
      else if (pr?.type === 'ArrayExpression' || (pr?.type === 'Property' && pr.value === g && !pr.method && pr.parent?.type === 'ObjectExpression') || pr?.type === 'ReturnStatement' || pr?.type === 'ConditionalExpression' || pr?.type === 'LogicalExpression') addUse(mod, g, 'stored callback');
    }
    // (A handler or callback handed in by name: addEventListener('click', onTap), setTimeout(tick, 5), p.then(done), store.on(k, fn).)
    for (const call of allCalls(mod)) {
      const cn = call.name, kind = /^(setTimeout|setInterval|requestIdleCallback|idle|afterMotion|whenQuiet|restPass|queueMicrotask|nextFrame)$/.test(cn) ? 'timer or rest pass' : /^(then|catch|finally)$/.test(cn) ? 'promise'
        : /^(addEventListener|on|once|subscribe|listen)$/.test(cn) ? 'event handler' : /^(ResizeObserver|IntersectionObserver|MutationObserver|PerformanceObserver)$/.test(call.node.callee?.name || '') ? 'observer' : null;
      if (kind) for (const a0 of call.node.arguments) { const a = boundOf(a0) || a0; if (a.type === 'Identifier' || (a.type === 'MemberExpression' && !a.computed)) for (const [m, g] of targetsOf(mod, a, call.at)) addUse(m, g, kind); }
    }
    for (const g of mod.obsSeeds) addUse(mod, g, 'observer');
    for (const { arg, at } of mod.newObs || []) {
      if (!arg) continue;
      if (isFn(arg)) addUse(mod, arg, 'observer');
      else if (arg.type === 'Identifier' || (arg.type === 'MemberExpression' && !arg.computed)) for (const [m, g] of targetsOf(mod, arg, at)) addUse(m, g, 'observer');
    }
    for (const { rel, viaLazy } of mod.dynImports || []) {
      const m = mods.get(rel);
      if (m) for (const [name, local] of m.exports) for (const [mm, g] of resolveBare(m, local, null)) {
        if (viaLazy) addUse(mm, g, `lazy module ${rel.replace(/^src\/ui\//, '')} (made when first wanted), export ${name}`);
        else initSeeds.push([mm, g]);
      }
    }
    for (const call of mod.top) for (const [m, g] of resolveCall(mod, call)) initSeeds.push([m, g]);
  }
  for (const m of mods.values()) for (const g of m.seeds) addUse(m, g, 'motion handler');   // (a hit proper where it reaches)
  for (const [key, set] of regs) { const file = key.slice(0, key.indexOf(':')); for (const [m, g] of set.values()) addUse(m, g, 'store or registry listener'); void file; }
  for (const mod of mods.values()) for (const [v, at] of mod.motionProps) for (const [m, g] of targetsOf(mod, v, at)) addUse(m, g, 'motion handler');
  const useReach = reachFrom(useSeeds, true), initReach = reachFrom(initSeeds, false);
  const useByName = reachFrom(useSeeds, true, true), initByName = reachFrom(initSeeds, false, true);
  const rootKindOf = (k) => { let guard = 0; while (guard++ < 200 && useReach.get(k)) k = useReach.get(k); return seedKind.get(k) || 'event or timer'; };
  const chainKey = (R, mod, f) => { for (let p = f; p; p = enclosing(p)) if (R.has(`${mod.file}#${p.__key}`)) return `${mod.file}#${p.__key}`; return null; };
  const rootKindOf2 = (k) => { let guard = 0; while (guard++ < 200 && useByName.get(k)) k = useByName.get(k); return seedKind.get(k) || 'event or timer'; };
  const setupLines = new Set(), setupList = [];
  const allocAt = new Map();
  const rareList = [];
  const RARE = /\/\/\s*alloc-(?:rare|once):\s*(\S.*?)\s*$/;   // (alloc-once is an alias of alloc-rare)
  const rareReason = (mod, line) => {
    const L = (mod.lines ||= mod.text.split('\n'));
    const same = RARE.exec(L[line - 1] || '');
    if (same) return same[1];
    const above = L[line - 2] || '';
    return /^\s*\/\//.test(above) ? RARE.exec(above)?.[1] || '' : '';
  };
  for (const mod of mods.values()) for (const [cat0, n, f, detail] of mod.late) {
    // (A property named like an element's (data, value, src, hidden…) set on a plain object is not a write to the page, 2 Nov 2026: lobule-zoom's o.data = …, sinusoid-view's R.value = ….)
    if (cat0 === 'attrWrite' && /^\.(nodeValue|data|hidden|disabled|value|checked|src|href) =$/.test(detail) && n.type === 'AssignmentExpression' && n.left.object?.type === 'Identifier' && isPlainObject(mod, n.left.object.name, f)) continue;
    let cat = cat0;
    if (cat !== 'alloc') look(cat, mod.file, n.loc.start.line);   // (an allocation is a site only where a frame reaches it)
    let hit = null, wide = /^(classList\.|\.className)/.test(detail);
    for (let p = f; p && !hit; p = enclosing(p)) if (hardKeys.has(`${mod.file}#${p.__key}`)) hit = `${mod.file}#${p.__key}`;
    if (!hit) for (let p = f; p && !hit; p = enclosing(p)) if (reach.has(`${mod.file}#${p.__key}`)) { hit = `${mod.file}#${p.__key}`; wide = true; }
    if (!hit && cat === 'layoutRead') {
      for (let p = f; p && !hit; p = enclosing(p)) if (obsReach.has(`${mod.file}#${p.__key}`)) hit = `${mod.file}#${p.__key}`;
      if (hit) cat = 'observerRead';
    }
    if (!hit && cat === 'alloc') continue;   // (not on a frame path: allocating there is no cost to a frame)
    if (cat === 'alloc') {
      // (Triage, 2 Nov 2026: a line carrying `// alloc-rare: <reason>`, or directly under a comment-only line that does, allocates only
      // on a branch that never runs per frame (first use, a changed key, a resize, a context loss). It leaves the count and is listed
      // with its reason in out.rare and in the inventory. A marker with no reason does not count.)
      const rl = n.loc.start.line, why = rareReason(mod, rl);
      if (why) { rareList.push({ cat: 'alloc', file: mod.file, line: rl, col: n.loc.start.column, start: n.start, end: n.end, fn: label(f), detail: `${detail} — rare: ${why}` }); continue; }
    }
    if (!hit) {
      // (Looked at above, so it would be credited as on the GPU. No frame path reaches it, so it is triaged, never assumed fine, 2 Nov 2026.)
      let useKey = null;
      for (let p = f; p && !useKey; p = enclosing(p)) if (useReach.has(`${mod.file}#${p.__key}`)) useKey = `${mod.file}#${p.__key}`;
      if (useKey) {
        push('unreached', mod.file, n.loc.start.line, label(f), `${cat0}: ${detail} — runs during use (${rootKindOf(useKey)})`);
        hits[hits.length - 1].why = 'use';
      } else if (!f || initReach.has(`${mod.file}#${f.__key}`)) {
        setupLines.add(`${mod.file}:${n.loc.start.line}`);
        setupList.push({ cat: cat0, file: mod.file, line: n.loc.start.line, fn: label(f), detail: `${detail} — setup: runs once at load or boot, no event, timer or frame calls it`, owner: ownerOf(mod.file, cat0, label(f)) });
      } else if ((useKey = chainKey(useByName, mod, f))) {
        push('unreached', mod.file, n.loc.start.line, label(f), `${cat0}: ${detail} — runs during use (a method of this name is called from ${rootKindOf2(useKey)})`);
        hits[hits.length - 1].why = 'use';
      } else if (chainKey(initByName, mod, f)) {
        setupLines.add(`${mod.file}:${n.loc.start.line}`);
        setupList.push({ cat: cat0, file: mod.file, line: n.loc.start.line, fn: label(f), detail: `${detail} — setup: called by method name from code that runs once at load or boot only`, owner: ownerOf(mod.file, cat0, label(f)) });
      } else {
        push('unreached', mod.file, n.loc.start.line, label(f), `${cat0}: ${detail} — no caller found (dead code, or a call the scan cannot follow)`);
        hits[hits.length - 1].why = 'unresolved';
      }
      continue;
    }
    const R = cat === 'observerRead' ? obsReach : reach;
    // How a frame reaches it: the chain of calls back to the frame callback or motion listener (shortened).
    const chain = [];
    for (let k = hit; k && chain.length < 8; k = R.get(k)) chain.push(k.split('#')[0] === mod.file ? k.split('#')[1] : k.replace(/^src\/ui\//, ''));
    if (cat === 'alloc') {
      // (One hit per line; its kinds listed together.)
      const k = `${mod.file}:${n.loc.start.line}`;
      const prev = allocAt.get(k);
      if (prev) { if (!prev.kinds.includes(detail)) prev.kinds.push(detail); if (!wide) prev.hit.wide = false; continue; }
      push(cat, mod.file, n.loc.start.line, label(f), '');
      const rec = { hit: hits[hits.length - 1], kinds: [detail], path: chain.reverse().join(' → ') };
      rec.hit.wide = wide;
      allocAt.set(k, rec);
      continue;
    }
    push(cat, mod.file, n.loc.start.line, label(f), `${detail} — ${cat === 'observerRead' ? 'observer' : 'frame'} path: ${chain.reverse().join(' → ')}`);
    if (wide) hits[hits.length - 1].wide = true;
  }
  for (const { hit, kinds, path } of allocAt.values()) hit.detail = `${kinds.join(', ')} — frame path: ${path}`.slice(0, 260);
  // One hit per place: a line can match twice (a string scanned as CSS and as a declaration).
  const seen = new Set();
  const out = hits.filter((h) => { const k = `${h.cat}|${h.file}|${h.line}|${h.detail}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.cat.localeCompare(b.cat));
  const hitLines = new Set(out.map((h) => `${h.file}:${h.line}`));
  // (Setup sites leave the count altogether, on neither side, and are listed in out.setup and in the inventory.)
  const onGpu = [...sites].filter((k) => !hitLines.has(k) && !setupLines.has(k)).length;
  out.onGpu = onGpu; out.sites = onGpu + out.length;
  const seenS = new Set();
  out.setup = setupList.filter((h) => { const k = `${h.cat}|${h.file}|${h.line}|${h.detail}`; if (seenS.has(k) || hitLines.has(`${h.file}:${h.line}`)) return false; seenS.add(k); return true; })
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  { const seenR = new Set(); out.rare = rareList.filter((h) => { const k = `${h.file}:${h.line}`; if (seenR.has(k) || hitLines.has(k)) return false; seenR.add(k); return true; }).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line); }
  out.wide = out.filter((h) => h.wide).length;   // class writes and timer/observer paths: in the honest total, not in the gate
  return out;
}
// Layout reads outside the one place (plan "Holding 120 Hz, always", 3.4): the page's geometry is asked of the browser only in
// src/ui/layout-snap.js (its read* functions), so every read can be counted by where it happens and the snapshot can hold what the app
// asks for most. A direct read anywhere else (getBoundingClientRect, getBBox, getComputedStyle, getScreenCTM, offset*, client*, scroll*,
// getTotalLength, getPointAtLength, elementFromPoint and the rest below) fails the scan once its file has more of them than its
// allowance in scripts/layout-read-allowance.json; the allowances are the reads still to move and may only go down (a file with fewer
// than allowed fails too, until its allowance is lowered to match). A file not listed is allowed none.
export const SNAPSHOT_FILE = 'src/ui/layout-snap.js';
const DIRECT_READ = new RegExp([
  String.raw`\.(?:getBoundingClientRect|getClientRects|getBBox|getScreenCTM|getCTM|getTotalLength|getPointAtLength|getAnimations|getComputedTiming|checkVisibility|isPointInStroke|isPointInFill|scrollIntoView)\s*(?:\?\.)?\(`,
  String.raw`(?<![\w.])(?:window\.|globalThis\.)?getComputedStyle\s*\(`,
  String.raw`\bdocument\.elements?FromPoint\s*\(`,
  String.raw`\.(?:offsetWidth|offsetHeight|offsetTop|offsetLeft|offsetParent|clientWidth|clientHeight|clientTop|clientLeft|scrollWidth|scrollHeight|scrollTop|scrollLeft|innerText)\b(?!\s*=(?!=))`,
].join('|'), 'g');
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
export function directReads({ root = ROOT } = {}) {
  const out = {};
  for (const p of walk(join(root, 'src'))) {
    const f = relative(root, p).split('\\').join('/');
    if (!f.endsWith('.js') || f === SNAPSHOT_FILE) continue;
    const n = stripComments(readFileSync(p, 'utf8')).match(DIRECT_READ)?.length || 0;
    if (n) out[f] = n;
  }
  return out;
}
export function readAllowance({ root = ROOT } = {}) {
  try { return JSON.parse(readFileSync(join(root, 'scripts/layout-read-allowance.json'), 'utf8')).files || {}; } catch { return {}; }
}
// Files over their allowance (a read added outside the snapshot) and under it (a read moved: lower the allowance).
// (The stage family — stage.js and every stage-*.js part — shares one allowance, listed as src/ui/stage.js: a read moved into a part stays counted.)
const stageFam = (o) => { const r = {}; for (const [f, n] of Object.entries(o)) { const k = /^src\/ui\/stage(-.+)?\.js$/.test(f) ? 'src/ui/stage.js' : f; r[k] = (r[k] || 0) + n; } return r; };
export function readRatchet(found = directReads(), allowed = readAllowance()) {
  found = stageFam(found); allowed = stageFam(allowed);
  const over = [], under = [];
  for (const [f, n] of Object.entries(found)) if (n > (allowed[f] || 0)) over.push(`${f}: ${n} direct layout reads, ${allowed[f] || 0} allowed`);
  for (const [f, n] of Object.entries(allowed)) if ((found[f] || 0) < n) under.push(`${f}: ${found[f] || 0} direct layout reads, ${n} allowed (lower its allowance)`);
  return { over, under, total: Object.values(found).reduce((a, b) => a + b, 0) };
}

// The score (owner, 2 Nov 2026: "No need to 95% gate but we need to get to 100% stat"): no percentage blocks anything. The number is the
// HONEST share, every site counted, class writes and timer/observer paths included (the old gate left those out and read 99% where the
// honest scan reads 76%). The scan stays as strict as ever, every hit is listed, and the target is 100%: nothing off.
export const TARGET_PCT = 100;
export const honestPct = (hits) => (hits.sites ? Math.floor(100 * hits.onGpu / hits.sites) : 100);
export const split = (hits) => { const u = (w) => hits.filter((h) => h.why === w).length; return { frame: hits.filter((h) => h.cat !== 'unreached').length, use: u('use'), unresolved: u('unresolved'), setup: hits.setup?.length || 0 }; };
// Sites reached only from an event, timer, rest pass, promise, observer or store listener (never from a frame or a motion handler), told apart
// from the honest total, which counts them all and is what the gate and the goal use: shown as their own line so the per-frame work stands out
// (2 Nov 2026). Nothing is left out of the honest figure; a site a frame or motion path reaches is never in this line.
export const eventOnly = (hits) => {
  const kinds = {};
  let n = 0;
  for (const h of hits) if (h.cat === 'unreached' && h.why === 'use') { n++; const k = /\(([^)]*)\)$/.exec(h.detail)?.[1] || 'event or timer'; kinds[k] = (kinds[k] || 0) + 1; }
  return { n, kinds };
};
const eventLine = (hits) => {
  const { n, kinds } = eventOnly(hits), per = hits.sites - n;
  return `; per-frame view (event-only sites set aside): ${hits.onGpu}/${per} on GPU (${per ? Math.floor(100 * hits.onGpu / per) : 100}%), ${n} event-only sites listed apart (${Object.entries(kinds).sort((x, y) => y[1] - x[1]).map(([k, c]) => `${k} ${c}`).join(', ') || 'none'})`;
};
// The garbage the frame functions make once V8 has compiled them (scripts/warm-alloc.mjs: the page's frame functions run thousands of times in
// node, then measured). The static scan above counts the sites that can allocate; this counts what they do, so a site that never allocates when
// compiled is not a problem and one the scan cannot see (an array turned into heap numbers by a shared helper) shows. Limits: scripts/warm-alloc-limits.json.
export function warmGarbage() {
  if (process.env.OFFGPU_NO_WARM) return null;
  const r = spawnSync(process.execPath, ['--expose-gc', '--max-semi-space-size=128', join(ROOT, 'scripts/warm-alloc.mjs'), '--json'], { encoding: 'utf8', timeout: 120000 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return null; }
}
export const warmLine = (rs) => {
  const total = rs.reduce((a, r) => a + (r.bytes || 0), 0), bad = rs.filter((r) => r.error || (r.limit != null && r.bytes > r.limit));
  return `**Warm garbage: ${total} B/frame over ${rs.length} frame functions** (compiled, in node; \`npm run warm\`)${bad.length ? `, over their limit or failed: ${bad.map((r) => esc(r.name)).join('; ')}` : ', all within their limits'}. ${rs.map((r) => `${esc(r.name)} ${r.error ? 'failed' : `${r.bytes} B`}`).join('; ')}.`;
};
export const score = (hits) => { const x = split(hits); return `${hits.onGpu}/${hits.sites} on GPU (${honestPct(hits)}% honest, counting ${hits.wide || 0} class-write and timer/observer sites; target ${TARGET_PCT}%), ${hits.length} off: frame path ${x.frame}, during use ${x.use}, no caller found ${x.unresolved}; ${x.setup} setup sites left out of the count and listed; ${hits.rare?.length || 0} tagged run-once/rare allocations (// alloc-rare: reason) also left out, listed with their reasons${eventLine(hits)}`; };

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\n/g, ' ');
export function inventory(hits, { commit = '', warm = null } = {}) {
  const byCat = Object.fromEntries(Object.keys(CATS).map((c) => [c, 0]));
  const byOwner = {};
  for (const h of hits) { byCat[h.cat]++; byOwner[h.owner] = (byOwner[h.owner] || 0) + 1; }
  const L = [];
  L.push('# Off-GPU inventory', '');
  L.push('**GPU 100% target: every site below ticked off, nothing off the GPU.**', '');
  L.push('Generated by `node scripts/off-gpu-scan.mjs --doc` (`npm run offgpu`); do not edit by hand. The checklist at the end is regenerated from the scan, so a site leaves it when it moves to the GPU.',
    'No percentage blocks a push or a deploy; the honest score is printed and the target is 100%. What each category means is at the top of the script.', '');
  L.push(`**${score(hits)}**${commit ? ` at \`${commit}\`` : ''}.`, '');
  if (warm) L.push(warmLine(warm), '');
  L.push('| Category | Count |', '|---|---|');
  for (const [c, n] of Object.entries(byCat)) L.push(`| ${CATS[c]} (\`${c}\`) | ${n} |`);
  L.push('', '| Owning thread | Count |', '|---|---|');
  for (const [o, n] of Object.entries(byOwner).sort((a, b) => b[1] - a[1])) L.push(`| ${esc(o)} | ${n} |`);
  L.push('', '## Every hit', '', '| File:line | Category | Function | What | Owner |', '|---|---|---|---|---|');
  for (const h of hits) L.push(`| ${h.file}:${h.line} | ${h.cat} | ${esc(h.fn)} | ${esc(h.detail)} | ${esc(h.owner)} |`);
  if (hits.setup?.length) {
    const sf = {};
    for (const h of hits.setup) sf[h.file] = (sf[h.file] || 0) + 1;
    L.push('', `## Setup sites (${hits.setup.length}), left out of the count`, '', 'Code that runs once at module load or boot and that no event, timer, listener or frame calls. Listed in full so nothing is hidden; a site leaves this list (and returns to the count) when anything run during use calls it.', '',
      `Per file: ${Object.entries(sf).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}`, '', '| File:line | Category | Function | What |', '|---|---|---|---|');
    for (const h of hits.setup) L.push(`| ${h.file}:${h.line} | ${h.cat} | ${esc(h.fn)} | ${esc(h.detail)} |`);
  }
  if (hits.rare?.length) {
    L.push('', `## Rare-branch allocations (${hits.rare.length}), left out of the count`, '', 'Allocations a frame path reaches only on a branch that never runs per frame (first use, a changed key, a resize, a context loss), marked `// alloc-rare: <reason>` in the source. Listed in full with the reason; a marker without a reason does not count.', '', '| File:line | Function | What |', '|---|---|---|');
    for (const h of hits.rare) L.push(`| ${h.file}:${h.line} | ${esc(h.fn)} | ${esc(h.detail)} |`);
  }
  L.push('', '## GPU 100% target: checklist', '', `Still off the GPU: ${hits.length}. Grouped by kind, then file; tick a box by moving the site to the GPU (the scan drops it on the next regeneration).`);
  const kinds = {};
  for (const h of hits) ((kinds[h.cat] ||= {})[h.file] ||= []).push(h);
  for (const c of Object.keys(CATS)) {
    if (!kinds[c]) continue;
    L.push('', `### ${CATS[c]} (\`${c}\`): ${Object.values(kinds[c]).reduce((n, a) => n + a.length, 0)}`);
    for (const [f, hs] of Object.entries(kinds[c]).sort()) {
      L.push('', `**${f}** (${hs.length})`);
      for (const h of hs) L.push(`- [ ] line ${h.line}, ${esc(h.fn)}: ${esc(h.detail).slice(0, 110)}`);
    }
  }
  return L.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const hits = scan();
  if (args.has('--json')) { console.log(JSON.stringify(hits, null, 1)); process.exit(0); }
  const warm = args.has('--doc') ? warmGarbage() : null;
  if (warm) console.error(`warm garbage: ${warmLine(warm).replace(/\*\*|`/g, '')}`);
  if (args.has('--doc')) writeFileSync(join(ROOT, 'docs/off-gpu-inventory.md'), inventory(hits, { commit: process.env.GITHUB_SHA?.slice(0, 8) || '', warm }));
  if (args.has('--summary') && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, inventory(hits, { commit: process.env.GITHUB_SHA?.slice(0, 8) || '' }));
  const rr = readRatchet();
  for (const l of [...rr.over, ...rr.under]) console.error(`layout reads: ${l}`);
  console.error(`layout reads: ${rr.total} direct reads left outside ${SNAPSHOT_FILE}${rr.over.length || rr.under.length ? ': off its allowance (scripts/layout-read-allowance.json), reported only' : ', none over its allowance'}.`);
  const byCat = {};
  for (const h of hits) byCat[h.cat] = (byCat[h.cat] || 0) + 1;
  if (!hits.length) { console.log(`off-gpu: ${score(hits)}. Nothing off the GPU.`); process.exit(0); }
  for (const h of hits) console.error(`${h.file}:${h.line}  ${h.cat}  ${h.fn}  ${h.detail}  [${h.owner}]`);
  console.error(`\noff-gpu: ${score(hits)} (${Object.entries(byCat).map(([c, n]) => `${c} ${n}`).join(', ')}). The goal is 0; see docs/off-gpu-inventory.md.`);
  console.error(`off-gpu: ${honestPct(hits)}% on the GPU, target ${TARGET_PCT}%: reported only, no percentage blocks.`);
  // Report only (owner, 4 Nov 2026: the scan kept the deploy checks red): nothing here fails a run.
  process.exit(0);
}
