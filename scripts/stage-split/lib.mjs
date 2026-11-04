// The stage-split move tool's core (docs/stage-split plan, section 2.4): cut named top-level statements out of createStage() into a
// factory file, by syntax tree, and say why when the cut is not clean. Pure: strings in, strings out (move.mjs does the files).
//
//   planSplit(src, spec) -> { ok, refusals, stage, part, report }
//   spec = { factory: 'createScan', file: 'stage-scan.js', about: '…', names: ['scanTick', …], stay: ['x'], also: ['first line of an effectful statement'] }
//
// A moved statement keeps its text byte for byte, except that a reference to a shared `let` (one that stays in stage.js) reads live.x. Consts and
// functions the part reads are handed over once through `st`; a `let` is never copied (that is the rule that keeps labels on the figure).
import { parse } from 'espree';
import { analyze } from 'eslint-scope';
import estraverse from 'estraverse';

export const STUB_MARK = '// <stage-split stub>';
export const MARK_A = '// <stage-split live>', MARK_B = '// </stage-split live>';

const parseSrc = (src) => parse(src, { ecmaVersion: 'latest', sourceType: 'module', range: true, loc: true, comment: true });

function annotate(ast) {
  estraverse.traverse(ast, { fallback: 'iteration', enter(n, parent) { n.parent = parent; } });
}
const isFn = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

export function findStage(ast, name = 'createStage') {
  for (const n of ast.body) {
    const d = n.type === 'ExportNamedDeclaration' ? n.declaration : n;
    if (d?.type === 'FunctionDeclaration' && d.id.name === name) return d;
  }
  throw new Error(`${name} not found`);
}

// One top-level statement's text range, taking the comments above it (after the previous statement's line) and a same-line trailing comment.
function unitRanges(src, ast, body) {
  const lineEnd = (pos) => { const i = src.indexOf('\n', pos); return i < 0 ? src.length : i; };
  const commentsAfter = (end) => ast.comments.filter((c) => c.range[0] >= end && c.range[0] < lineEnd(end) && src.slice(end, c.range[0]).trim() === '' );
  const trailEnd = (n) => { let e = n.range[1]; for (const c of commentsAfter(e)) e = Math.max(e, c.range[1]); return e; };
  const full = body.map((n, i) => [n.range[0], body[i + 1] && body[i + 1].loc.start.line === n.loc.end.line ? n.range[1] : trailEnd(n)]);   // (a statement followed on its line by another keeps no trailing comment)
  return body.map((n, i) => {
    const prevEnd = i ? full[i - 1][1] : n.range[0] - 1;
    let start = n.range[0];
    const lead = ast.comments.filter((c) => c.range[0] >= prevEnd && c.range[1] <= n.range[0] && c.range[0] > (i ? prevEnd : -1));
    for (const c of lead) { const ls = src.lastIndexOf('\n', c.range[0] - 1) + 1; if (ls >= prevEnd && src.slice(ls, c.range[0]).trim() === '') start = Math.min(start, ls); }
    start = Math.min(start, n.range[0]);
    const sharesLine = i > 0 && body[i - 1].loc.end.line === n.loc.start.line;   // (two statements on one line: the second starts where it stands)
    return { stmt: n, i, start: sharesLine ? n.range[0] : src.lastIndexOf('\n', start - 1) + 1, end: full[i][1] };
  });
}

// An executing statement: not a declaration of a function (function declaration, or a const whose initialiser is a function).
const declaresFnOnly = (n) => n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration' && false
  || (n.type === 'VariableDeclaration' && n.declarations.every((d) => d.init && isFn(d.init)));
// Does the statement run code at boot beyond making functions? (a call, new, assignment, update or tagged template outside any nested function)
function runsCode(n) {
  if (n.type === 'ExpressionStatement') return true;
  if (n.type === 'FunctionDeclaration') return false;
  let hit = false;
  estraverse.traverse(n, { fallback: 'iteration', enter(x) {
    if (isFn(x) && x !== n) return estraverse.VisitorOption.Skip;
    if (x.type === 'CallExpression' || x.type === 'NewExpression' || x.type === 'AssignmentExpression' || x.type === 'UpdateExpression' || x.type === 'TaggedTemplateExpression') hit = true;
  } });
  return hit;
}

