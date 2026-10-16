// Reads a presentation deck written as a .js file (the format of src/ui/decks/*.js, see
// docs/deck-authoring-guide.md) without running it. The text is parsed and evaluated by a small
// interpreter that knows only data: const declarations, objects, arrays, strings and template
// literals, numbers, spreads, `+ - * /`, comparisons, `? :`, arrow functions with an expression
// body, and the array methods map, filter, flatMap, concat, slice, join and includes. Nothing in
// the file can reach the page (no globals, no `this`, no prototypes), so a shared deck file is safe
// to import. mi, mo, mn, sub and frac (the MathML helpers the decks use for eq) are built in.
//
//   parseDeckSource(text) → the deck object (plain data), or throws an Error whose message says
//                           what was wrong and on which line.

const BUILTINS = {
  mi: (x) => `<mi>${x}</mi>`, mo: (x) => `<mo>${x}</mo>`, mn: (x) => `<mn>${x}</mn>`,
  sub: (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`,
  frac: (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`,
};
const ARRAY_METHODS = new Set(['map', 'filter', 'flatMap', 'concat', 'slice', 'join', 'includes', 'some', 'every', 'find']);
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_STEPS = 2e6, MAX_DEPTH = 200, MAX_LEN = 1e6;

class DeckError extends Error {}
const fail = (msg, line) => { throw new DeckError(line ? `Line ${line}: ${msg}` : msg); };

// ── Tokens ──
const PUNCT = ['...', '=>', '===', '!==', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '{', '}', '[', ']', '(', ')', ',', ':', ';', '.', '=', '?', '+', '-', '*', '/', '%', '<', '>', '!'];
function tokenize(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e < 0) fail('a comment is not closed', line);
      line += (src.slice(i, e).match(/\n/g) || []).length; i = e + 2; continue;
    }
    if (c === "'" || c === '"') {
      const at = line; let s = ''; i++;
      while (true) {
        if (i >= n || src[i] === '\n') fail('a string is not closed', at);
        if (src[i] === c) { i++; break; }
        if (src[i] === '\\') { const r = escape(src, i + 1, at); s += r.s; i = r.i; continue; }
        s += src[i++];
      }
      out.push({ t: 'str', v: s, line: at }); continue;
    }
    if (c === '`') {
      // A template: alternating literal parts and the source of each ${…}, tokenized recursively.
      const at = line, parts = [], exprs = []; let s = ''; i++;
      while (true) {
        if (i >= n) fail('a template string is not closed', at);
        const d = src[i];
        if (d === '`') { i++; break; }
        if (d === '\\') { const r = escape(src, i + 1, at); s += r.s; i = r.i; continue; }
        if (d === '$' && src[i + 1] === '{') {
          parts.push(s); s = '';
          let depth = 1, j = i + 2;
          const exprLine = line;
          while (j < n && depth) {
            const e = src[j];
            if (e === '{') depth++;
            else if (e === '}') depth--;
            else if (e === '\n') line++;
            else if (e === "'" || e === '"' || e === '`') { const q = e; j++; while (j < n && src[j] !== q) { if (src[j] === '\\') j++; j++; } }
            j++;
          }
          if (depth) fail('a ${…} in a template is not closed', at);
          exprs.push(tokenize(src.slice(i + 2, j - 1)).map((tk) => ({ ...tk, line: tk.line + exprLine - 1 })));
          i = j; continue;
        }
        if (d === '\n') line++;
        s += d; i++;
      }
      parts.push(s);
      out.push({ t: 'tpl', parts, exprs, line: at }); continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      const m = /^(?:0[xX][0-9a-fA-F_]+|(?:[0-9][0-9_]*)?\.?[0-9_]*(?:[eE][+-]?[0-9]+)?)/.exec(src.slice(i));
      const v = Number(m[0].replace(/_/g, ''));
      if (Number.isNaN(v)) fail(`“${m[0]}” is not a number`, line);
      out.push({ t: 'num', v, line }); i += m[0].length; continue;
    }
    if (/[A-Za-z_$À-￿]/.test(c)) {
      const m = /^[A-Za-z0-9_$À-￿]+/.exec(src.slice(i));
      out.push({ t: 'id', v: m[0], line }); i += m[0].length; continue;
    }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    if (!p) fail(`unexpected “${c}”`, line);
    out.push({ t: 'p', v: p, line }); i += p.length;
  }
  out.push({ t: 'eof', line });
  return out;
}
function escape(src, i, line) {
  const c = src[i];
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '' };
  if (c in simple) return { s: simple[c], i: i + 1 };
  if (c === 'u') {
    if (src[i + 1] === '{') { const e = src.indexOf('}', i); return { s: String.fromCodePoint(parseInt(src.slice(i + 2, e), 16)), i: e + 1 }; }
    const hex = src.slice(i + 1, i + 5);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('a \\u escape is not valid', line);
    return { s: String.fromCharCode(parseInt(hex, 16)), i: i + 5 };
  }
  if (c === 'x') return { s: String.fromCharCode(parseInt(src.slice(i + 1, i + 3), 16)), i: i + 3 };
  return { s: c, i: i + 1 };
}

