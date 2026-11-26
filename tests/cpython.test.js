'use strict';
/* 差異測試：隨機產生操作序列，同時交給本遊戲的解譯器及真正的 CPython 執行，
 * 比較每一步的傳回值、輸出、錯誤類型及最後狀態。
 * 機器上沒有 python3 時自動略過（例如 Render 建置環境）。
 */
const { execFileSync } = require('child_process');
const { describe, check, warn, Sims, PyRun } = require('./lib.js');

let hasPy = true;
try { execFileSync('python3', ['--version']); } catch (e) { hasPy = false; }

function rng(seed) { return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; }

const CASES = {
  stack: { vars: ['trunk', 'top'], ops: r => (r() < 0.55 ? `push("v${Math.floor(r() * 90)}")` : 'pop()') },
  shiftQueue: { vars: ['rank', 'count'], ops: r => (r() < 0.55 ? `enq("v${Math.floor(r() * 90)}")` : 'deq()') },
  circularQueue: { vars: ['bay', 'head', 'tail', 'count'], ops: r => (r() < 0.55 ? `enq("v${Math.floor(r() * 90)}")` : 'deq()') },
  linkedList: {
    vars: ['data', 'nxt', 'head'],
    setup: 'data = ["A", "B", "C", None, None]\nnxt = [2, -1, 1, None, None]\nhead = 0',
    ops: r => {
      const k = r();
      const i = Math.floor(r() * 5), j = Math.floor(r() * 5);
      if (k < 0.4) return `insert_after(${i}, ${j}, "s${j}")`;
      if (k < 0.7) return `delete_after(${i})`;
      return 'show_route()';
    },
  },
};

const PY_HARNESS = `
import json, sys, io, contextlib
src = json.load(sys.stdin)
g = {}
exec(src["prog"], g)
if src.get("setup"): exec(src["setup"], g)
out = []
def fmt(v):
    if isinstance(v, list): return "[" + ", ".join(fmt(x) for x in v) + "]"
    return str(v)
for op in src["ops"]:
    buf = io.StringIO()
    res = {"op": op}
    try:
        with contextlib.redirect_stdout(buf):
            # 防止鏈表無限迴圈：以追蹤函式限制行數
            cnt = [0]
            def tr(frame, event, arg):
                cnt[0] += 1
                if cnt[0] > 400: raise RuntimeError("StepLimit")
                return tr
            sys.settrace(tr)
            try:
                v = eval(op, g)
            finally:
                sys.settrace(None)
        res["ret"] = fmt(v)
    except Exception as e:
        res["err"] = "StepLimit" if str(e) == "StepLimit" else type(e).__name__
    res["out"] = buf.getvalue().splitlines()[:8]
    res["state"] = {k: fmt(g[k]) for k in src["vars"]}
    out.append(res)
    if "err" in res: break
print(json.dumps(out, ensure_ascii=False))
`;

describe('差異測試：本解譯器 vs CPython', () => {
  if (!hasPy) { warn('略過', '找不到 python3'); return; }
  for (const [name, c] of Object.entries(CASES)) {
    for (let seed = 1; seed <= 25; seed++) {
      const r = rng(seed * 7919 + name.length);
      const ops = Array.from({ length: 30 }, () => c.ops(r));
      const py = JSON.parse(execFileSync('python3', ['-I', '-c', PY_HARNESS], {
        input: JSON.stringify({ prog: Sims.PROGRAMS[name], setup: c.setup, ops, vars: c.vars }),
      }).toString());
      const it = Sims.create(name, c.setup);
      const mine = [];
      for (const op of ops) {
        const res = { op };
        const x = it.run(op, 'run', { stepLimit: 400 });
        if (x.ok) res.ret = PyRun.fmt(x.result);
        else res.err = x.error.pyType || 'StepLimit';
        res.out = x.output.slice(0, 8);
        res.state = {};
        for (const k of c.vars) res.state[k] = PyRun.fmt(it.g[k]);
        mine.push(res);
        if (res.err) break;
      }
      // 無限迴圈時兩邊截停的位置不同，只比較錯誤類型及狀態
      const norm = a => a.map(s => (s.err === 'StepLimit' ? { op: s.op, err: s.err, state: s.state } : s));
      check(`${name} 隨機序列 #${seed}`, norm(mine), norm(py));
    }
  }
});
