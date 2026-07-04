// ============================================================
// CineScript — the CineStream Addon language
// ------------------------------------------------------------
// A small, complete, SAFE scripting language interpreted in a
// sandbox. No eval, no DOM access, no globals — addons can only
// talk to the app through the whitelisted host API.
//
// Features: let/const, functions, if/else, while, for-in, arrays,
// objects, arithmetic/logic operators, member & index access,
// async host calls (http/tmdb), step limits + network limits.
// ============================================================

// ------------------------- Errors --------------------------

export class CineScriptError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`[CineScript] Line ${line}: ${message}`);
    this.line = line;
  }
}

// ------------------------- Lexer ---------------------------

type TokType =
  | 'num' | 'str' | 'ident' | 'keyword' | 'punct' | 'eof';

interface Token { type: TokType; value: string; line: number; }

const KEYWORDS = new Set([
  'let', 'const', 'fn', 'return', 'if', 'else', 'while', 'for', 'in',
  'break', 'continue', 'true', 'false', 'null',
]);

const PUNCT_2 = ['==', '!=', '<=', '>=', '&&', '||', '+=', '-='];
const PUNCT_1 = '+-*/%=<>!(){}[],.:;'.split('');

function lex(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    // comments: // and #
    if ((c === '/' && src[i + 1] === '/') || c === '#') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // string
    if (c === '"' || c === "'") {
      const quote = c;
      let out = '';
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          const nx = src[i + 1];
          if (nx === 'n') out += '\n';
          else if (nx === 't') out += '\t';
          else out += nx;
          i += 2;
        } else {
          if (src[i] === '\n') line++;
          out += src[i]; i++;
        }
      }
      if (i >= n) throw new CineScriptError('Unterminated string', line);
      i++; // closing quote
      tokens.push({ type: 'str', value: out, line });
      continue;
    }
    // number
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let out = '';
      while (i < n && /[0-9.]/.test(src[i])) { out += src[i]; i++; }
      tokens.push({ type: 'num', value: out, line });
      continue;
    }
    // identifier / keyword
    if (/[A-Za-z_\u0600-\u06FF]/.test(c)) {
      let out = '';
      while (i < n && /[A-Za-z0-9_\u0600-\u06FF]/.test(src[i])) { out += src[i]; i++; }
      tokens.push({ type: KEYWORDS.has(out) ? 'keyword' : 'ident', value: out, line });
      continue;
    }
    // punctuation
    const two = src.slice(i, i + 2);
    if (PUNCT_2.includes(two)) { tokens.push({ type: 'punct', value: two, line }); i += 2; continue; }
    if (PUNCT_1.includes(c)) { tokens.push({ type: 'punct', value: c, line }); i++; continue; }
    throw new CineScriptError(`Unexpected character '${c}'`, line);
  }
  tokens.push({ type: 'eof', value: '', line });
  return tokens;
}

// ------------------------- AST -----------------------------

type Node = any; // lightweight tagged objects { kind, line, ... }

// ------------------------- Parser --------------------------

class Parser {
  toks: Token[]; pos = 0;
  constructor(toks: Token[]) { this.toks = toks; }
  peek(o = 0) { return this.toks[Math.min(this.pos + o, this.toks.length - 1)]; }
  next() { return this.toks[this.pos++]; }
  at(type: TokType, value?: string) {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }
  expect(type: TokType, value?: string): Token {
    const t = this.peek();
    if (!this.at(type, value)) {
      throw new CineScriptError(`Expected ${value ?? type} but got '${t.value || t.type}'`, t.line);
    }
    return this.next();
  }
  eat(type: TokType, value?: string): boolean {
    if (this.at(type, value)) { this.next(); return true; }
    return false;
  }

  parseProgram(): Node[] {
    const body: Node[] = [];
    while (!this.at('eof')) body.push(this.parseStatement());
    return body;
  }

  parseBlock(): Node[] {
    this.expect('punct', '{');
    const body: Node[] = [];
    while (!this.at('punct', '}') && !this.at('eof')) body.push(this.parseStatement());
    this.expect('punct', '}');
    return body;
  }