export function analyse(src, stageName = 'createStage') {
  const ast = parseSrc(src);
  annotate(ast);
  const fn = findStage(ast, stageName);
  const sm = analyze(ast, { ecmaVersion: 2024, sourceType: 'module', range: true, childVisitorKeys: estraverse.VisitorKeys, fallback: 'iteration' });
  const fnScope = sm.acquire(fn), modScope = sm.globalScope.childScopes.find((s) => s.type === 'module') || sm.globalScope;
  const body = fn.body.body, units = unitRanges(src, ast, body);
  const unitAt = (pos) => { for (const u of units) if (pos >= u.start && pos < u.end) return u.i; return -1; };
  const vars = new Map();
  for (const sc of [modScope, fnScope]) for (const v of sc.variables) {
    if (v.name === 'arguments' || !v.defs.length) continue;
    const def = v.defs[0], writes = v.references.filter((r) => r.isWrite() && !r.init);
    let kind = def.type === 'Variable' ? def.parent.kind : def.type === 'FunctionName' ? 'function' : def.type === 'ClassName' ? 'class' : def.type === 'ImportBinding' ? 'import' : 'param';
    let unit = -1, decl = null;
    if (sc === fnScope && def.type !== 'Parameter') { decl = def.type === 'Variable' ? def.parent : def.node; unit = body.indexOf(decl); if (unit < 0) unit = -2; } // -2: declared in a nested block (a hoisted var): never movable
    vars.set(v, { v, name: v.name, kind, unit, decl, scope: sc === modScope ? 'module' : 'stage', def, reassigned: writes.length > 0 });
  }
  return { src, ast, fn, body, units, unitAt, vars, runs: body.map(runsCode), fnOnly: body.map(declaresFnOnly), comments: ast.comments };
}

