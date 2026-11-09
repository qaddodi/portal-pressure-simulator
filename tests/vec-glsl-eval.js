// A small evaluator for the scalar-and-struct subset of GLSL ES 3.00 that vec-hier-glsl.js's lookup functions are written in, so a test can run the
// shader's own text (vecLeafAt, vecLeafRead, vecRunRef, …) step by step against the JS mirror: every float operation is rounded to float32, every
// int operation to int32, every uint operation to uint32, and mixing types in one operation (which GLSL refuses) throws. Not a *.test.js.
//
// Subset: scalar float / int / uint / bool; vec2, ivec2, uvec4, vec4 values as {x, y, z, w} (read by .x .y .z .w); structs; declarations with
// initialisers; = += -= *= |= ; ++ ; if / else; for; return; ternary; the operators of the lookup; calls to float(), int(), uint(), floor(),
// texelFetch(sampler, ivec2, lod), and the evaluated functions themselves.
const TOK = /\s+|(?<num>0[xX][0-9a-fA-F]+[uU]?|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fFuU]?)|(?<id>[A-Za-z_]\w*)|(?<op><<=|>>=|&&|\|\||==|!=|<=|>=|\+\+|--|\+=|-=|\*=|\/=|\|=|<<|>>|[{}()[\];,.?:+\-*/%<>=!~&|^])/gy;
const F = Math.fround;

function tokens(src) {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const out = [];
  TOK.lastIndex = 0;
  while (TOK.lastIndex < text.length) {
    const at = TOK.lastIndex, m = TOK.exec(text);
    if (!m) throw new Error(`glsl-eval: cannot read "${text.slice(at, at + 12)}"`);
    if (m.groups.num) out.push({ k: 'num', v: m[0] }); else if (m.groups.id) out.push({ k: 'id', v: m[0] }); else if (m.groups.op) out.push({ k: 'op', v: m[0] });
  }
  return out;
}

const SCALAR = new Set(['float', 'int', 'uint', 'bool']);
const VEC = new Set(['vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4']);
const num = (t, v) => ({ t, v });
const wrap = (t, v) => (t === 'float' ? F(v) : t === 'int' ? v | 0 : t === 'uint' ? v >>> 0 : v);

/** Loads GLSL source text (declarations and functions); returns { call(name, args, env) }. env: { uniforms: {name: value}, textures: {name: (x, y) => {x,y,z,w}} }. */
export function loadGLSL(src) {
  const T = tokens(src);
  const consts = new Map(), fns = new Map(), structs = new Map();
  let p = 0;
  const skipTo = (v) => { let d = 0; while (p < T.length) { const t = T[p]; if (t.k === 'op') { if ('({['.includes(t.v)) d++; else if (')}]'.includes(t.v)) d--; if (d === 0 && t.v === v) return; } p++; } };
  const constExpr = (toks) => { const sub = { T: toks, p: 0 }; return parseExpr(sub, 0, { vars: [consts] }); };
  void constExpr;
  while (p < T.length) {
    const t = T[p];
    if (t.v === 'uniform' || t.v === 'precision') { skipTo(';'); p++; continue; }
    if (t.v === 'struct') {
      const name = T[p + 1].v; p += 3;
      const fields = [];
      while (T[p].v !== '}') { const ty = T[p].v; p++; for (;;) { fields.push([T[p].v, ty]); p++; if (T[p].v === ',') { p++; continue; } break; } p++; /* ; */ }
      p += 2; structs.set(name, fields); continue;
    }
    if (t.v === 'const') {   // const TYPE NAME = expr;
      const ty = T[p + 1].v, name = T[p + 2].v; p += 4;
      const start = p; skipTo(';');
      const sub = { T: T.slice(start, p), p: 0 };
      consts.set(name, castTo(ty, parseExpr(sub, 0, { vars: [consts], fns, structs })));
      p++; continue;
    }
    // a function: TYPE name ( params ) { body }
    const ret = T[p].v, name = T[p + 1].v; p += 3;
    const params = [];
    while (T[p].v !== ')') { const ty = T[p].v, nm = T[p + 1].v; params.push([ty, nm]); p += 2; if (T[p].v === ',') p++; }
    p++;
    const start = p; skipTo('}');
    p++;
    fns.set(name, { ret, params, body: T.slice(start, p) });
  }
  function castTo(ty, v) {
    if (SCALAR.has(ty)) { if (v.t !== ty) throw new Error(`glsl-eval: ${v.t} where ${ty} is declared`); return v; }
    return v;
  }
  return { fns, call: (name, args, env) => callFn(fns.get(name), args, env, { consts, fns, structs }) };
}

