// A small interpreter for the subset of GLSL ES 3.00 a Tube vertex shader's own code is written in, for the unit tests (10 Nov 2026, brief S2-J):
// it runs `main` of a vertex shader on one vertex and returns its outputs, in doubles, so a test can set the shader's text beside its JS twin on a
// table of vertices (the twin is the reference). Nothing here compiles or draws; it reads the same source string the renderer compiles.
// Supported: const/uniform/in/out/flat/invariant/layout declarations, structs, functions (in parameters), local declarations (several to a
// statement), if/else, for, break, return, = += -= *= /=, ++ and --, the operators + - * / < > <= >= == != && || ! and ?:, vec2/3/4 and mat3 (a matrix
// times a vector), swizzles (read, and write for xy), struct members, and the builtins in BUILTIN. A name the source does not define is a
// native the caller gives (texture reads: PT, mRW). Anything else throws, so a new construct in the shader is noticed, not skipped.
const TOKEN = /\s+|(?<num>(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fF]?)|(?<id>[A-Za-z_]\w*)|(?<op><<=|>>=|&&|\|\||==|!=|<=|>=|\+\+|--|\+=|-=|\*=|\/=|[{}()[\];,.?:+\-*/%<>=!])/gy;

function tokenize(src) {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const at = TOKEN.lastIndex, m = TOKEN.exec(text);
    if (!m) throw new Error(`glsl-eval: cannot read "${text.slice(at, at + 20)}"`);
    if (m.groups.num !== undefined) out.push({ t: 'num', v: m[0], float: /[.eEfF]/.test(m[0]) });
    else if (m.groups.id !== undefined) out.push({ t: 'id', v: m[0] });
    else if (m.groups.op !== undefined) out.push({ t: 'op', v: m[0] });
  }
  return out;
}

const TYPES = new Set(['void', 'bool', 'int', 'float', 'vec2', 'vec3', 'vec4', 'mat3', 'sampler2D']);
const QUAL = new Set(['const', 'uniform', 'in', 'out', 'flat', 'highp', 'mediump', 'lowp', 'invariant']);
const isVec = (v) => Array.isArray(v);
const zip = (a, b, f) => (isVec(a) ? (isVec(b) ? a.map((x, i) => f(x, b[i])) : a.map((x) => f(x, b))) : isVec(b) ? b.map((y) => f(a, y)) : f(a, b));
const map1 = (a, f) => (isVec(a) ? a.map(f) : f(a));
const BUILTIN = {
  length: (a) => (isVec(a) ? Math.hypot(...a) : Math.abs(a)),
  distance: (a, b) => Math.hypot(...a.map((x, i) => x - b[i])),
  dot: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
  normalize: (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); },
  min: (a, b) => zip(a, b, Math.min), max: (a, b) => zip(a, b, Math.max),
  clamp: (x, a, b) => zip(zip(x, a, Math.max), b, Math.min),
  abs: (a) => map1(a, Math.abs), sqrt: (a) => map1(a, Math.sqrt), tan: (a) => map1(a, Math.tan), sin: (a) => map1(a, Math.sin), cos: (a) => map1(a, Math.cos),
  atan: (y, x) => (x === undefined ? Math.atan(y) : Math.atan2(y, x)),
  float: (a) => (typeof a === 'boolean' ? (a ? 1 : 0) : a), int: (a) => Math.trunc(a),
  floor: (a) => map1(a, Math.floor), mix: (a, b, t) => zip(zip(a, 1, (x) => x), zip(b, a, (y, x) => y - x), (x, d) => x + d * t),
};
const vecN = (n) => (...args) => {
  const flat = args.flatMap((a) => (isVec(a) ? a : [a]));
  if (flat.length === 1) return Array(n).fill(flat[0]);
  if (flat.length !== n) throw new Error(`glsl-eval: vec${n} of ${flat.length} values`);
  return flat;
};
BUILTIN.vec2 = vecN(2); BUILTIN.vec3 = vecN(3); BUILTIN.vec4 = vecN(4);

const SW = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3 };
const swz = (v, name) => { const r = [...name].map((c) => v[SW[c]]); return r.length === 1 ? r[0] : r; };
const mulMat = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[3 + r] * v[1] + m[6 + r] * v[2]);   // column-major mat3 times vec3
const BIN = {
  '+': (a, b) => zip(a, b, (x, y) => x + y), '-': (a, b) => zip(a, b, (x, y) => x - y), '/': (a, b) => zip(a, b, (x, y) => x / y),
  '*': (a, b) => (a && a.mat ? mulMat(a.m, b) : zip(a, b, (x, y) => x * y)),
  '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b,
  '==': (a, b) => a === b, '!=': (a, b) => a !== b, '&&': (a, b) => a && b, '||': (a, b) => a || b,
};

/**
 * Parses a vertex shader's source. Returns { run(inputs) } where inputs = { attrs: {name: value}, uniforms: {name: value (a mat3 is { mat: true, m: [9 numbers] })}, natives: {name: fn} },
 * and run returns { gl_Position, <each out variable> } after main.
 */
