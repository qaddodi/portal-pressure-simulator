// A small checker for GLSL ES 3.00 shader sources, for the unit tests: what a real compile (glslangValidator, the driver's) would say
// about the mistakes hand-edited shaders actually get, found without a GPU, a browser or a compiler. It reads the source as tokens,
// follows the blocks, and reports:
//   · braces, brackets and parentheses that do not match;
//   · a name used that is declared nowhere in scope (a typo, a renamed variable, a variable used past its block or its loop);
//   · a function called before it is declared (GLSL needs the declaration first, and bans recursion), or not at all, or with a
//     number of arguments no declaration of it takes;
//   · a name declared twice in the same scope;
//   · a statement that does not end, a `for` whose header is not three parts.
// What it does not do is type-check (a float where an int is wanted, a vec3 times a vec4, a swizzle past the vector's size): those
// still need the real compiler, which this environment does not allow. The lint is for the mistakes above, which are the commonest.
const TYPES = new Set(['void', 'bool', 'int', 'uint', 'float', 'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4',
  'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
  'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DArray', 'sampler2DShadow', 'isampler2D', 'isampler3D', 'usampler2D', 'usampler3D']);
const BUILTINS = new Set(`radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt inversesqrt abs sign floor trunc round roundEven
  ceil fract mod modf min max clamp mix step smoothstep isnan isinf floatBitsToInt floatBitsToUint intBitsToFloat uintBitsToFloat packSnorm2x16 unpackSnorm2x16 packUnorm2x16
  unpackUnorm2x16 packHalf2x16 unpackHalf2x16 length distance dot cross normalize faceforward reflect refract matrixCompMult outerProduct transpose determinant inverse
  lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not textureSize texture textureProj textureLod textureOffset texelFetch texelFetchOffset
  textureProjOffset textureLodOffset textureProjLod textureProjLodOffset textureGrad textureGradOffset textureProjGrad textureProjGradOffset dFdx dFdy fwidth`.split(/\s+/));
const BUILTIN_VARS = ['gl_FragCoord', 'gl_FragDepth', 'gl_FrontFacing', 'gl_PointCoord', 'gl_Position', 'gl_PointSize', 'gl_VertexID', 'gl_InstanceID'];
const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'discard', 'true', 'false']);
const QUALIFIERS = new Set(['const', 'uniform', 'in', 'out', 'inout', 'highp', 'mediump', 'lowp', 'flat', 'smooth', 'centroid', 'invariant']);
const TOKEN = /\s+|(?<num>0[xX][0-9a-fA-F]+[uU]?|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fFuU]?)|(?<id>[A-Za-z_]\w*)|(?<op><<=|>>=|&&|\|\||\^\^|==|!=|<=|>=|\+\+|--|\+=|-=|\*=|\/=|%=|<<|>>|&=|\|=|\^=|[{}()[\];,.?:+\-*/%<>=!~&|^])/gy;

function tokenize(src, problems) {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    if (/^\s*#/.test(line)) { if (!/^\s*#version 300 es\s*$/.test(line)) problems.push(`line ${i + 1}: a directive the lint does not follow: ${line.trim()}`); return; }
    TOKEN.lastIndex = 0;
    let m;
    while (TOKEN.lastIndex < line.length) {
      const at = TOKEN.lastIndex;
      m = TOKEN.exec(line);
      if (!m) { problems.push(`line ${i + 1}: cannot read "${line.slice(at, at + 12)}"`); break; }
      if (m.groups.num) out.push({ t: 'num', v: m[0], line: i + 1 });
      else if (m.groups.id) out.push({ t: 'id', v: m[0], line: i + 1 });
      else if (m.groups.op) out.push({ t: 'op', v: m[0], line: i + 1 });
    }
  });
  return out;
}