  parseStatement(): Node {
    const t = this.peek();
    if (t.type === 'keyword') {
      switch (t.value) {
        case 'let': case 'const': {
          this.next();
          const name = this.expect('ident').value;
          this.expect('punct', '=');
          const value = this.parseExpression();
          this.eat('punct', ';');
          return { kind: 'let', name, value, line: t.line };
        }
        case 'fn': {
          this.next();
          const name = this.expect('ident').value;
          this.expect('punct', '(');
          const params: string[] = [];
          while (!this.at('punct', ')')) {
            params.push(this.expect('ident').value);
            if (!this.eat('punct', ',')) break;
          }
          this.expect('punct', ')');
          const body = this.parseBlock();
          return { kind: 'fndef', name, params, body, line: t.line };
        }
        case 'return': {
          this.next();
          let value: Node = null;
          if (!this.at('punct', ';') && !this.at('punct', '}')) value = this.parseExpression();
          this.eat('punct', ';');
          return { kind: 'return', value, line: t.line };
        }
        case 'if': {
          this.next();
          this.eat('punct', '(');
          const test = this.parseExpression();
          this.eat('punct', ')');
          const cons = this.parseBlock();
          let alt: Node[] | null = null;
          if (this.eat('keyword', 'else')) {
            alt = this.at('keyword', 'if') ? [this.parseStatement()] : this.parseBlock();
          }
          return { kind: 'if', test, cons, alt, line: t.line };
        }
        case 'while': {
          this.next();
          this.eat('punct', '(');
          const test = this.parseExpression();
          this.eat('punct', ')');
          const body = this.parseBlock();
          return { kind: 'while', test, body, line: t.line };
        }
        case 'for': {
          this.next();
          const hadParen = this.eat('punct', '(');
          const varName = this.expect('ident').value;
          this.expect('keyword', 'in');
          const iter = this.parseExpression();
          if (hadParen) this.eat('punct', ')');
          const body = this.parseBlock();
          return { kind: 'forin', varName, iter, body, line: t.line };
        }
        case 'break': this.next(); this.eat('punct', ';'); return { kind: 'break', line: t.line };
        case 'continue': this.next(); this.eat('punct', ';'); return { kind: 'continue', line: t.line };
      }
    }
    const expr = this.parseExpression();
    this.eat('punct', ';');
    return { kind: 'exprstmt', expr, line: t.line };
  }

  parseExpression(): Node { return this.parseAssign(); }

  parseAssign(): Node {
    const left = this.parseOr();
    const t = this.peek();
    if (this.at('punct', '=') || this.at('punct', '+=') || this.at('punct', '-=')) {
      const op = this.next().value;
      const right = this.parseAssign();
      if (left.kind !== 'ident' && left.kind !== 'member' && left.kind !== 'index') {
        throw new CineScriptError('Invalid assignment target', t.line);
      }
      return { kind: 'assign', op, target: left, value: right, line: t.line };
    }
    return left;
  }

