/* pyrun.js — 《的士佬日記》用的迷你 Python 解譯器
 *
 * 目的：直接執行設計文件內的 Python 程式原文，令模擬結果與真正的 Python 一致。
 * 支援的子集：def / global / if-elif-else / while / for…in range / return / pass、
 * 賦值（變量及 a[i]）、+ - * % //、比較、and/or/not、列表、字串、None/True/False、
 * print / range / len。
 * 與 Python 一致的細節：負數索引、IndexError、UnboundLocalError（漏寫 global）、
 * % 的餘數跟除數正負號、[None] * 5。
 *
 * 每執行一行會記錄一個步驟（trace），供動畫使用：
 *   { loc:{src,line}, state:{全域變量快照}, locals:{…}, access:[{name,i,w}],
 *     result, printed }
 */
(function (root) {
  'use strict';

  class PyError extends Error {
    constructor(type, msg, loc) {
      super(type + ': ' + msg);
      this.pyType = type;
      this.pyMsg = msg;
      this.loc = loc || null;
    }
  }
  class StepLimit extends Error {
    constructor(loc) { super('StepLimit'); this.loc = loc; }
  }

  /* ---------- 詞法分析 ---------- */
  function stripComment(text) {
    let q = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '\\') i++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === '#') return text.slice(0, i);
    }
    return text;
  }

  function tokenize(s, loc) {
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (/[0-9]/.test(c)) {
        let j = i;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
        toks.push({ t: 'num', v: parseInt(s.slice(i, j), 10) });
        i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
        toks.push({ t: 'name', v: s.slice(i, j) });
        i = j; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1, out = '';
        while (j < s.length && s[j] !== c) {
          if (s[j] === '\\') { out += s[j + 1]; j += 2; } else { out += s[j]; j++; }
        }
        if (j >= s.length) throw new PyError('SyntaxError', '字串未完結', loc);
        toks.push({ t: 'str', v: out });
        i = j + 1; continue;
      }
      const two = s.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '//'].includes(two)) {
        toks.push({ t: 'op', v: two }); i += 2; continue;
      }
      if ('+-*%<>=()[],:'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw new PyError('SyntaxError', '不明符號 ' + c, loc);
    }
    return toks;
  }

  const RESERVED = new Set(['and', 'or', 'not', 'if', 'elif', 'else', 'while',
    'for', 'in', 'def', 'return', 'global', 'pass']);

  /* ---------- 運算式剖析 ---------- */
  class ExprParser {
    constructor(toks, loc) { this.t = toks; this.i = 0; this.loc = loc; }
    peek() { return this.t[this.i]; }
    next() { return this.t[this.i++]; }
    isOp(v) { const k = this.peek(); return !!k && k.t === 'op' && k.v === v; }
    isName(v) { const k = this.peek(); return !!k && k.t === 'name' && k.v === v; }
    expect(v) {
      if (!this.isOp(v)) throw new PyError('SyntaxError', '預期 ' + v, this.loc);
      this.i++;
    }
    done() { return this.i >= this.t.length; }
    expr() { return this.or(); }
    or() {
      let l = this.and();
      while (this.isName('or')) { this.i++; l = { k: 'or', l, r: this.and() }; }
      return l;
    }
    and() {
      let l = this.not();
      while (this.isName('and')) { this.i++; l = { k: 'and', l, r: this.not() }; }
      return l;
    }
    not() {
      if (this.isName('not')) { this.i++; return { k: 'not', e: this.not() }; }
      return this.cmp();
    }
    cmp() {
      let l = this.add();
      const ops = ['==', '!=', '<', '>', '<=', '>='];
      while (this.peek() && this.peek().t === 'op' && ops.includes(this.peek().v)) {
        const op = this.next().v;
        l = { k: 'bin', op, l, r: this.add() };
      }
      return l;
    }
    add() {
      let l = this.mul();
      while (this.isOp('+') || this.isOp('-')) {
        const op = this.next().v;
        l = { k: 'bin', op, l, r: this.mul() };
      }
      return l;
    }
    mul() {
      let l = this.unary();
      while (this.isOp('*') || this.isOp('%') || this.isOp('//')) {
        const op = this.next().v;
        l = { k: 'bin', op, l, r: this.unary() };
      }
      return l;
    }
    unary() {
      if (this.isOp('-')) { this.i++; return { k: 'neg', e: this.unary() }; }
      if (this.isOp('+')) { this.i++; return this.unary(); }
      return this.postfix();
    }
    postfix() {
      let e = this.atom();
      for (;;) {
        if (this.isOp('(')) {
          this.i++;
          const args = [];
          if (!this.isOp(')')) {
            args.push(this.expr());
            while (this.isOp(',')) { this.i++; args.push(this.expr()); }
          }
          this.expect(')');
          e = { k: 'call', f: e, args };
        } else if (this.isOp('[')) {
          this.i++;
          const idx = this.expr();
          this.expect(']');
          e = { k: 'idx', o: e, i: idx };
        } else break;
      }
      return e;
    }
    atom() {
      const k = this.next();
      if (!k) throw new PyError('SyntaxError', '運算式不完整', this.loc);
      if (k.t === 'num' || k.t === 'str') return { k: 'const', v: k.v };
      if (k.t === 'name') {
        if (k.v === 'None') return { k: 'const', v: null };
        if (k.v === 'True') return { k: 'const', v: true };
        if (k.v === 'False') return { k: 'const', v: false };
        if (RESERVED.has(k.v)) throw new PyError('SyntaxError', '不可在此使用 ' + k.v, this.loc);
        return { k: 'name', n: k.v };
      }
      if (k.t === 'op' && k.v === '(') {
        const e = this.expr(); this.expect(')'); return e;
      }
      if (k.t === 'op' && k.v === '[') {
        const items = [];
        if (!this.isOp(']')) {
          items.push(this.expr());
          while (this.isOp(',')) { this.i++; if (this.isOp(']')) break; items.push(this.expr()); }
        }
        this.expect(']');
        return { k: 'list', items };
      }
      throw new PyError('SyntaxError', '不明的寫法 ' + k.v, this.loc);
    }
  }

  function parseExpr(text, loc) {
    const p = new ExprParser(tokenize(text, loc), loc);
    const e = p.expr();
    if (!p.done()) throw new PyError('SyntaxError', '多餘的符號', loc);
    return e;
  }

  /* ---------- 語句剖析 ---------- */
  function parseProgram(src, srcId) {
    const lines = [];
    String(src).split('\n').forEach((text, idx) => {
      const s = stripComment(text).replace(/\s+$/, '');
      if (!s.trim()) return;
      const indent = s.match(/^ */)[0].length;
      lines.push({ indent, text: s.trim(), loc: { src: srcId, line: idx + 1 } });
    });
    let pos = 0;

    function block(indent) {
      const out = [];
      while (pos < lines.length && lines[pos].indent === indent) out.push(stmt(indent));
      if (pos < lines.length && lines[pos].indent > indent) {
        throw new PyError('IndentationError', '縮排不正確', lines[pos].loc);
      }
      return out;
    }
    function body(indent, loc) {
      if (pos >= lines.length || lines[pos].indent <= indent) {
        throw new PyError('IndentationError', '這裏需要縮排的程式', loc);
      }
      return block(lines[pos].indent);
    }
    function stmt(indent) {
      const L = lines[pos++];
      const t = L.text, loc = L.loc;
      let m;
      if ((m = t.match(/^def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*:$/))) {
        const params = m[2].split(',').map(s => s.trim()).filter(Boolean);
        const b = body(indent, loc);
        return { k: 'def', name: m[1], params, body: b, loc };
      }
      if ((m = t.match(/^if\s+(.*):$/))) {
        const branches = [{ cond: parseExpr(m[1], loc), body: body(indent, loc), loc }];
        let orelse = null, elseLoc = null;
        while (pos < lines.length && lines[pos].indent === indent) {
          const N = lines[pos];
          let mm;
          if ((mm = N.text.match(/^elif\s+(.*):$/))) {
            pos++;
            branches.push({ cond: parseExpr(mm[1], N.loc), body: body(indent, N.loc), loc: N.loc });
          } else if (/^else\s*:$/.test(N.text)) {
            pos++;
            elseLoc = N.loc;
            orelse = body(indent, N.loc);
            break;
          } else break;
        }
        return { k: 'if', branches, orelse, elseLoc, loc };
      }
      if (/^(elif\s|else\s*:)/.test(t)) {
        throw new PyError('SyntaxError', t.split(/[\s:]/)[0] + ' 前面沒有 if', loc);
      }
      if ((m = t.match(/^while\s+(.*):$/))) {
        return { k: 'while', cond: parseExpr(m[1], loc), body: body(indent, loc), loc };
      }
      if ((m = t.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.*):$/))) {
        return { k: 'for', v: m[1], iter: parseExpr(m[2], loc), body: body(indent, loc), loc };
      }
      if ((m = t.match(/^global\s+(.+)$/))) {
        return { k: 'global', names: m[1].split(',').map(s => s.trim()), loc };
      }
      if ((m = t.match(/^return(?:\s+(.*))?$/))) {
        return { k: 'return', e: m[1] ? parseExpr(m[1], loc) : null, loc };
      }
      if (t === 'pass') return { k: 'pass', loc };
      if (t.endsWith(':')) throw new PyError('SyntaxError', '不明的語句', loc);
      // 賦值：找出最外層的單一 '='
      const toks = tokenize(t, loc);
      let depth = 0, eq = -1;
      toks.forEach((k, i) => {
        if (k.t !== 'op') return;
        if (k.v === '(' || k.v === '[') depth++;
        else if (k.v === ')' || k.v === ']') depth--;
        else if (k.v === '=' && depth === 0 && eq < 0) eq = i;
      });
      if (eq >= 0) {
        const tp = new ExprParser(toks.slice(0, eq), loc);
        const target = tp.expr();
        if (!tp.done() || (target.k !== 'name' && target.k !== 'idx')) {
          throw new PyError('SyntaxError', '不能賦值給這個運算式', loc);
        }
        const vp = new ExprParser(toks.slice(eq + 1), loc);
        const value = vp.expr();
        if (!vp.done()) throw new PyError('SyntaxError', '多餘的符號', loc);
        return { k: 'assign', target, value, loc };
      }
      const p = new ExprParser(toks, loc);
      const e = p.expr();
      if (!p.done()) throw new PyError('SyntaxError', '多餘的符號', loc);
      return { k: 'expr', e, loc };
    }

    const prog = block(0);
    if (pos < lines.length) throw new PyError('IndentationError', '縮排不正確', lines[pos].loc);
    return prog;
  }

  // 找出函式內被賦值的名稱（Python 會當作區域變量）及 global 宣告
  function analyzeScope(stmts, assigned, globals) {
    for (const s of stmts) {
      if (s.k === 'assign' && s.target.k === 'name') assigned.add(s.target.n);
      if (s.k === 'for') assigned.add(s.v);
      if (s.k === 'global') s.names.forEach(n => globals.add(n));
      if (s.k === 'def') assigned.add(s.name);
      if (s.k === 'if') {
        s.branches.forEach(b => analyzeScope(b.body, assigned, globals));
        if (s.orelse) analyzeScope(s.orelse, assigned, globals);
      }
      if (s.k === 'while' || s.k === 'for') analyzeScope(s.body, assigned, globals);
    }
  }

  /* ---------- 值的工具 ---------- */
  function typeName(v) {
    if (v === null || v === undefined) return 'NoneType';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return 'int';
    if (typeof v === 'string') return 'str';
    if (Array.isArray(v)) return 'list';
    if (v && v.k === 'fn') return 'function';
    return 'object';
  }
  function fmt(v) {
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (Array.isArray(v)) return '[' + v.map(fmt).join(', ') + ']';
    if (v && v.k === 'fn') return '<function ' + v.def.name + '>';
    return String(v);
  }
  function truthy(v) {
    if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }
  function eq(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((x, i) => eq(x, b[i]));
    }
    if (a === undefined) a = null;
    if (b === undefined) b = null;
    if (typeof a === 'boolean') a = a ? 1 : 0;
    if (typeof b === 'boolean') b = b ? 1 : 0;
    return a === b;
  }
  function deepCopy(v) {
    return Array.isArray(v) ? v.map(deepCopy) : v;
  }

  /* ---------- 解譯器 ---------- */
  class Interp {
    constructor(opts) {
      opts = opts || {};
      this.g = Object.create(null);
      this.output = [];
      this.stepLimit = opts.stepLimit || 20000;
    }

    clone() {
      const c = new Interp({ stepLimit: this.stepLimit });
      for (const k of Object.keys(this.g)) c.g[k] = deepCopy(this.g[k]);
      c.output = this.output.slice();
      return c;
    }

    /* 執行一段程式。傳回 { ok, trace, error, result, output } — 不會拋出例外。 */
    run(src, srcId, opts) {
      opts = opts || {};
      this.trace = opts.trace ? [] : null;
      this.steps = 0;
      this.stepLimit = opts.stepLimit || this.stepLimit;
      this.access = [];
      this.lastResult = undefined;
      this._outSeen = this.output.length;
      const outStart = this.output.length;
      let error = null;
      try {
        const prog = parseProgram(src, srcId || 'main');
        this.execBlock(prog, null);
      } catch (e) {
        if (e instanceof PyError || e instanceof StepLimit) error = e;
        else throw e;
      }
      return {
        ok: !error,
        error,
        trace: this.trace,
        result: this.lastResult,
        output: this.output.slice(outStart),
      };
    }

    /* 計算一個運算式的值（在全域範圍） */
    eval(text) {
      const e = parseExpr(text, { src: 'eval', line: 1 });
      return this.evalExpr(e, null);
    }

    snapshot() {
      const s = {};
      for (const k of Object.keys(this.g)) {
        const v = this.g[k];
        if (v && v.k === 'fn') continue;
        s[k] = deepCopy(v);
      }
      return s;
    }

    nameOf(arr) {
      for (const k of Object.keys(this.g)) if (this.g[k] === arr) return k;
      return null;
    }

    record(loc, frame, extra) {
      this.steps++;
      if (this.steps > this.stepLimit) throw new StepLimit(loc);
      if (this.trace) {
        const step = {
          loc,
          state: this.snapshot(),
          locals: frame ? Object.assign({}, frame.vars) : {},
          fn: frame ? frame.name : null,
          localNames: frame ? Array.from(frame.localNames) : [],
          access: this.access.map(a => ({ name: this.nameOf(a.arr), i: a.i, w: a.w })),
        };
        if (this.output.length > this._outSeen) {
          step.printed = this.output.slice(this._outSeen).join('\n');
          this._outSeen = this.output.length;
        }
        if (extra) Object.assign(step, extra);
        for (const k of Object.keys(step.locals)) step.locals[k] = deepCopy(step.locals[k]);
        this.trace.push(step);
      }
      this.access = [];
    }

    execBlock(stmts, frame) {
      for (const s of stmts) {
        const r = this.exec(s, frame);
        if (r) return r;
      }
      return null;
    }

    exec(s, frame) {
      switch (s.k) {
        case 'def': {
          const assigned = new Set(s.params), globals = new Set();
          analyzeScope(s.body, assigned, globals);
          globals.forEach(n => assigned.delete(n));
          this.setName(s.name, { k: 'fn', def: s, locals: assigned }, frame);
          return null;
        }
        case 'global':
        case 'pass':
          this.record(s.loc, frame);
          return null;
        case 'assign': {
          const v = this.evalExpr(s.value, frame);
          if (s.target.k === 'name') this.setName(s.target.n, v, frame);
          else {
            const o = this.evalExpr(s.target.o, frame);
            const i = this.evalExpr(s.target.i, frame);
            this.setItem(o, i, v, s.loc);
          }
          this.record(s.loc, frame);
          return null;
        }
        case 'expr': {
          const v = this.evalExpr(s.e, frame);
          const extra = {};
          if (!frame) {
            this.lastResult = v;
            if (s.e.k === 'call' && v !== null && v !== undefined) extra.result = fmt(v);
          }
          this.record(s.loc, frame, extra);
          return null;
        }
        case 'if': {
          for (const b of s.branches) {
            const c = truthy(this.evalExpr(b.cond, frame));
            this.record(b.loc, frame, { cond: c });
            if (c) return this.execBlock(b.body, frame);
          }
          if (s.orelse) {
            this.record(s.elseLoc, frame);
            return this.execBlock(s.orelse, frame);
          }
          return null;
        }
        case 'while': {
          for (;;) {
            const c = truthy(this.evalExpr(s.cond, frame));
            this.record(s.loc, frame, { cond: c });
            if (!c) return null;
            const r = this.execBlock(s.body, frame);
            if (r) return r;
          }
        }
        case 'for': {
          const it = this.evalExpr(s.iter, frame);
          if (!Array.isArray(it) && typeof it !== 'string') {
            throw new PyError('TypeError', `'${typeName(it)}' object is not iterable`, s.loc);
          }
          const items = Array.from(it);
          for (const x of items) {
            this.setName(s.v, x, frame);
            this.record(s.loc, frame);
            const r = this.execBlock(s.body, frame);
            if (r) return r;
          }
          this.record(s.loc, frame, { cond: false });
          return null;
        }
        case 'return': {
          if (!frame) throw new PyError('SyntaxError', "'return' outside function", s.loc);
          const v = s.e ? this.evalExpr(s.e, frame) : null;
          this.record(s.loc, frame, { ret: fmt(v) });
          return { ret: v };
        }
      }
      throw new PyError('SyntaxError', '不明語句', s.loc);
    }

    curLoc(e) { return this._loc || null; }

    getName(n, frame) {
      if (frame && frame.localNames.has(n)) {
        if (Object.prototype.hasOwnProperty.call(frame.vars, n)) return frame.vars[n];
        throw new PyError('UnboundLocalError',
          `cannot access local variable '${n}' where it is not associated with a value`, this._loc);
      }
      if (n in this.g) return this.g[n];
      if (n === 'print' || n === 'range' || n === 'len') return { k: 'builtin', n };
      throw new PyError('NameError', `name '${n}' is not defined`, this._loc);
    }

    setName(n, v, frame) {
      if (frame && frame.localNames.has(n)) frame.vars[n] = v;
      else this.g[n] = v;
    }

    normIndex(o, i, write) {
      if (!Array.isArray(o) && typeof o !== 'string') {
        throw new PyError('TypeError', `'${typeName(o)}' object is not subscriptable`, this._loc);
      }
      if (typeof i !== 'number') {
        throw new PyError('TypeError', `list indices must be integers or slices, not ${typeName(i)}`, this._loc);
      }
      let j = i;
      if (j < 0) j += o.length;
      if (j < 0 || j >= o.length) {
        throw new PyError('IndexError', write ? 'list assignment index out of range' : 'list index out of range', this._loc);
      }
      return j;
    }

    setItem(o, i, v, loc) {
      this._loc = loc;
      if (typeof o === 'string') throw new PyError('TypeError', "'str' object does not support item assignment", loc);
      const j = this.normIndex(o, i, true);
      o[j] = v;
      this.access.push({ arr: o, i: j, w: true });
    }

    evalExpr(e, frame) {
      switch (e.k) {
        case 'const': return e.v;
        case 'name': return this.getName(e.n, frame);
        case 'list': return e.items.map(x => this.evalExpr(x, frame));
        case 'neg': {
          const v = this.evalExpr(e.e, frame);
          if (typeof v !== 'number') throw new PyError('TypeError', `bad operand type for unary -: '${typeName(v)}'`, this._loc);
          return -v;
        }
        case 'not': return !truthy(this.evalExpr(e.e, frame));
        case 'and': {
          const l = this.evalExpr(e.l, frame);
          return truthy(l) ? this.evalExpr(e.r, frame) : l;
        }
        case 'or': {
          const l = this.evalExpr(e.l, frame);
          return truthy(l) ? l : this.evalExpr(e.r, frame);
        }
        case 'idx': {
          const o = this.evalExpr(e.o, frame);
          const i = this.evalExpr(e.i, frame);
          const j = this.normIndex(o, i, false);
          if (Array.isArray(o)) this.access.push({ arr: o, i: j, w: false });
          return o[j];
        }
        case 'bin': return this.binop(e.op, this.evalExpr(e.l, frame), this.evalExpr(e.r, frame));
        case 'call': return this.call(e, frame);
      }
      throw new PyError('SyntaxError', '不明運算式', this._loc);
    }

    binop(op, a, b) {
      const bad = () => new PyError('TypeError',
        `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`, this._loc);
      const num = x => typeof x === 'number' || typeof x === 'boolean';
      const n = x => (x === true ? 1 : x === false ? 0 : x);
      switch (op) {
        case '+':
          if (num(a) && num(b)) return n(a) + n(b);
          if (typeof a === 'string' && typeof b === 'string') return a + b;
          if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
          throw bad();
        case '-':
          if (num(a) && num(b)) return n(a) - n(b);
          throw bad();
        case '*':
          if (num(a) && num(b)) return n(a) * n(b);
          if (Array.isArray(a) && num(b)) { let r = []; for (let i = 0; i < n(b); i++) r = r.concat(a); return r; }
          if (num(a) && Array.isArray(b)) return this.binop('*', b, a);
          if (typeof a === 'string' && num(b)) return n(b) > 0 ? a.repeat(n(b)) : '';
          throw bad();
        case '%':
        case '//':
          if (!(num(a) && num(b))) throw bad();
          if (n(b) === 0) throw new PyError('ZeroDivisionError', 'integer modulo by zero', this._loc);
          {
            const q = Math.floor(n(a) / n(b));
            return op === '//' ? q : n(a) - n(b) * q;
          }
        case '==': return eq(a, b);
        case '!=': return !eq(a, b);
        case '<': case '>': case '<=': case '>=': {
          const ok = (num(a) && num(b)) || (typeof a === 'string' && typeof b === 'string');
          if (!ok) throw new PyError('TypeError',
            `'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`, this._loc);
          const x = n(a), y = n(b);
          return op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
        }
      }
      throw bad();
    }

    call(e, frame) {
      const f = this.evalExpr(e.f, frame);
      const args = e.args.map(a => this.evalExpr(a, frame));
      if (f && f.k === 'builtin') {
        if (f.n === 'print') { this.output.push(args.map(fmt).join(' ')); this.lastPrint = true; return null; }
        if (f.n === 'len') {
          if (!Array.isArray(args[0]) && typeof args[0] !== 'string') throw new PyError('TypeError', `object of type '${typeName(args[0])}' has no len()`, this._loc);
          return args[0].length;
        }
        if (f.n === 'range') {
          if (!args.every(a => typeof a === 'number')) throw new PyError('TypeError', 'range() 需要整數', this._loc);
          const [a, b] = args.length === 1 ? [0, args[0]] : [args[0], args[1]];
          const r = [];
          for (let i = a; i < b; i++) r.push(i);
          return r;
        }
      }
      if (!f || f.k !== 'fn') throw new PyError('TypeError', `'${typeName(f)}' object is not callable`, this._loc);
      const d = f.def;
      if (args.length !== d.params.length) {
        throw new PyError('TypeError', `${d.name}() takes ${d.params.length} positional argument(s) but ${args.length} were given`, this._loc);
      }
      const fr = { name: d.name, vars: {}, localNames: f.locals };
      d.params.forEach((p, i) => { fr.vars[p] = args[i]; });
      const savedLoc = this._loc;
      const savedAccess = this.access;
      this.access = [];
      this.record(d.loc, fr, { call: d.name });
      const r = this.execBlock(d.body, fr);
      this.access = savedAccess;
      this._loc = savedLoc;
      return r ? r.ret : null;
    }
  }

  // 每個語句執行前記下位置，令錯誤訊息知道是哪一行
  const origExec = Interp.prototype.exec;
  Interp.prototype.exec = function (s, frame) {
    this._loc = s.loc;
    return origExec.call(this, s, frame);
  };

  const api = { Interp, PyError, StepLimit, fmt, parseProgram };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PyRun = api;
})(typeof window !== 'undefined' ? window : globalThis);