function callFn(fn, args, env, g) {
  if (!fn) throw new Error('glsl-eval: no such function');
  const scope = new Map();
  fn.params.forEach(([ty, nm], i) => { if (SCALAR.has(ty) && args[i].t !== ty) throw new Error(`glsl-eval: argument ${nm} is ${args[i].t}, declared ${ty}`); scope.set(nm, args[i]); });
  const ctx = { vars: [g.consts, scope], fns: g.fns, structs: g.structs, env, ret: undefined, done: false };
  const sub = { T: fn.body, p: 0 };
  execBlock(sub, ctx);
  return ctx.ret;
}

// ── parsing and evaluating, one pass: `live` false skips (parses without running) ──
const lookupVar = (ctx, name) => { for (let i = ctx.vars.length - 1; i >= 0; i--) if (ctx.vars[i].has(name)) return ctx.vars[i]; return null; };
const peek = (s, k = 0) => s.T[s.p + k];
const eat = (s, v) => { if (s.T[s.p]?.v !== v) throw new Error(`glsl-eval: expected ${v} but found ${s.T[s.p]?.v}`); s.p++; };
const is = (s, v) => s.T[s.p]?.v === v && s.T[s.p].k !== 'num';

function binop(op, a, b) {
  if (a.t !== b.t) throw new Error(`glsl-eval: ${a.t} ${op} ${b.t}`);
  const t = a.t, x = a.v, y = b.v;
  switch (op) {
    case '+': return num(t, wrap(t, x + y));
    case '-': return num(t, wrap(t, x - y));
    case '*': return num(t, t === 'int' ? Math.imul(x, y) : t === 'uint' ? Math.imul(x, y) >>> 0 : wrap(t, x * y));
    case '/': return num(t, t === 'float' ? F(x / y) : t === 'int' ? (x / y) | 0 : (x / y) >>> 0);
    case '%': if (t === 'float') throw new Error('glsl-eval: % on float'); return num(t, y === 0 ? 0 : t === 'int' ? (x % y) | 0 : (x % y) >>> 0);
    case '<': return num('bool', x < y); case '>': return num('bool', x > y); case '<=': return num('bool', x <= y); case '>=': return num('bool', x >= y);
    case '==': return num('bool', x === y); case '!=': return num('bool', x !== y);
    case '&': return num(t, wrap(t, x & y)); case '|': return num(t, wrap(t, x | y)); case '^': return num(t, wrap(t, x ^ y));
    default: throw new Error(`glsl-eval: operator ${op}`);
  }
}
const PREC = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];