  parseOr(): Node {
    let left = this.parseAnd();
    while (this.at('punct', '||')) {
      const t = this.next();
      left = { kind: 'logic', op: '||', left, right: this.parseAnd(), line: t.line };
    }
    return left;
  }
  parseAnd(): Node {
    let left = this.parseEquality();
    while (this.at('punct', '&&')) {
      const t = this.next();
      left = { kind: 'logic', op: '&&', left, right: this.parseEquality(), line: t.line };
    }
    return left;
  }
  parseEquality(): Node {
    let left = this.parseComparison();
    while (this.at('punct', '==') || this.at('punct', '!=')) {
      const t = this.next();
      left = { kind: 'binary', op: t.value, left, right: this.parseComparison(), line: t.line };
    }
    return left;
  }
  parseComparison(): Node {
    let left = this.parseAdditive();
    while (this.at('punct', '<') || this.at('punct', '>') || this.at('punct', '<=') || this.at('punct', '>=')) {
      const t = this.next();
      left = { kind: 'binary', op: t.value, left, right: this.parseAdditive(), line: t.line };
    }
    return left;
  }
  parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (this.at('punct', '+') || this.at('punct', '-')) {
      const t = this.next();
      left = { kind: 'binary', op: t.value, left, right: this.parseMultiplicative(), line: t.line };
    }
    return left;
  }
  parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (this.at('punct', '*') || this.at('punct', '/') || this.at('punct', '%')) {
      const t = this.next();
      left = { kind: 'binary', op: t.value, left, right: this.parseUnary(), line: t.line };
    }
    return left;
  }
  parseUnary(): Node {
    const t = this.peek();
    if (this.at('punct', '!') || this.at('punct', '-')) {
      this.next();
      return { kind: 'unary', op: t.value, arg: this.parseUnary(), line: t.line };
    }
    return this.parsePostfix();
  }
  parsePostfix(): Node {
    let expr = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (this.at('punct', '.')) {
        this.next();
        const name = this.expect('ident').value;
        expr = { kind: 'member', object: expr, name, line: t.line };
      } else if (this.at('punct', '[')) {
        this.next();
        const index = this.parseExpression();
        this.expect('punct', ']');
        expr = { kind: 'index', object: expr, index, line: t.line };
      } else if (this.at('punct', '(')) {
        this.next();
        const args: Node[] = [];
        while (!this.at('punct', ')')) {
          args.push(this.parseExpression());
          if (!this.eat('punct', ',')) break;
        }
        this.expect('punct', ')');
        expr = { kind: 'call', callee: expr, args, line: t.line };
      } else break;
    }
    return expr;
  }
  parsePrimary(): Node {
    const t = this.peek();
    if (t.type === 'num') { this.next(); return { kind: 'num', value: parseFloat(t.value), line: t.line }; }
    if (t.type === 'str') { this.next(); return { kind: 'str', value: t.value, line: t.line }; }
    if (t.type === 'keyword') {
      if (t.value === 'true') { this.next(); return { kind: 'bool', value: true, line: t.line }; }
      if (t.value === 'false') { this.next(); return { kind: 'bool', value: false, line: t.line }; }
      if (t.value === 'null') { this.next(); return { kind: 'null', line: t.line }; }
    }
    if (t.type === 'ident') { this.next(); return { kind: 'ident', name: t.value, line: t.line }; }
    if (this.at('punct', '(')) {
      this.next();
      const e = this.parseExpression();
      this.expect('punct', ')');
      return e;
    }
    if (this.at('punct', '[')) {
      this.next();
      const elements: Node[] = [];
      while (!this.at('punct', ']')) {
        elements.push(this.parseExpression());
        if (!this.eat('punct', ',')) break;
      }
      this.expect('punct', ']');
      return { kind: 'array', elements, line: t.line };
    }
    if (this.at('punct', '{')) {
      this.next();
      const entries: { key: string; value: Node }[] = [];
      while (!this.at('punct', '}')) {
        const kt = this.peek();
        let key: string;
        if (kt.type === 'str') { key = kt.value; this.next(); }
        else key = this.expect('ident').value;
        this.expect('punct', ':');
        entries.push({ key, value: this.parseExpression() });
        if (!this.eat('punct', ',')) break;
      }
      this.expect('punct', '}');
      return { kind: 'object', entries, line: t.line };
    }
    throw new CineScriptError(`Unexpected token '${t.value || t.type}'`, t.line);
  }
}

// ---------------------- Interpreter ------------------------

const MAX_OPS = 500_000;

class Env {
  vars = new Map<string, unknown>();
  parent: Env | null;
  constructor(parent: Env | null = null) { this.parent = parent; }
  get(name: string, line: number): unknown {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name, line);
    throw new CineScriptError(`Unknown variable '${name}'`, line);
  }
  set(name: string, value: unknown, line: number): void {
    if (this.vars.has(name)) { this.vars.set(name, value); return; }
    if (this.parent) { this.parent.set(name, value, line); return; }
    throw new CineScriptError(`Cannot assign to undeclared variable '${name}'`, line);
  }
  declare(name: string, value: unknown) { this.vars.set(name, value); }
}

interface ScriptFn { __csfn: true; params: string[]; body: Node[]; closure: Env; }

const BREAK = Symbol('break');
const CONTINUE = Symbol('continue');
class ReturnSignal { constructor(public value: unknown) {} }

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeKey(key: string, line: number) {
  if (FORBIDDEN_KEYS.has(key)) throw new CineScriptError(`Access to '${key}' is not allowed`, line);
}

function truthy(v: unknown): boolean {
  return !(v === false || v === null || v === undefined || v === 0 || v === '');
}

export class Interpreter {
  ops = 0;
  globals = new Env();

  constructor(hostApi: Record<string, unknown>) {
    for (const [k, v] of Object.entries(hostApi)) this.globals.declare(k, v);
  }

