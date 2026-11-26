'use strict';
// 解譯器本身的 Python 語義測試
const { describe, check, PyRun, errType } = require('./lib.js');

function py(code) {
  const it = new PyRun.Interp();
  const r = it.run(code, 'main');
  return { it, r };
}
const val = (code, expr) => { const { it, r } = py(code); if (!r.ok) return 'ERR ' + r.error.message; return PyRun.fmt(it.eval(expr)); };

describe('解譯器：Python 語義', () => {
  check('[None] * 5', val('a = [None] * 5', 'a'), '[None, None, None, None, None]');
  check('負數索引 a[-1] 是最後一格', val('a = [1, 2, 3]', 'a[-1]'), '3');
  check('% 跟除數正負號：-1 % 5 == 4', val('x = -1 % 5', 'x'), '4');
  check('(4 + 1) % 5 == 0', val('x = (4 + 1) % 5', 'x'), '0');
  check('range(count - 1)', val('s = 0\nfor i in range(3):\n    s = s + i', 's'), '3');
  check('while 迴圈', val('n = 0\nwhile n < 4:\n    n = n + 1', 'n'), '4');
  check('if/elif/else', val('x = 2\nif x == 1:\n    y = "a"\nelif x == 2:\n    y = "b"\nelse:\n    y = "c"', 'y'), 'b');
  check('字串比較', val('x = "紅" == "紅"', 'x'), 'True');
  check('None 比較', val('x = None == None', 'x'), 'True');

  check('IndexError：讀取超出範圍', errType(py('a = [None] * 5\nx = a[5]').r), 'IndexError');
  check('IndexError：寫入超出範圍', errType(py('a = [None] * 5\na[5] = 1').r), 'IndexError');
  check('IndexError：a[-6]', errType(py('a = [None] * 5\nx = a[-6]').r), 'IndexError');
  check('漏寫 global → UnboundLocalError',
    errType(py('top = -1\ndef f():\n    top = top + 1\nf()').r), 'UnboundLocalError');
  check('有 global 就正常',
    val('top = -1\ndef f():\n    global top\n    top = top + 1\nf()', 'top'), '0');
  check('只讀全域變量不用 global', val('top = 3\ndef f():\n    return top\nx = f()', 'x'), '3');
  check('None 作索引 → TypeError', errType(py('a = [1]\nx = a[None]').r), 'TypeError');
  check('None < 1 → TypeError', errType(py('x = None < 1').r), 'TypeError');
  check('NameError', errType(py('x = y').r), 'NameError');
  check('else 前沒有 if → SyntaxError', errType(py('else:\n    x = 1').r), 'SyntaxError');
  check('縮排錯誤 → IndentationError', errType(py('def f():\nx = 1').r), 'IndentationError');
  check('無限迴圈會被步數上限截停',
    (() => { const it = new PyRun.Interp(); return errType(it.run('while True:\n    pass', 'm', { stepLimit: 50 })); })(), 'StepLimit');

  const { it } = py('out = 0');
  const r = it.run('print("A", 1)\nprint(None)', 'm');
  check('print 輸出', r.output, ['A 1', 'None']);

  // trace 會記錄每行及陣列的讀寫位置
  const t = new PyRun.Interp();
  t.run('a = [None] * 3\ndef f(x):\n    a[1] = x', 'prog');
  const tr = t.run('f("紅")', 'run', { trace: true }).trace;
  check('trace：依次為呼叫 def、a[1] = x、呼叫語句', tr.map(s => s.loc.line), [2, 3, 1]);
  check('trace：記錄寫入 a[1]', tr[1].access, [{ name: 'a', i: 1, w: true }]);
  check('trace：快照', tr[1].state.a, [null, '紅', null]);
});