function parseExpr(s, lvl, ctx, live = true) {
  if (lvl === -1) return parseTernary(s, ctx, live);
  return parseTernary(s, ctx, live);
}
function parseTernary(s, ctx, live) {
  const c = parseBin(s, 0, ctx, live);
  if (is(s, '?')) {
    s.p++;
    const a = parseTernary(s, ctx, live && c.v); eat(s, ':');
    const b = parseTernary(s, ctx, live && !c.v);
    return c.v ? a : b;
  }
  return c;
}
function parseBin(s, lvl, ctx, live) {
  if (lvl === PREC.length) return parseUnary(s, ctx, live);
  let a = parseBin(s, lvl + 1, ctx, live);
  for (;;) {
    const op = peek(s)?.k === 'op' ? peek(s).v : null;
    if (!op || !PREC[lvl].includes(op)) return a;
    s.p++;
    if (op === '&&' || op === '||') {
      const short = op === '&&' ? !a.v : a.v;
      const b = parseBin(s, lvl + 1, ctx, live && !short);
      a = short ? a : b;   // (bool && bool)
      continue;
    }
    const b = parseBin(s, lvl + 1, ctx, live);
    if (!live) continue;
    if (op === '<<' || op === '>>') {
      if (a.t === 'uint' && b.t === 'uint') a = num('uint', op === '<<' ? (a.v << b.v) >>> 0 : a.v >>> b.v);
      else if (a.t === 'int' && b.t === 'int') a = num('int', op === '<<' ? a.v << b.v : a.v >> b.v);
      else if (a.t === 'uint' && b.t === 'int') a = num('uint', op === '<<' ? (a.v << b.v) >>> 0 : a.v >>> b.v);
      else throw new Error(`glsl-eval: ${a.t} ${op} ${b.t}`);
    } else a = binop(op, a, b);
  }
}
function parseUnary(s, ctx, live) {
  if (is(s, '-')) { s.p++; const a = parseUnary(s, ctx, live); return live ? num(a.t, wrap(a.t, -a.v)) : a; }
  if (is(s, '!')) { s.p++; const a = parseUnary(s, ctx, live); return live ? num('bool', !a.v) : a; }
  return parsePostfix(s, ctx, live);
}
function parsePostfix(s, ctx, live) {
  let a = parsePrimary(s, ctx, live);
  while (is(s, '.')) {
    s.p++; const f = peek(s).v; s.p++;
    if (live && f.length > 1 && /^[xyzw]+$|^[rgba]+$/.test(f) && VEC.has(a.t)) {   // a read-only swizzle: .xy, .zw, .xyz …
      const pre = a.t.slice(0, -1), names = 'xyzw', map = { r: 'x', g: 'y', b: 'z', a: 'w' };
      const out = {};
      for (let i = 0; i < f.length; i++) out[names[i]] = a.v[map[f[i]] ?? f[i]];
      a = { t: pre + f.length, v: out };
      continue;
    }
    if (live) { const k = { r: 'x', g: 'y', b: 'z', a: 'w' }[f] ?? f; if (!(k in a.v) && !(a.v && k in a.v)) throw new Error(`glsl-eval: no field ${f}`); a = a.v[k]; }
  }
  return a;
}
function args(s, ctx, live) {
  const out = [];
  eat(s, '(');
  if (!is(s, ')')) for (;;) { out.push(parseTernary(s, ctx, live)); if (is(s, ',')) { s.p++; continue; } break; }
  eat(s, ')');
  return out;
}
function convert(ty, a) {
  const x = a.v;
  if (ty === 'float') return num('float', F(typeof x === 'boolean' ? +x : x));
  if (ty === 'int') return num('int', Math.trunc(typeof x === 'boolean' ? +x : x) | 0);
  if (ty === 'uint') return num('uint', Math.trunc(typeof x === 'boolean' ? +x : x) >>> 0);
  throw new Error(`glsl-eval: cannot convert to ${ty}`);
}
function parsePrimary(s, ctx, live) {
  const t = peek(s);
  if (t.k === 'num') {
    s.p++;
    const v = t.v;
    if (/^0[xX]/.test(v)) return /[uU]$/.test(v) ? num('uint', parseInt(v, 16) >>> 0) : num('int', parseInt(v, 16) | 0);
    if (/[uU]$/.test(v)) return num('uint', parseInt(v, 10) >>> 0);
    if (/[.eE]/.test(v)) return num('float', F(parseFloat(v)));
    return num('int', parseInt(v, 10) | 0);
  }
  if (is(s, '(')) { s.p++; const a = parseTernary(s, ctx, live); eat(s, ')'); return a; }
  const name = t.v; s.p++;
  if (is(s, '(')) {   // a call
    const a = args(s, ctx, live);
    if (!live) return num('float', 0);
    if (name === 'float' || name === 'int' || name === 'uint') return convert(name, a[0]);
    if (name === 'floor') return num('float', F(Math.floor(a[0].v)));
    if (name === 'ivec2') return { t: 'ivec2', v: { x: a[0], y: a[1] } };
    if (name === 'ivec4' && a.length === 1 && a[0].t === 'vec4') { const o = {}; for (const k of 'xyzw') o[k] = num('int', Math.trunc(a[0].v[k].v) | 0); return { t: 'ivec4', v: o }; }
    if (name === 'texelFetch' && ctx.env.textures[a[0].name].float) { const r = ctx.env.textures[a[0].name](a[1].v.x.v, a[1].v.y.v); return { t: 'vec4', v: { x: num('float', F(r[0])), y: num('float', F(r[1])), z: num('float', F(r[2])), w: num('float', F(r[3])) } }; }
    if (name === 'texelFetch') { const tex = ctx.env.textures[a[0].name]; const r = tex(a[1].v.x.v, a[1].v.y.v); return { t: 'uvec4', v: { x: num('uint', r[0] >>> 0), y: num('uint', r[1] >>> 0), z: num('uint', r[2] >>> 0), w: num('uint', r[3] >>> 0) } }; }
    if (ctx.fns.has(name)) return callFn(ctx.fns.get(name), a, ctx.env, { consts: ctx.vars[0], fns: ctx.fns, structs: ctx.structs });
    throw new Error(`glsl-eval: unknown function ${name}`);
  }
  if (ctx.env?.textures && name in ctx.env.textures) return { t: 'sampler', name, v: null };
  if (ctx.env?.uniforms && name in ctx.env.uniforms) return ctx.env.uniforms[name];
  const sc = lookupVar(ctx, name);
  if (!sc) { if (!live) return num('float', 0); throw new Error(`glsl-eval: ${name} is not declared`); }
  return sc.get(name);
}