  tick(line: number) {
    this.ops++;
    if (this.ops > MAX_OPS) {
      throw new CineScriptError('Addon exceeded execution limit (infinite loop?)', line);
    }
  }

  async run(body: Node[], env: Env = this.globals): Promise<unknown> {
    for (const stmt of body) {
      const result = await this.exec(stmt, env);
      if (result === BREAK || result === CONTINUE || result instanceof ReturnSignal) return result;
    }
    return undefined;
  }

  async exec(node: Node, env: Env): Promise<unknown> {
    this.tick(node.line);
    switch (node.kind) {
      case 'let': env.declare(node.name, await this.eval(node.value, env)); return;
      case 'fndef': {
        const fn: ScriptFn = { __csfn: true, params: node.params, body: node.body, closure: env };
        env.declare(node.name, fn);
        return;
      }
      case 'return': return new ReturnSignal(node.value ? await this.eval(node.value, env) : null);
      case 'break': return BREAK;
      case 'continue': return CONTINUE;
      case 'if': {
        if (truthy(await this.eval(node.test, env))) return this.run(node.cons, new Env(env));
        if (node.alt) return this.run(node.alt, new Env(env));
        return;
      }
      case 'while': {
        while (truthy(await this.eval(node.test, env))) {
          this.tick(node.line);
          const r = await this.run(node.body, new Env(env));
          if (r === BREAK) break;
          if (r instanceof ReturnSignal) return r;
        }
        return;
      }
      case 'forin': {
        const iterable = await this.eval(node.iter, env);
        let items: unknown[];
        if (Array.isArray(iterable)) items = iterable;
        else if (typeof iterable === 'string') items = iterable.split('');
        else if (typeof iterable === 'number') items = Array.from({ length: Math.max(0, Math.floor(iterable)) }, (_, i) => i);
        else if (iterable && typeof iterable === 'object') items = Object.keys(iterable);
        else throw new CineScriptError('Value is not iterable', node.line);
        for (const item of items) {
          this.tick(node.line);
          const scope = new Env(env);
          scope.declare(node.varName, item);
          const r = await this.run(node.body, scope);
          if (r === BREAK) break;
          if (r instanceof ReturnSignal) return r;
        }
        return;
      }
      case 'exprstmt': await this.eval(node.expr, env); return;
      default: throw new CineScriptError(`Unknown statement '${node.kind}'`, node.line);
    }
  }