/** Lints a GLSL ES 3.00 source; returns the list of problems (empty: none found). */
export function lintGLSL(src) {
  const problems = [];
  const toks = tokenize(src, problems);
  if (!/^\s*#version 300 es\s*\n/.test(src)) problems.push('the first line is not "#version 300 es"');
  let p = 0;
  const scopes = [new Map(BUILTIN_VARS.map((n) => [n, 'builtin']))];   // name → type word
  const structs = new Set();
  const fns = new Map();        // name → Set of arities
  const err = (msg, tk = toks[Math.min(p, toks.length - 1)]) => problems.push(`line ${tk ? tk.line : '?'}: ${msg}`);
  const peek = (k = 0) => toks[p + k];
  const is = (v, k = 0) => toks[p + k]?.v === v && toks[p + k].t !== 'num';
  const take = () => toks[p++];
  const expect = (v) => { if (is(v)) return take(); err(`expected "${v}" but found "${toks[p]?.v ?? 'the end'}"`); return null; };
  const isType = (v) => TYPES.has(v) || structs.has(v);
  const lookup = (name) => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(name)) return scopes[i].get(name); return undefined; };
  const declare = (name, type, tk) => {
    const s = scopes[scopes.length - 1];
    if (s.has(name)) err(`"${name}" is declared twice in the same scope`, tk);
    s.set(name, type);
  };
  // Reads tokens up to (not including) a terminator at bracket depth 0, returning them. stops: the terminators' values.
  function until(stops) {
    const start = p; let d = 0;
    while (p < toks.length) {
      const v = toks[p].t === 'op' ? toks[p].v : '';
      if (d === 0 && stops.includes(v)) break;
      if (v === '(' || v === '[' || v === '{') d++;
      else if (v === ')' || v === ']' || v === '}') { if (d === 0) break; d--; }
      p++;
    }
    return toks.slice(start, p);
  }
  // The names an expression uses, checked against the scopes.
  function checkExpr(ex) {
    for (let i = 0; i < ex.length; i++) {
      const tk = ex[i];
      // Two operands side by side: a statement that did not end, or an operator left out.
      const nx = ex[i + 1], operandEnd = tk.t === 'id' || tk.t === 'num' || (tk.t === 'op' && (tk.v === ')' || tk.v === ']'));
      if (nx && operandEnd && (nx.t === 'id' || nx.t === 'num') && !(tk.t === 'id' && KEYWORDS.has(tk.v))) err(`"${tk.v}" and "${nx.v}" are side by side: an operator or a ";" is missing`, tk);
      if (tk.t !== 'id') continue;
      const prev = ex[i - 1], next = ex[i + 1];
      if (prev && prev.t === 'op' && prev.v === '.') continue;   // a field or a swizzle
      if (KEYWORDS.has(tk.v)) continue;
      if (next && next.t === 'op' && next.v === '(') {
        if (isType(tk.v) || BUILTINS.has(tk.v)) continue;
        const ar = fns.get(tk.v);
        if (!ar) { err(`"${tk.v}" is called but no function of that name is declared above this`, tk); continue; }
        let d = 0, commas = 0, any = false;
        for (let j = i + 2; j < ex.length; j++) {
          const v = ex[j].t === 'op' ? ex[j].v : '';
          if (v === '(' || v === '[') d++;
          else if (v === ')' || v === ']') { if (d === 0) break; d--; } else if (v === ',' && d === 0) commas++;
          if (!(d === 0 && v === ')')) any = true;
        }
        const n = any ? commas + 1 : 0;
        if (!ar.has(n)) err(`"${tk.v}" is called with ${n} argument${n === 1 ? '' : 's'}; it is declared with ${[...ar].join(' or ')}`, tk);
        continue;
      }
      if (isType(tk.v)) continue;   // (an array constructor's type: float[3](…))
      if (lookup(tk.v) === undefined) err(`"${tk.v}" is not declared in scope`, tk);
    }
  }
  const skipQualifiers = () => { let any = false; while (peek() && peek().t === 'id' && QUALIFIERS.has(peek().v)) { take(); any = true; } return any; };
  const startsDecl = () => {
    let k = 0;
    while (peek(k) && peek(k).t === 'id' && QUALIFIERS.has(peek(k).v)) k++;
    return peek(k)?.t === 'id' && isType(peek(k).v) && peek(k + 1)?.t === 'id' && !KEYWORDS.has(peek(k + 1).v);
  };
  // `qualifiers TYPE name[N] = init, name2 …;` (the `;` is taken).
  function declaration() {
    skipQualifiers();
    const type = take().v;
    for (;;) {
      const nm = take();
      if (nm?.t !== 'id') { err('a name was expected in the declaration', nm); return; }
      declare(nm.v, type, nm);
      while (is('[')) { take(); checkExpr(until([']'])); expect(']'); }
      if (is('=')) { take(); checkExpr(until([',', ';'])); }
      if (is(',')) { take(); continue; }
      break;
    }
    expect(';');
  }
  function statement() {
    const tk = peek();
    if (!tk) { err('the source ends inside a block'); return; }
    if (is('{')) { take(); scopes.push(new Map()); while (peek() && !is('}')) statement(); expect('}'); scopes.pop(); return; }
    if (tk.t === 'id' && tk.v === 'for') {
      take(); expect('('); scopes.push(new Map());
      if (!is(';')) { if (startsDecl()) declaration(); else { checkExpr(until([';'])); expect(';'); } } else take();
      if (!is(';')) checkExpr(until([';'])); expect(';');
      if (!is(')')) checkExpr(until([')'])); expect(')');
      statement(); scopes.pop(); return;
    }
    if (tk.t === 'id' && tk.v === 'if') {
      take(); expect('('); checkExpr(until([')'])); expect(')'); statement();
      if (peek()?.v === 'else' && peek().t === 'id') { take(); statement(); }
      return;
    }
    if (tk.t === 'id' && tk.v === 'while') { take(); expect('('); checkExpr(until([')'])); expect(')'); statement(); return; }
    if (tk.t === 'id' && (tk.v === 'switch' || tk.v === 'do')) { err(`"${tk.v}" is not followed by the lint`); take(); return; }
    if (tk.t === 'id' && (tk.v === 'break' || tk.v === 'continue' || tk.v === 'discard')) { take(); expect(';'); return; }
    if (tk.t === 'id' && tk.v === 'return') { take(); if (!is(';')) checkExpr(until([';'])); expect(';'); return; }
    if (is(';')) { take(); return; }
    if (startsDecl()) { declaration(); return; }
    checkExpr(until([';'])); expect(';');
  }
  // The top level: declarations, structs, precision statements and functions.
  while (p < toks.length) {
    const tk = peek();
    if (is('precision')) { until([';']); expect(';'); continue; }
    if (is('struct')) {
      take(); const nm = take(); structs.add(nm?.v);
      expect('{'); until(['}']); expect('}');
      if (peek()?.t === 'id') { declare(take().v, nm.v, nm); }
      expect(';'); continue;
    }
    if (is('layout')) { take(); expect('('); until([')']); expect(')'); continue; }
    let k = 0;
    while (peek(k)?.t === 'id' && QUALIFIERS.has(peek(k).v)) k++;
    if (!(peek(k)?.t === 'id' && isType(peek(k).v))) { err(`unexpected "${tk.v}" at the top level`); take(); continue; }
    // A function: TYPE name ( params ) { body } or a prototype ending in ;
    if (peek(k + 1)?.t === 'id' && peek(k + 2)?.v === '(' ) {
      skipQualifiers(); take();
      const name = take();
      expect('(');
      const params = [];
      scopes.push(new Map());
      if (is('void') && peek(1)?.v === ')') take();
      while (!is(')') && peek()) {
        skipQualifiers();
        const ty = take();
        if (!ty || ty.t !== 'id' || !isType(ty.v)) { err('a parameter type was expected', ty); break; }
        const pn = take();
        if (pn?.t !== 'id') { err('a parameter name was expected', pn); break; }
        declare(pn.v, ty.v, pn); params.push(pn.v);
        while (is('[')) { take(); until([']']); expect(']'); }
        if (is(',')) take(); else break;
      }
      expect(')');
      if (is('{')) {
        take();
        scopes.push(new Map());
        while (peek() && !is('}')) statement();
        expect('}');
        scopes.pop();
      } else expect(';');
      scopes.pop();
      if (!fns.has(name.v)) fns.set(name.v, new Set());
      fns.get(name.v).add(params.length);   // (declared from here down: a call in its own body, above, was flagged)
      continue;
    }
    declaration();
  }
  if (scopes.length !== 1) problems.push('a block was left open');
  return problems;
}

/** The names a shader declares as uniforms (arrays by their base name). */
export function uniformsOf(src) {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const out = [];
  for (const m of text.matchAll(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+([^;]+);/g)) {
    for (const part of m[1].split(',')) out.push(part.trim().replace(/\[.*$/, ''));
  }
  return out;
}