export function planSplit(src, spec, A = analyse(src, spec.stage || 'createStage')) {
  const { body, units, unitAt, vars } = A, refusals = [];
  const byName = new Map(); for (const i of vars.values()) byName.set(i.name + '|' + i.scope, i);
  const stay = new Set(spec.stay || []);
  let M = new Set();
  for (const [a, b] of spec.lines || []) for (const u of units) if (u.stmt.loc.start.line >= a && u.stmt.loc.start.line <= b) M.add(u.i);
  for (const n of spec.names || []) {
    const info = [...vars.values()].find((x) => x.name === n && x.scope === 'stage');
    if (!info) { refusals.push(`${n}: no top-level declaration in createStage`); continue; }
    if (info.unit < 0) { refusals.push(`${n}: declared in a nested block, cannot move`); continue; }
    M.add(info.unit);
  }
  for (const text of spec.also || []) {
    const i = body.findIndex((b, k) => b.type === 'ExpressionStatement' && src.slice(units[k].stmt.range[0], units[k].stmt.range[1]).split('\n')[0].trim() === text.trim());
    if (i < 0) refusals.push(`also: no expression statement starting "${text}"`); else M.add(i);
  }
  for (const s of stay) { const i = [...vars.values()].find((x) => x.name === s && x.scope === 'stage'); if (i) M.delete(i.unit); }
  if (refusals.length || !M.size) return { ok: false, refusals: refusals.length ? refusals : ['nothing to move'] };

  const refsOf = (info) => info.v.references.filter((r) => !(r.init && r.identifier.range[0] >= info.decl?.range[0] && r.identifier.range[1] <= info.decl?.range[1]));
  const reasons = [];
  // Fixed point: a `let` declared in a moved statement and used outside stays in stage.js (the part reaches it through live).
  for (let again = true; again;) {
    again = false;
    for (const info of vars.values()) {
      if (!M.has(info.unit) || !(info.kind === 'let' || info.kind === 'var' || info.reassigned)) continue;
      if (refsOf(info).some((r) => !M.has(unitAt(r.identifier.range[0])))) { M.delete(info.unit); again = true; reasons.push(`${info.name} stays (a let used outside the part)`); }
    }
    // A statement that declares anything that must stay keeps the whole statement.
  }
  if (!M.size) return { ok: false, refusals: ['every statement is a shared let; nothing left to move'] };
  const call = Math.min(...M);
  const st = new Map(), live = new Map(), imports = new Map(), returned = new Map(), edits = [];
  const inM = (pos) => M.has(unitAt(pos));
  for (const info of vars.values()) {
    const refs = refsOf(info), inside = refs.filter((r) => inM(r.identifier.range[0])), outside = refs.filter((r) => !inM(r.identifier.range[0]));
    if (M.has(info.unit)) { if (outside.length) returned.set(info.name, info); continue; }
    if (!inside.length) continue;
    if (info.name === 'live' && info.scope === 'stage') continue;   // (the live record itself: the part's own parameter, handed on to the factories it calls)
    if (info.kind === 'import') { imports.set(info.name, info); continue; }
    // (A let, or a const made after the call site, is read through live: a getter asks at the moment of use, so nothing is copied or early.)
    const late = info.scope === 'stage' && info.unit > call && info.kind !== 'function';
    if (info.kind === 'let' || info.kind === 'var' || info.reassigned || info.unit === -2 || late) { live.set(info.name, info); for (const r of inside) edits.push({ id: r.identifier, name: info.name }); continue; }
    st.set(info.name, info);
  }
  // Moved code that runs at boot reads only what already exists at the call site.
  const SYNC_CB = new Set(['map', 'forEach', 'filter', 'flatMap', 'reduce', 'some', 'every', 'find', 'findIndex', 'sort', 'fromEntries']);
  // (a function handed straight to an array method runs at once, so it is not "nested" for the boot walk)
  const runsAtOnce = (n) => isFn(n) && n.parent?.type === 'CallExpression' && n.parent.arguments.includes(n) && ((n.parent.callee.type === 'MemberExpression' && SYNC_CB.has(n.parent.callee.property.name)) || n.parent.callee === n);
  const nested = (id, i) => { for (let n = id.parent; n && n !== body[i]; n = n.parent) if (isFn(n) && !runsAtOnce(n)) return true; return false; };
  const unitRefs = (i, onlyCalls = false, flat = false) => [...vars.values()].filter((x) => x.v.references.some((r) => unitAt(r.identifier.range[0]) === i && !(flat && nested(r.identifier, i))
    && (!onlyCalls || ((r.identifier.parent.type === 'CallExpression' || r.identifier.parent.type === 'NewExpression') && r.identifier.parent.callee === r.identifier))));
  for (const i of M) {
    if (!A.runs[i] && A.fnOnly[i] === true) continue;
    for (const x of unitRefs(i)) if (!M.has(x.unit) && x.scope === 'stage' && x.unit > call && x.kind !== 'function') refusals.push(`${x.name}: read by line ${units[i].stmt.loc.start.line}, which runs at boot, but made after the call site`);
  }
  // Order of effects: a moved statement that runs code may not jump over a staying one that runs code.
  for (const i of M) if (A.runs[i]) for (let k = call + 1; k < i; k++) if (!M.has(k) && A.runs[k]) refusals.push(`line ${units[i].stmt.loc.start.line} runs code and would move before line ${units[k].stmt.loc.start.line}, which also runs code`);
  // Boot: statements before the call site that run code may not reach a name that only exists after it. (A returned const or let would
  // already have failed there before the move, so only a moved statement that has moved LATER than it stood, or a hoisted function, can
  // matter; the walk follows calls (a function only handed over, as in onTheme(f), is not followed), which over-reports: `trust` names a part's names that were read and found not to run at boot.)
  {
    const trust = new Set(spec.trust || []);
    const seen = new Map(), stack = [];
    for (let i = 0; i < call; i++) if (!M.has(i) && A.runs[i]) { seen.set(i, null); stack.push(i); }
    const chain = (i) => { const out = []; for (let k = i; k != null; k = seen.get(k)) out.push(units[k].stmt.loc.start.line); return out.reverse().join(' > '); };
    while (stack.length) {
      const i = stack.pop();
      for (const x of unitRefs(i, true, !seen.get(i) && seen.get(i) !== 0 && seen.get(i) === null)) {
        if (returned.has(x.name) && !trust.has(x.name) && x.kind === 'function') refusals.push(`${x.name}: reached at boot (lines ${chain(i)}) before the call site makes it`);
        if (x.scope === 'stage' && x.unit >= 0 && !M.has(x.unit) && !seen.has(x.unit) && (x.kind === 'function' || A.fnOnly[x.unit])) { seen.set(x.unit, i); stack.push(x.unit); }
      }
    }
  }
  // Module-level statements outside createStage read moved names? (they could not before either, but check)
  for (const info of returned.values()) for (const r of info.v.references) if (unitAt(r.identifier.range[0]) === -1 && r.identifier.range[0] > A.fn.range[1]) refusals.push(`${info.name} is used outside createStage`);
  if (refusals.length) return { ok: false, refusals: [...new Set(refusals)] };

  // --- build the part ---
  const moved = [...M].sort((a, b) => a - b);
  const lives = new Set(live.keys());
  const rewriteIds = [];
  for (const e of edits) rewriteIds.push(e);
  const sliceUnit = (i) => {
    const u = units[i]; let out = '', pos = u.start;
    const mine = rewriteIds.filter((e) => e.id.range[0] >= u.start && e.id.range[1] <= u.end).sort((a, b) => a.id.range[0] - b.id.range[0]);
    for (const e of mine) {
      const p = e.id.parent; let rep = `live.${e.name}`;
      const short = (p.type === 'Property' && p.shorthand && p.value === e.id) || (p.type === 'AssignmentPattern' && p.left === e.id && p.parent?.type === 'Property' && p.parent.shorthand);
      if (short) rep = `${e.name}: live.${e.name}`;
      out += src.slice(pos, e.id.range[0]) + rep; pos = e.id.range[1];
    }
    return out + src.slice(pos, u.end);
  };
  const fname = spec.factory;
  const importLines = new Map();   // source -> { def, ns, named: [] }
  for (const info of imports.values()) {
    const d = info.def.node, srcName = d.parent.source.value, rec = importLines.get(srcName) || { named: [] };
    if (d.type === 'ImportDefaultSpecifier') rec.def = d.local.name; else if (d.type === 'ImportNamespaceSpecifier') rec.ns = d.local.name;
    else rec.named.push(d.imported.name === d.local.name ? d.local.name : `${d.imported.name} as ${d.local.name}`);
    importLines.set(srcName, rec);
  }
  const imp = [...importLines].sort((a, b) => a[0].localeCompare(b[0])).map(([s, r]) => `import ${[r.def, r.ns && `* as ${r.ns}`, r.named.length && `{ ${r.named.sort().join(', ')} }`].filter(Boolean).join(', ')} from '${s}';`);
  const stNames = [...st.keys()].sort(), retNames = [...returned.keys()].sort();
  const usesLive = lives.size > 0;
  const part = [`// ${spec.about || spec.file}`, '// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)', ...imp, '',
    `export function ${fname}(${stNames.length ? 'st' : ''}${usesLive ? (stNames.length ? ', live' : '_st, live') : ''}) {`,
    ...(stNames.length ? [`  const { ${stNames.join(', ')} } = st;`] : []),
    ...moved.map((i) => sliceUnit(i)),
    ...(retNames.length ? [`  return { ${retNames.join(', ')} };`] : []), '}', ''].join('\n');

  // --- build stage.js ---
  // A returned function that a statement BEFORE the call site already reads (an earlier factory is handed it, by value, in its st) would be a
  // const still in its dead zone there. It stays reachable the way it was: a hoisted forwarding function of the same name in stage.js, and the
  // part's own is taken as name$ (check.mjs puts the part back and drops the stub).
  const stubs = new Map();
  for (const [name, info] of returned) {
    const node = info.def?.node;
    if (info.kind !== 'function' || !node || node.type !== 'FunctionDeclaration') continue;
    const early = info.v.references.some((r) => { const u = unitAt(r.identifier.range[0]); return u >= 0 && u < call && !M.has(u); });
    if (!early) continue;
    if (node.async) return { ok: false, refusals: [`${name}: an async function read before the call site cannot be given a forwarding stub`], stage: src, part: '', report: {} };
    stubs.set(name, node.generator);
  }
  const callLhs = retNames.map((n) => (stubs.has(n) ? `${n}: ${n}$` : n)).join(', ');
  const stubText = [...stubs].map(([n, gen]) => `\n  ${gen ? `function* ${n}(...a) { return yield* ${n}$(...a); }` : `function ${n}(...a) { return ${n}$(...a); }`}   ${STUB_MARK}`).join('');
  const callText = `${retNames.length ? `const { ${callLhs} } = ` : ''}${fname}({ ${stNames.join(', ')} }${usesLive ? ', live' : ''});${stubText}`;
  const removes = moved.map((i) => [units[i].start, Math.min(src.length, units[i].end + (src[units[i].end] === '\n' ? 1 : 0))]);
  let stage = '', pos = 0;
  for (let k = 0; k < removes.length; k++) {
    const [a, b] = removes[k];
    stage += src.slice(pos, a); if (k === 0) stage += `  ${callText}\n`;
    pos = b;
  }
  stage += src.slice(pos);
  // Imports only the moved code used leave stage.js (a name still used outside stays).
  {
    const gone = new Map();   // import declaration -> specifier nodes to drop
    for (const info of imports.values()) {
      if (refsOf(info).some((r) => !inM(r.identifier.range[0]))) continue;
      const d = info.def.node, decl = d.parent; (gone.get(decl) || gone.set(decl, []).get(decl)).push(d);
    }
    const cuts = [];
    for (const [decl, specs] of gone) {
      const all = decl.specifiers;
      if (specs.length === all.length) { cuts.push([decl.range[0], decl.range[1] + (src[decl.range[1]] === '\n' ? 1 : 0), '']); continue; }
      const kept = all.filter((s) => !specs.includes(s)), named = kept.filter((s) => s.type === 'ImportSpecifier');
      const txt = (s) => (s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`);
      const head = [kept.find((s) => s.type === 'ImportDefaultSpecifier')?.local.name, kept.find((s) => s.type === 'ImportNamespaceSpecifier') && `* as ${kept.find((s) => s.type === 'ImportNamespaceSpecifier').local.name}`, named.length && `{ ${named.map(txt).join(', ')} }`].filter(Boolean).join(', ');
      cuts.push([decl.range[0], decl.range[1], `import ${head} from ${decl.source.raw};`]);
    }
    cuts.sort((x, y) => y[0] - x[0]);
    for (const [a, b, r] of cuts) { stage = stage.slice(0, a) + r + stage.slice(b); }
  }
  // import of the factory, after the last import
  const impLine = `import { ${fname} } from './${spec.file.replace(/\.js$/, '')}.js';`;
  const lastImp = [...stage.matchAll(/^import [^;]*;[^\n]*\n/gm)].pop();
  const cut = lastImp.index + lastImp[0].length;
  stage = stage.slice(0, cut) + impLine + '\n' + stage.slice(cut);
  return { ok: true, refusals: [], stage, part, report: { moved: moved.map((i) => `${units[i].stmt.loc.start.line}`), st: stNames, live: [...lives].sort(), returned: retNames, imports: [...imports.keys()].sort(), notes: reasons, liveInfo: [...live.values()] } };
}

// The live record: one getter (and a setter when the let is reassigned) per shared let. Rewritten whole each move so names only ever accumulate.
export function writeLive(stageSrc, liveInfo, stageName = 'createStage') {
  const A = analyse(stageSrc, stageName);
  const a = stageSrc.indexOf(`  ${MARK_A}`), b = stageSrc.indexOf(MARK_B);
  const old = new Map();
  if (a >= 0 && b > a) for (const m of stageSrc.slice(a, b).matchAll(/^ {4}(get (\w+)\(\) \{[^\n]*)$/gm)) old.set(m[2], m[1].replace(/^ +/, ''));
  for (const i of liveInfo) old.set(i.name, i.reassigned ? `get ${i.name}() { return ${i.name}; }, set ${i.name}(v) { ${i.name} = v; },` : `get ${i.name}() { return ${i.name}; },`);
  const lines = [...old].sort((x, y) => x[0].localeCompare(y[0])).map(([, l]) => `    ${l}`);
  const block = `  ${MARK_A}\n  // The stage's shared lets (and consts made after a part), read at the moment of use by the part files: never copied, so a part cannot draw a frame late.\n  const live = {\n${lines.join('\n')}\n  };\n  ${MARK_B}\n`;
  if (a >= 0 && b > a) return stageSrc.slice(0, a) + block + stageSrc.slice(stageSrc.indexOf('\n', b) + 1);
  const nl = stageSrc.indexOf('\n', A.fn.body.range[0]) + 1;
  return stageSrc.slice(0, nl) + block + stageSrc.slice(nl);
}

// Whole move: plan, then make the live record complete (a second pass: the record names lets by the new text's own analysis).
export function splitStage(src, spec) {
  const r = planSplit(src, spec);
  if (!r.ok) return r;
  const stage = writeLive(r.stage, r.report.liveInfo, spec.stage || 'createStage');
  return { ...r, stage };
}

// ---- the proof (check.mjs) ----

// Put every part back where its call stands: undo `live.x` to `x`, drop the `st` destructuring and the return, drop the live record.
// Returns the inlined stage.js text, and the (source, imported, local) import bindings the parts brought.
function inlineOnce(stageSrc, readPart) {
  const ast = parseSrc(stageSrc); annotate(ast);
  const fn = findStage(ast), body = fn.body.body;
  const factories = new Map();   // local factory name -> part file
  for (const n of ast.body) if (n.type === 'ImportDeclaration' && /^\.\/stage-[^/]+\.js$/.test(n.source.value)) for (const s of n.specifiers) if (/^create[A-Z]/.test(s.local.name)) factories.set(s.local.name, n.source.value.slice(2));
  const edits = [], partImports = [];
  const lr = [stageSrc.indexOf(`  ${MARK_A}`), stageSrc.indexOf(MARK_B)];
  if (lr[0] >= 0) edits.push([lr[0], stageSrc.indexOf('\n', lr[1]) + 1, '']);
  for (const m of stageSrc.matchAll(new RegExp(`^ *function\\*? \\w+\\(\\.\\.\\.a\\) \\{[^\\n]*\\} +${STUB_MARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`, 'gm'))) edits.push([m.index, m.index + m[0].length, '']);
  for (const [name, file] of factories) {
    const decl = ast.body.find((n) => n.type === 'ImportDeclaration' && n.source.value === './' + file && n.specifiers.some((s) => s.local.name === name));
    edits.push([decl.range[0], decl.range[1] + (stageSrc[decl.range[1]] === '\n' ? 1 : 0), '']);
    const psrc = readPart(file), pa = parseSrc(psrc); annotate(pa);
    const pf = findStage(pa, name), pb = pf.body.body;
    for (const n of pa.body) if (n.type === 'ImportDeclaration') for (const s of n.specifiers) partImports.push([n.source.value, s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : s.imported.name, s.local.name]);
    const liveName = pf.params[1]?.name;
    const keep = pb.filter((n, k) => !(k === 0 && n.type === 'VariableDeclaration' && n.declarations[0].init?.type === 'Identifier' && n.declarations[0].init.name === pf.params[0]?.name)
      && !(k === pb.length - 1 && n.type === 'ReturnStatement'));
    const reps = [];
    estraverse.traverse(pf, { fallback: 'iteration', enter(n) { if (liveName && n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === liveName) reps.push([n.range[0], n.range[1], n.property.name]); } });
    reps.sort((a, b) => a[0] - b[0]);
    let out = '';
    if (keep.length) {
      const first = keep[0], last = keep.at(-1), prevEnd = pb[pb.indexOf(first) - 1]?.range[1] ?? pf.body.range[0];
      const a = psrc.lastIndexOf('\n', Math.min(first.range[0], ...pa.comments.filter((c) => c.range[0] >= prevEnd && c.range[1] <= first.range[0]).map((c) => c.range[0])) - 1) + 1;
      const nextStart = pb[pb.indexOf(last) + 1]?.range[0] ?? pf.body.range[1], le = psrc.indexOf('\n', last.range[1]), b = le < 0 || le > nextStart ? last.range[1] : le + 1;
      let pos = a; for (const [x, y, nm] of reps) { if (x < a || y > b) continue; out += psrc.slice(pos, x) + nm; pos = y; } out += psrc.slice(pos, b);
    }
    const callStmt = body.find((n) => (n.type === 'VariableDeclaration' && n.declarations[0].init?.type === 'CallExpression' && n.declarations[0].init.callee.name === name)
      || (n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression' && n.expression.callee.name === name));
    if (!callStmt) throw new Error(`${name}: no call in stage.js`);
    edits.push([callStmt.range[0], callStmt.range[1] + (stageSrc[callStmt.range[1]] === '\n' ? 1 : 0), out]);
  }
  edits.sort((a, b) => b[0] - a[0]);
  let text = stageSrc; for (const [a, b, r] of edits) text = text.slice(0, a) + r + text.slice(b);
  return { text, partImports };
}

const dropKeys = new Set(['range', 'loc', 'start', 'end', 'parent', 'raw', 'comments', 'tokens']);
export const normalize = (n) => JSON.stringify(n, (k, v) => (dropKeys.has(k) ? undefined : k === 'shorthand' ? false : v));

export function familyKeys(src) {
  const ast = parseSrc(src), fn = findStage(ast);
  const imp = (n) => n.specifiers.map((s) => [n.source.value, s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : s.imported.name, s.local.name].join('|'));
  return { body: fn.body.body.map((n) => ({ key: normalize(n), runs: runsCode(n), line: n.loc.start.line })),
    outside: ast.body.filter((n) => n.type !== 'ImportDeclaration' && !(n.type === 'ExportNamedDeclaration' && n.declaration === fn)).map(normalize),
    imports: ast.body.filter((n) => n.type === 'ImportDeclaration').flatMap(imp) };
}

// Is the new family the same program as the old stage.js? Returns a list of problems (empty = proven by text).
export function checkEquivalence(baseSrc, newStageSrc, readPart, baseImports = []) {
  const problems = [], { text, partImports } = inlineFamily(newStageSrc, readPart);
  const B = familyKeys(baseSrc), I = familyKeys(text);
  const bag = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return m; };
  const bb = bag(B.body.map((x) => x.key)), ib = bag(I.body.map((x) => x.key));
  for (const [k, n] of bb) if (ib.get(k) !== n) problems.push(`statement lost or changed (base line ${B.body.find((x) => x.key === k).line}): ${k.slice(0, 90)}`);
  for (const [k, n] of ib) if (bb.get(k) !== n) problems.push(`statement added or changed (inlined line ${I.body.find((x) => x.key === k).line}): ${k.slice(0, 90)}`);
  if (B.body.filter((x) => x.runs).map((x) => x.key).join('\n') !== I.body.filter((x) => x.runs).map((x) => x.key).join('\n')) problems.push('the statements that run code at boot are not in the same order as before');
  if (B.outside.join('\n') !== I.outside.join('\n')) problems.push('module-level statements outside createStage differ');
  const baseImp = new Set([...B.imports, ...baseImports.map((x) => x.join('|'))]);
  for (const [s, i, l] of partImports) if (!baseImp.has([s, i, l].join('|'))) problems.push(`a part imports ${l} from ${s}, which stage.js did not`);
  for (const k of I.imports) if (!baseImp.has(k)) problems.push(`stage.js imports ${k} that it did not before`);
  return problems;
}

// No `let` of the stage is handed over by value: every name in a call's st object is a const, function, class or never-written parameter.
export function checkNoCopies(stageSrc) {
  const A = analyse(stageSrc), problems = [], factories = new Set();
  for (const n of A.ast.body) if (n.type === 'ImportDeclaration' && /^\.\/stage-[^/]+\.js$/.test(n.source.value)) for (const s of n.specifiers) if (/^create[A-Z]/.test(s.local.name)) factories.add(s.local.name);
  const byName = new Map([...A.vars.values()].map((x) => [x.name, x]));
  for (const n of A.body) {
    const call = n.type === 'VariableDeclaration' ? n.declarations[0].init : n.type === 'ExpressionStatement' ? n.expression : null;
    if (call?.type !== 'CallExpression' || !factories.has(call.callee.name)) continue;
    for (const p of call.arguments[0]?.properties || []) {
      const x = byName.get(p.key.name);
      if (!x) problems.push(`${call.callee.name}: ${p.key.name} is not a name of the stage`);
      else if (x.kind === 'let' || x.kind === 'var' || x.reassigned) problems.push(`${call.callee.name}: ${p.key.name} is a ${x.kind}${x.reassigned ? ' that is reassigned' : ''} handed over by value (use live)`);
    }
    if (call.arguments[1] && !(call.arguments[1].type === 'Identifier' && call.arguments[1].name === 'live')) problems.push(`${call.callee.name}: the second argument must be the live record`);
  }
  return problems;
}

// Put every part back at its call, and then the parts' own nested factories (a part that calls another part's factory), until none is left.
export function inlineFamily(stageSrc, readPart) {
  let text = stageSrc; const partImports = [];
  for (let pass = 0; pass < 8; pass++) {
    const r = inlineOnce(text, readPart); text = r.text;
    const nested = r.partImports.filter(([src, , local]) => /^\.\/stage-[^/]+\.js$/.test(src) && /^create[A-Z]/.test(local));
    for (const x of r.partImports) if (!nested.includes(x)) partImports.push(x);
    if (!nested.length) break;
    text = nested.map(([src, imp, local]) => `import { ${imp === local ? imp : imp + ' as ' + local} } from '${src}';\n`).join('') + text;
  }
  return { text, partImports };
}