export function compileVS(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = (k = 0) => toks[p + k], is = (v, k = 0) => toks[p + k]?.v === v && toks[p + k].t !== 'num';
  const take = () => toks[p++];
  const expect = (v) => { if (!is(v)) throw new Error(`glsl-eval: expected "${v}" but found "${toks[p]?.v}"`); return take(); };
  const consts = new Map(), globals = new Map(), outs = new Set(), structs = new Map(), fns = new Map(), attrNames = new Set(), uniformNames = new Set();
  const isType = (v) => TYPES.has(v) || structs.has(v);

  // ---- expressions (an AST of closures over a scope) ----
  const PREC = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/']];
  function parseExpr() { return parseTernary(); }
  function parseTernary() {
    const c = parseBin(0);
    if (!is('?')) return c;
    take(); const a = parseExpr(); expect(':'); const b = parseExpr();
    return (sc) => (c(sc) ? a(sc) : b(sc));
  }
  function parseBin(l) {
    if (l === PREC.length) return parseUnary();
    let left = parseBin(l + 1);
    while (peek() && peek().t === 'op' && PREC[l].includes(peek().v)) {
      const op = take().v, right = parseBin(l + 1), f = BIN[op], a = left;
      left = op === '&&' ? (sc) => a(sc) && right(sc) : op === '||' ? (sc) => a(sc) || right(sc) : (sc) => f(a(sc), right(sc));
    }
    return left;
  }
  function parseUnary() {
    if (is('-')) { take(); const e = parseUnary(); return (sc) => map1(e(sc), (x) => -x); }
    if (is('!')) { take(); const e = parseUnary(); return (sc) => !e(sc); }
    if (is('+')) { take(); return parseUnary(); }
    return parsePostfix();
  }
  function parsePostfix() {
    let e = parsePrimary();
    while (is('.')) {
      take(); const name = take().v, a = e;
      e = (sc) => { const v = a(sc); return isVec(v) ? swz(v, name) : v[name]; };
    }
    return e;
  }
  function parsePrimary() {
    const t = take();
    if (t.t === 'num') { const v = parseFloat(t.v); return () => v; }
    if (t.v === '(') { const e = parseExpr(); expect(')'); return e; }
    if (t.t !== 'id') throw new Error(`glsl-eval: unexpected "${t.v}"`);
    if (t.v === 'true') return () => true;
    if (t.v === 'false') return () => false;
    if (is('(')) {
      take();
      const args = [];
      while (!is(')')) { args.push(parseExpr()); if (is(',')) take(); }
      take();
      const name = t.v;
      return (sc) => {
        const vals = args.map((a) => a(sc));
        if (structs.has(name)) { const o = {}; structs.get(name).forEach(([, f], i) => { o[f] = vals[i]; }); return o; }
        if (fns.has(name)) return callFn(name, vals, sc);
        if (sc.rt.natives[name]) return sc.rt.natives[name](...vals);
        if (BUILTIN[name]) return BUILTIN[name](...vals);
        throw new Error(`glsl-eval: no function ${name}`);
      };
    }
    const name = t.v;
    return (sc) => lookup(sc, name);
  }
  function lookup(sc, name) {
    for (let s = sc; s; s = s.up) if (s.vars.has(name)) return s.vars.get(name);
    if (consts.has(name)) return consts.get(name);
    if (sc.rt.globals.has(name)) return sc.rt.globals.get(name);
    if (sc.rt.attrs[name] !== undefined) return sc.rt.attrs[name];
    if (sc.rt.uniforms[name] !== undefined) return sc.rt.uniforms[name];
    throw new Error(`glsl-eval: no variable ${name}`);
  }
  function setVar(sc, name, v) {
    for (let s = sc; s; s = s.up) if (s.vars.has(name)) { s.vars.set(name, v); return; }
    if (sc.rt.globals.has(name)) { sc.rt.globals.set(name, v); return; }
    throw new Error(`glsl-eval: cannot assign ${name}`);
  }

  // ---- statements ----
  const RET = Symbol('return'), BRK = Symbol('break'), CONT = Symbol('continue');
  function parseBlock() {
    expect('{');
    const list = [];
    while (!is('}')) list.push(parseStmt());
    take();
    return (sc) => { const inner = { vars: new Map(), up: sc, rt: sc.rt }; for (const s of list) { const r = s(inner); if (r) return r; } return null; };
  }
  function declTypeAhead() { let k = 0; while (peek(k) && QUAL.has(peek(k).v)) k++; return isType(peek(k)?.v) && peek(k + 1)?.t === 'id'; }
  function parseDecl() {
    while (QUAL.has(peek().v)) take();
    const type = take().v, decls = [];
    for (;;) {
      const name = take().v;
      const init = is('=') ? (take(), parseExpr()) : null;
      decls.push([name, init]);
      if (is(',')) { take(); continue; }
      break;
    }
    return (sc) => {
      for (const [name, init] of decls) {
        let v = init ? init(sc) : structs.has(type) ? {} : 0;
        if (type === 'int' && typeof v === 'number') v = Math.trunc(v);
        sc.vars.set(name, v);
      }
      return null;
    };
  }
  function parseSimple() {   // a declaration or an assignment / increment (no trailing ;)
    if (declTypeAhead()) return parseDecl();
    const target = parseTarget();
    if (is('++') || is('--')) { const d = take().v === '++' ? 1 : -1; return (sc) => { target.set(sc, target.get(sc) + d); return null; }; }
    const op = take().v;
    if (!['=', '+=', '-=', '*=', '/='].includes(op)) throw new Error(`glsl-eval: unexpected "${op}"`);
    const rhs = parseExpr(), f = op === '=' ? null : BIN[op[0]];
    return (sc) => { const v = rhs(sc); target.set(sc, f ? f(target.get(sc), v) : v); return null; };
  }
  function parseTarget() {
    const name = take().v;
    let member = null;
    if (is('.')) { take(); member = take().v; }
    return {
      get: (sc) => (member === null ? lookup(sc, name) : (() => { const o = lookup(sc, name); return isVec(o) ? swz(o, member) : o[member]; })()),
      set: (sc, v) => {
        if (member === null) { setVar(sc, name, v); return; }
        const o = lookup(sc, name);
        if (isVec(o)) { const nv = o.slice(); [...member].forEach((c, i) => { nv[SW[c]] = member.length === 1 ? v : v[i]; }); setVar(sc, name, nv); } else o[member] = v;
      },
    };
  }
  function parseStmt() {
    if (is('{')) return parseBlock();
    if (is('if')) {
      take(); expect('('); const c = parseExpr(); expect(')');
      const a = parseStmt();
      let b = null;
      if (is('else')) { take(); b = parseStmt(); }
      return (sc) => (c(sc) ? a(sc) : b ? b(sc) : null);
    }
    if (is('for')) {
      take(); expect('(');
      const init = parseSimple(); expect(';'); const cond = parseExpr(); expect(';'); const step = parseSimple(); expect(')');
      const body = parseStmt();
      return (sc) => {
        const inner = { vars: new Map(), up: sc, rt: sc.rt };
        init(inner);
        for (let guard = 0; cond(inner); guard++) {
          if (guard > 10000) throw new Error('glsl-eval: a loop ran away');
          const r = body(inner);
          if (r === BRK) break;
          if (r && r !== CONT) return r;
          step(inner);
        }
        return null;
      };
    }
    if (is('break')) { take(); expect(';'); return () => BRK; }
    if (is('continue')) { take(); expect(';'); return () => CONT; }
    if (is('return')) {
      take();
      if (is(';')) { take(); return (sc) => { sc.rt.retval = undefined; return RET; }; }
      const e = parseExpr(); expect(';');
      return (sc) => { sc.rt.retval = e(sc); return RET; };
    }
    const s = parseSimple(); expect(';');
    return s;
  }

  function callFn(name, vals, sc) {
    const f = fns.get(name), scope = { vars: new Map(), up: null, rt: sc.rt };
    f.params.forEach((pn, i) => scope.vars.set(pn, vals[i]));
    const r = f.body(scope);
    if (r === RET) { const v = sc.rt.retval; sc.rt.retval = undefined; return v; }
    return undefined;
  }

  // ---- top level ----
  while (p < toks.length) {
    if (is('precision')) { while (!is(';')) take(); take(); continue; }
    if (is('struct')) {
      take(); const name = take().v, fields = []; expect('{');
      while (!is('}')) { const type = take().v, f = take().v; fields.push([type, f]); expect(';'); }
      take(); expect(';'); structs.set(name, fields); continue;
    }
    if (is('invariant')) { while (!is(';')) take(); take(); continue; }
    if (is('layout')) { take(); expect('('); while (!is(')')) take(); take(); }
    const quals = [];
    while (QUAL.has(peek().v)) quals.push(take().v);
    const type = take().v, name = take().v;
    if (is('(')) {   // a function
      take();
      const params = [];
      while (!is(')')) { while (QUAL.has(peek().v)) take(); take(); params.push(take().v); if (is(',')) take(); }
      take();
      fns.set(name, { params, body: parseBlock() });
      continue;
    }
    if (quals.includes('const')) { expect('='); const e = parseExpr(); expect(';'); let v = e({ vars: new Map(), up: null, rt: { natives: {}, globals, attrs: {}, uniforms: {} } }); if (type === 'int') v = Math.trunc(v); consts.set(name, v); continue; }
    expect(';');
    if (quals.includes('out')) { outs.add(name); globals.set(name, 0); } else if (quals.includes('uniform')) uniformNames.add(name); else if (quals.includes('in')) attrNames.add(name);
  }
  if (!fns.has('main')) throw new Error('glsl-eval: no main');
  return {
    outs: [...outs], attrs: [...attrNames], uniforms: [...uniformNames], fns: [...fns.keys()],
    run({ attrs = {}, uniforms = {}, natives = {} }) {
      const rt = { natives, attrs, uniforms, globals: new Map([['gl_Position', [0, 0, 0, 1]], ...[...outs].map((o) => [o, 0])]), retval: undefined };
      callFn('main', [], { vars: new Map(), up: null, rt });
      const res = {};
      for (const [k, v] of rt.globals) res[k] = v;
      return res;
    },
  };
}