  async eval(node: Node, env: Env): Promise<any> {
    this.tick(node.line);
    switch (node.kind) {
      case 'num': return node.value;
      case 'str': return node.value;
      case 'bool': return node.value;
      case 'null': return null;
      case 'ident': return env.get(node.name, node.line);
      case 'array': {
        const out: unknown[] = [];
        for (const el of node.elements) out.push(await this.eval(el, env));
        return out;
      }
      case 'object': {
        const out: Record<string, unknown> = {};
        for (const { key, value } of node.entries) {
          safeKey(key, node.line);
          out[key] = await this.eval(value, env);
        }
        return out;
      }
      case 'unary': {
        const v = await this.eval(node.arg, env);
        if (node.op === '!') return !truthy(v);
        if (node.op === '-') return -(v as number);
        throw new CineScriptError(`Unknown operator '${node.op}'`, node.line);
      }
      case 'logic': {
        const l = await this.eval(node.left, env);
        if (node.op === '&&') return truthy(l) ? await this.eval(node.right, env) : l;
        return truthy(l) ? l : await this.eval(node.right, env);
      }
      case 'binary': {
        const l = await this.eval(node.left, env);
        const r = await this.eval(node.right, env);
        switch (node.op) {
          case '+': return (typeof l === 'string' || typeof r === 'string') ? String(l ?? '') + String(r ?? '') : (l as number) + (r as number);
          case '-': return (l as number) - (r as number);
          case '*': return (l as number) * (r as number);
          case '/': return (l as number) / (r as number);
          case '%': return (l as number) % (r as number);
          case '==': return l === r;
          case '!=': return l !== r;
          case '<': return (l as number) < (r as number);
          case '>': return (l as number) > (r as number);
          case '<=': return (l as number) <= (r as number);
          case '>=': return (l as number) >= (r as number);
        }
        throw new CineScriptError(`Unknown operator '${node.op}'`, node.line);
      }
      case 'member': {
        safeKey(node.name, node.line);
        const obj = await this.eval(node.object, env);
        return this.getMember(obj, node.name, node.line);
      }
      case 'index': {
        const obj = await this.eval(node.object, env);
        const idx = await this.eval(node.index, env);
        if (typeof idx === 'string') safeKey(idx, node.line);
        if (obj === null || obj === undefined) throw new CineScriptError('Cannot index null', node.line);
        if (Array.isArray(obj) || typeof obj === 'string') return (obj as any)[Math.floor(idx as number)] ?? null;
        if (typeof obj === 'object') return Object.prototype.hasOwnProperty.call(obj, String(idx)) ? (obj as any)[String(idx)] : null;
        throw new CineScriptError('Cannot index this value', node.line);
      }
      case 'assign': {
        let value = await this.eval(node.value, env);
        const target = node.target;
        if (node.op !== '=') {
          const current = await this.eval(target, env);
          value = node.op === '+='
            ? ((typeof current === 'string' || typeof value === 'string') ? String(current) + String(value) : (current as number) + (value as number))
            : (current as number) - (value as number);
        }
        if (target.kind === 'ident') { env.set(target.name, value, node.line); return value; }
        if (target.kind === 'member') {
          safeKey(target.name, node.line);
          const obj = await this.eval(target.object, env);
          if (!obj || typeof obj !== 'object') throw new CineScriptError('Cannot set property on this value', node.line);
          (obj as any)[target.name] = value;
          return value;
        }
        if (target.kind === 'index') {
          const obj = await this.eval(target.object, env);
          const idx = await this.eval(target.index, env);
          if (typeof idx === 'string') safeKey(idx, node.line);
          if (!obj || typeof obj !== 'object') throw new CineScriptError('Cannot set index on this value', node.line);
          (obj as any)[typeof idx === 'number' ? Math.floor(idx) : String(idx)] = value;
          return value;
        }
        throw new CineScriptError('Invalid assignment', node.line);
      }
      case 'call': {
        const args: unknown[] = [];
        for (const a of node.args) args.push(await this.eval(a, env));
        // method call keeps `this`-like binding for host objects
        let fn: unknown;
        if (node.callee.kind === 'member') {
          safeKey(node.callee.name, node.line);
          const obj = await this.eval(node.callee.object, env);
          fn = this.getMember(obj, node.callee.name, node.line);
        } else {
          fn = await this.eval(node.callee, env);
        }
        return this.callFunction(fn, args, node.line);
      }
      default: throw new CineScriptError(`Unknown expression '${node.kind}'`, node.line);
    }
  }

  getMember(obj: unknown, name: string, line: number): unknown {
    if (obj === null || obj === undefined) throw new CineScriptError(`Cannot read '${name}' of null`, line);
    if (typeof obj === 'string' || Array.isArray(obj)) {
      if (name === 'length') return obj.length;
      return null;
    }
    if (typeof obj === 'object') {
      return Object.prototype.hasOwnProperty.call(obj, name) ? (obj as any)[name] : null;
    }
    return null;
  }

  async callFunction(fn: unknown, args: unknown[], line: number): Promise<unknown> {
    if (typeof fn === 'function') {
      try {
        return await (fn as (...a: unknown[]) => unknown)(...args);
      } catch (e: any) {
        if (e instanceof CineScriptError) throw e;
        throw new CineScriptError(e?.message || 'Host function failed', line);
      }
    }
    if (fn && typeof fn === 'object' && (fn as ScriptFn).__csfn) {
      const sf = fn as ScriptFn;
      const scope = new Env(sf.closure);
      sf.params.forEach((p, i) => scope.declare(p, args[i] ?? null));
      const r = await this.run(sf.body, scope);
      if (r instanceof ReturnSignal) return r.value;
      return null;
    }
    throw new CineScriptError('Value is not a function', line);
  }
}

// ---------------------- Public API --------------------------

export function parse(source: string): Node[] {
  return new Parser(lex(source)).parseProgram();
}

/** Runs a CineScript program against the provided host API. */
export async function runScript(source: string, hostApi: Record<string, unknown>): Promise<void> {
  const program = parse(source);
  const interp = new Interpreter(hostApi);
  const result = await Promise.race([
    interp.run(program),
    new Promise((_, reject) => setTimeout(() => reject(new CineScriptError('Addon timed out (30s)', 0)), 30_000)),
  ]);
  void result;
}