// ── statements ──
function skipStmt(s) {
  if (is(s, '{')) { let d = 0; do { if (is(s, '{')) d++; else if (is(s, '}')) d--; s.p++; } while (d > 0); return; }
  if (is(s, 'if')) { s.p++; skipParens(s); skipStmt(s); if (is(s, 'else')) { s.p++; skipStmt(s); } return; }
  if (is(s, 'for')) { s.p++; skipParens(s); skipStmt(s); return; }
  let d = 0;
  while (s.p < s.T.length) { const v = s.T[s.p].k === 'op' ? s.T[s.p].v : ''; if ('({['.includes(v) && v) d++; else if (')}]'.includes(v) && v) d--; s.p++; if (d === 0 && v === ';') return; }
}
function skipParens(s) { let d = 0; do { if (is(s, '(')) d++; else if (is(s, ')')) d--; s.p++; } while (d > 0); }

function execBlock(s, ctx) {
  eat(s, '{');
  ctx.vars.push(new Map());
  while (!is(s, '}')) { if (ctx.done) skipStmt(s); else execStmt(s, ctx); }
  s.p++;
  ctx.vars.pop();
}
function defaultOf(ty, ctx) {
  if (SCALAR.has(ty)) return num(ty, ty === 'bool' ? false : 0);
  if (ctx.structs.has(ty)) { const o = {}; for (const [n, ft] of ctx.structs.get(ty)) o[n] = defaultOf(ft, ctx); return { t: ty, v: o }; }
  return { t: ty, v: { x: num('float', 0), y: num('float', 0), z: num('float', 0), w: num('float', 0) } };
}
function assignTo(s, ctx) {   // parses an lvalue name(.field)* and the operator; returns the setter
  const name = peek(s).v; s.p++;
  let holder = lookupVar(ctx, name)?.get(name), field = null, owner = null;
  if (!holder) throw new Error(`glsl-eval: ${name} is not declared`);
  while (is(s, '.')) { s.p++; field = peek(s).v; s.p++; owner = holder; holder = holder.v[field]; }
  return { get: () => holder, set: (v) => { if (owner) owner.v[field] = v; else lookupVar(ctx, name).set(name, v); } };
}
function execStmt(s, ctx) {
  const t = peek(s);
  if (is(s, '{')) { execBlock(s, ctx); return; }
  if (is(s, ';')) { s.p++; return; }
  if (is(s, 'return')) { s.p++; ctx.ret = parseTernary(s, ctx, true); eat(s, ';'); ctx.done = true; return; }
  if (is(s, 'if')) {
    s.p++; eat(s, '('); const c = parseTernary(s, ctx, true); eat(s, ')');
    if (c.v) execStmt(s, ctx); else skipStmt(s);
    if (is(s, 'else')) { s.p++; if (c.v) skipStmt(s); else execStmt(s, ctx); }
    return;
  }
  if (is(s, 'for')) {
    s.p++; eat(s, '(');
    ctx.vars.push(new Map());
    execStmt(s, ctx);   // init (takes its ;)
    const condAt = s.p; skipTo2(s, ';'); const stepAt = s.p + 1; skipParens2(s);
    // body position
    const bodyAt = s.p;
    let guard = 0;
    for (;;) {
      s.p = condAt; const c = parseTernary(s, ctx, true); eat(s, ';');
      if (!c.v || ctx.done) break;
      s.p = bodyAt; execStmt(s, ctx);
      if (ctx.done) break;
      s.p = stepAt; execStep(s, ctx);
      if (++guard > 100000) throw new Error('glsl-eval: loop does not end');
    }
    s.p = bodyAt; skipStmt(s);
    ctx.vars.pop();
    return;
  }
  if (t.k === 'id' && (SCALAR.has(t.v) || VEC.has(t.v) || ctx.structs.has(t.v)) && peek(s, 1)?.k === 'id') {   // a declaration
    const ty = t.v; s.p++;
    for (;;) {
      const nm = peek(s).v; s.p++;
      let v = defaultOf(ty, ctx);
      if (is(s, '=')) { s.p++; v = parseTernary(s, ctx, true); if (SCALAR.has(ty) && v.t !== ty) throw new Error(`glsl-eval: ${nm} is ${ty}, initialised with ${v.t}`); }
      ctx.vars[ctx.vars.length - 1].set(nm, v);
      if (is(s, ',')) { s.p++; continue; }
      break;
    }
    eat(s, ';');
    return;
  }
  execStep(s, ctx);
  eat(s, ';');
}
function skipTo2(s, v) { let d = 0; while (s.p < s.T.length) { const x = s.T[s.p]; if (x.k === 'op') { if ('({['.includes(x.v)) d++; else if (')}]'.includes(x.v)) d--; if (d === 0 && x.v === v) return; } s.p++; } }
function skipParens2(s) { let d = 0; while (s.p < s.T.length) { const x = s.T[s.p]; if (x.k === 'op') { if (x.v === '(') d++; else if (x.v === ')') { if (d === 0) { s.p++; return; } d--; } } s.p++; } }
function execStep(s, ctx) {   // an assignment, += etc., or name++
  const lv = assignTo(s, ctx);
  const op = peek(s).v; s.p++;
  if (op === '++') { const c = lv.get(); lv.set(num(c.t, wrap(c.t, c.v + 1))); return; }
  if (op === '=') { lv.set(parseTernary(s, ctx, true)); return; }
  const r = parseTernary(s, ctx, true), c = lv.get();
  const bop = op.slice(0, -1);
  lv.set(binop(bop, c, r));
}