// ── Parser (to a small tree) ──
function parser(toks) {
  let k = 0;
  const peek = (o = 0) => toks[k + o];
  const is = (v, o = 0) => toks[k + o].t === 'p' && toks[k + o].v === v;
  const isId = (v, o = 0) => toks[k + o].t === 'id' && toks[k + o].v === v;
  const next = () => toks[k++];
  const want = (v) => { if (!is(v)) fail(`expected “${v}” but found ${show(peek())}`, peek().line); return next(); };
  const show = (tk) => (tk.t === 'eof' ? 'the end of the file' : tk.t === 'str' ? 'a string' : tk.t === 'tpl' ? 'a template' : `“${tk.v}”`);

  function program() {
    const body = [];
    while (peek().t !== 'eof') {
      if (is(';')) { next(); continue; }
      if (isId('import')) fail('import is not supported: put everything the deck needs in the one file', peek().line);
      let exported = false, dflt = false;
      const line = peek().line;
      if (isId('export')) {
        next(); exported = true;
        if (isId('default')) { next(); dflt = true; }
      }
      if (dflt) { body.push({ kind: 'default', expr: expr(), line }); continue; }
      if (isId('const') || isId('let') || isId('var')) {
        next();
        do {
          const name = peek();
          if (name.t !== 'id') fail(`expected a name but found ${show(name)}`, name.line);
          next(); want('=');
          body.push({ kind: 'const', name: name.v, expr: expr(), exported, line: name.line });
        } while (is(',') && next());
        continue;
      }
      if (isId('function')) fail('function declarations are not supported: write const f = (x) => …', line);
      fail(`only const declarations are allowed at the top level, found ${show(peek())}`, line);
    }
    return body;
  }
  function expr() { return arrowOr(); }
  function arrowOr() {
    // (a, b) => body   |   a => body
    if (peek().t === 'id' && is('=>', 1)) { const p = next().v; next(); return { k: 'fn', params: [p], body: arrowBody() }; }
    if (is('(')) {
      let j = k + 1, params = [];
      if (toks[j].t === 'p' && toks[j].v === ')') j++;
      else {
        while (toks[j].t === 'id') { params.push(toks[j].v); j++; if (toks[j].t === 'p' && toks[j].v === ',') j++; else break; }
        if (toks[j].t === 'p' && toks[j].v === ')') j++; else params = null;
      }
      if (params && toks[j].t === 'p' && toks[j].v === '=>') { k = j + 1; return { k: 'fn', params, body: arrowBody() }; }
    }
    return cond();
  }
  function arrowBody() {
    if (is('{')) fail('an arrow function needs an expression body: write => ({ … }) for an object', peek().line);
    return expr();
  }
  function cond() {
    const c = binary(0);
    if (!is('?')) return c;
    next(); const a = expr(); want(':'); const b = expr();
    return { k: 'cond', c, a, b };
  }
  const LEVELS = [['??'], ['||'], ['&&'], ['===', '!==', '==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];
  function binary(lv) {
    if (lv === LEVELS.length) return unary();
    let l = binary(lv + 1);
    while (peek().t === 'p' && LEVELS[lv].includes(peek().v)) { const op = next(); l = { k: 'bin', op: op.v, l, r: binary(lv + 1), line: op.line }; }
    return l;
  }
  function unary() {
    if (is('-') || is('!') || is('+')) { const op = next().v; return { k: 'un', op, e: unary() }; }
    return postfix(primary());
  }
  function postfix(e) {
    while (true) {
      const line = peek().line;
      if (is('.') || is('?.')) {
        const opt = next().v === '?.';
        if (is('(')) { e = { k: 'call', f: e, args: argList(), opt, line }; continue; }
        const name = next();
        if (name.t !== 'id') fail(`expected a property name after “.”, found ${show(name)}`, name.line);
        e = { k: 'get', o: e, key: { k: 'lit', v: name.v }, opt, line };
      } else if (is('[')) { next(); const key = expr(); want(']'); e = { k: 'get', o: e, key, line }; }
      else if (is('(')) e = { k: 'call', f: e, args: argList(), line };
      else return e;
    }
  }
  function argList() {
    want('('); const args = [];
    while (!is(')')) { if (is('...')) { next(); args.push({ k: 'spread', e: expr() }); } else args.push(expr()); if (!is(')')) want(','); }
    next(); return args;
  }
  function primary() {
    const tk = peek();
    if (tk.t === 'num' || tk.t === 'str') { next(); return { k: 'lit', v: tk.v }; }
    if (tk.t === 'tpl') { next(); return { k: 'tpl', parts: tk.parts, exprs: tk.exprs.map((ts) => { const p = parser(ts); const e = p.expr(); p.end(); return e; }) }; }
    if (tk.t === 'id') {
      next();
      if (tk.v === 'true') return { k: 'lit', v: true };
      if (tk.v === 'false') return { k: 'lit', v: false };
      if (tk.v === 'null') return { k: 'lit', v: null };
      if (tk.v === 'undefined') return { k: 'lit', v: undefined };
      if (['new', 'this', 'function', 'class', 'await', 'async', 'yield', 'delete', 'typeof', 'void', 'import'].includes(tk.v)) fail(`“${tk.v}” is not supported in a deck file`, tk.line);
      return { k: 'name', v: tk.v, line: tk.line };
    }
    if (is('(')) { next(); const e = expr(); want(')'); return e; }
    if (is('[')) {
      next(); const items = [];
      while (!is(']')) { if (is('...')) { next(); items.push({ k: 'spread', e: expr() }); } else if (is(',')) { items.push({ k: 'lit', v: undefined }); next(); continue; } else items.push(expr()); if (!is(']')) want(','); }
      next(); return { k: 'arr', items };
    }
    if (is('{')) {
      next(); const props = [];
      while (!is('}')) {
        if (is('...')) { next(); props.push({ spread: expr() }); }
        else {
          const kt = next(); let key;
          if (kt.t === 'id' || kt.t === 'str') key = { k: 'lit', v: kt.v };
          else if (kt.t === 'num') key = { k: 'lit', v: String(kt.v) };
          else if (kt.t === 'p' && kt.v === '[') { key = expr(); want(']'); }
          else fail(`expected a property name, found ${show(kt)}`, kt.line);
          if (is(':')) { next(); props.push({ key, v: expr(), line: kt.line }); }
          else if (kt.t === 'id' && (is(',') || is('}'))) props.push({ key, v: { k: 'name', v: kt.v, line: kt.line }, line: kt.line });
          else if (is('(')) fail('methods are not supported in a deck file', kt.line);
          else fail(`expected “:” after “${kt.v}”`, kt.line);
        }
        if (!is('}')) want(',');
      }
      next(); return { k: 'obj', props };
    }
    fail(`unexpected ${show(tk)}`, tk.line);
  }
  const end = () => { if (peek().t !== 'eof') fail(`unexpected ${show(peek())}`, peek().line); };
  return { program, expr, end };
}

// ── Evaluation ──
// Functions written in the file become Fn objects that only this interpreter can call; the built-ins are
// marked so. Values that leave are plain data.
class Fn { constructor(params, body, scope) { this.params = params; this.body = body; this.scope = scope; } }
const isFn = (v) => v instanceof Fn || (typeof v === 'function' && Object.values(BUILTINS).includes(v));

function evaluator() {
  let steps = 0, depth = 0;
  const tick = () => { if (++steps > MAX_STEPS) fail('the deck takes too long to evaluate'); };
  function lookup(scope, name, line) {
    for (let s = scope; s; s = s.parent) if (Object.prototype.hasOwnProperty.call(s.vars, name)) {
      const v = s.vars[name];
      if (v === TDZ) fail(`“${name}” is used before it is defined`, line);
      return v;
    }
    if (Object.prototype.hasOwnProperty.call(BUILTINS, name)) return BUILTINS[name];
    fail(`“${name}” is not defined`, line);
  }
  function call(f, args, line) {
    if (typeof f === 'function' && isFn(f)) return f(...args.map((a) => text(a, line)));
    if (!(f instanceof Fn)) fail('that is not a function', line);
    if (++depth > MAX_DEPTH) fail('functions call each other too deeply', line);
    const vars = Object.create(null);
    f.params.forEach((p, i) => { vars[p] = args[i]; });
    try { return ev(f.body, { vars, parent: f.scope }); } finally { depth--; }
  }
  const text = (v, line) => {
    if (v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    fail('only text and numbers can go into a string', line);
  };
  function ev(n, scope) {
    tick();
    switch (n.k) {
      case 'lit': return n.v;
      case 'name': return lookup(scope, n.v, n.line);
      case 'tpl': return n.parts.reduce((s, p, i) => s + p + (i < n.exprs.length ? text(ev(n.exprs[i], scope), n.line) : ''), '');
      case 'fn': return new Fn(n.params, n.body, scope);
      case 'arr': {
        const out = [];
        for (const it of n.items) {
          if (it.k === 'spread') { const v = ev(it.e, scope); if (!Array.isArray(v)) fail('only an array can be spread into an array'); out.push(...v); }
          else out.push(ev(it, scope));
        }
        if (out.length > MAX_LEN) fail('an array is too long');
        return out;
      }
      case 'obj': {
        const out = {};
        for (const p of n.props) {
          if (p.spread) {
            const v = ev(p.spread, scope);
            if (v == null) continue;
            if (typeof v !== 'object' || Array.isArray(v)) fail('only an object can be spread into an object', p.line);
            for (const [kk, vv] of Object.entries(v)) put(out, kk, vv, p.line);
          } else put(out, String(ev(p.key, scope)), ev(p.v, scope), p.line);
        }
        return out;
      }
      case 'get': {
        const o = ev(n.o, scope);
        if (o == null) { if (n.opt) return undefined; fail('cannot read a property of nothing', n.line); }
        const key = ev(n.key, scope);
        if (typeof key !== 'string' && typeof key !== 'number') fail('a property name must be text or a number', n.line);
        if (BAD_KEYS.has(String(key))) fail(`“${key}” is not allowed`, n.line);
        if ((Array.isArray(o) || typeof o === 'string') && key === 'length') return o.length;
        if (Array.isArray(o) && ARRAY_METHODS.has(key)) return { method: key, of: o };
        if (typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
        if (typeof o === 'string' && typeof key === 'number') return o[key];
        return undefined;
      }
      case 'call': {
        const f = ev(n.f, scope);
        if (f == null && n.opt) return undefined;
        const args = [];
        for (const a of n.args) { if (a.k === 'spread') { const v = ev(a.e, scope); if (!Array.isArray(v)) fail('only an array can be spread into a call', n.line); args.push(...v); } else args.push(ev(a, scope)); }
        if (f && f.method) return arrayMethod(f.method, f.of, args, n.line);
        return call(f, args, n.line);
      }
      case 'cond': return ev(n.c, scope) ? ev(n.a, scope) : ev(n.b, scope);
      case 'un': { const v = ev(n.e, scope); return n.op === '-' ? -num(v) : n.op === '+' ? num(v) : !v; }
      case 'bin': {
        if (n.op === '&&') { const l = ev(n.l, scope); return l ? ev(n.r, scope) : l; }
        if (n.op === '||') { const l = ev(n.l, scope); return l || ev(n.r, scope); }
        if (n.op === '??') { const l = ev(n.l, scope); return l ?? ev(n.r, scope); }
        const l = ev(n.l, scope), r = ev(n.r, scope);
        switch (n.op) {
          case '+': if (typeof l === 'string' || typeof r === 'string') return text(l, n.line) + text(r, n.line); return num(l) + num(r);
          case '-': return num(l) - num(r);
          case '*': return num(l) * num(r);
          case '/': return num(l) / num(r);
          case '%': return num(l) % num(r);
          case '===': case '==': return l === r;
          case '!==': case '!=': return l !== r;
          case '<': return prim(l) < prim(r);
          case '>': return prim(l) > prim(r);
          case '<=': return prim(l) <= prim(r);
          case '>=': return prim(l) >= prim(r);
        }
      }
    }
    fail('unsupported expression');
  }
  const num = (v) => { if (typeof v !== 'number' && typeof v !== 'boolean' && v != null) fail('arithmetic needs numbers'); return Number(v); };
  const prim = (v) => { if (v !== null && typeof v === 'object') fail('only numbers and text can be compared'); return v; };
  function put(o, key, v, line) {
    if (BAD_KEYS.has(key)) fail(`the property name “${key}” is not allowed`, line);
    o[key] = v;
  }
  function arrayMethod(m, a, args, line) {
    const cb = (f) => (x, i) => call(f, [x, i], line);
    switch (m) {
      case 'map': return a.map(cb(args[0]));
      case 'filter': return a.filter(cb(args[0]));
      case 'some': return a.some(cb(args[0]));
      case 'every': return a.every(cb(args[0]));
      case 'find': return a.find(cb(args[0]));
      case 'flatMap': return a.flatMap(cb(args[0]));
      case 'concat': return a.concat(...args);
      case 'slice': return a.slice(args[0], args[1]);
      case 'join': return a.map((x) => text(x, line)).join(args[0] === undefined ? ',' : text(args[0], line));
      case 'includes': return a.includes(args[0]);
    }
  }
  return { ev };
}
const TDZ = Symbol('tdz');

// The result must be plain data: no functions anywhere inside.
function plain(v, path = 'deck') {
  if (isFn(v) || (v && v.method)) fail(`${path} is a function, not data`);
  if (Array.isArray(v)) return v.map((x, i) => plain(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x, `${path}.${k}`)]));
  if (typeof v === 'number' && !Number.isFinite(v)) fail(`${path} is not a finite number`);
  return v;
}

/** Parses a deck .js (or a deck as JSON) and returns the deck object; throws an Error saying what was wrong. */
export function parseDeckSource(src) {
  if (typeof src !== 'string' || !src.trim()) throw new DeckError('The file is empty.');
  if (src.length > 2e6) throw new DeckError('The file is too large for a deck.');
  let deck;
  const t = src.trim();
  if (t[0] === '{') {
    try { deck = JSON.parse(t); } catch { /* not JSON: read it as an object literal below */ }
    if (!deck) deck = plain(evaluator().ev((() => { const p = parser(tokenize(t)); const e = p.expr(); p.end(); return e; })(), { vars: Object.create(null), parent: null }));
  } else {
    const body = parser(tokenize(src)).program();
    const vars = Object.create(null);
    for (const st of body) if (st.kind === 'const') {
      if (st.name in vars) fail(`“${st.name}” is defined twice`, st.line);
      vars[st.name] = TDZ;
    }
    const scope = { vars, parent: null }, { ev } = evaluator();
    const exported = []; let dflt;
    for (const st of body) {
      const v = ev(st.expr, scope);
      if (st.kind === 'default') dflt = v;
      else { vars[st.name] = v; if (st.exported) exported.push(v); }
    }
    const looks = (v) => v && typeof v === 'object' && Array.isArray(v.slides);
    const named = Object.values(vars).filter(looks);
    deck = looks(dflt) ? dflt : exported.find(looks) || named[named.length - 1];
    if (!deck) fail('No deck found: the file should export an object with a slides array, e.g. export const MY_DECK = { title, slides: [ … ] }.');
    deck = plain(deck);
  }
  return checkDeck(deck);
}

/** The minimum a deck needs to be presented. Returns the deck. */
export function checkDeck(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) fail('A deck must be an object.');
  if (typeof d.title !== 'string' || !d.title.trim()) fail('The deck needs a title.');
  if (!Array.isArray(d.slides) || !d.slides.length) fail('The deck needs at least one slide in slides.');
  d.slides.forEach((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) fail(`Slide ${i + 1} is not an object.`);
    if (typeof s.title !== 'string' || !s.title.trim()) fail(`Slide ${i + 1} needs a title.`);
  });
  return d;
}
