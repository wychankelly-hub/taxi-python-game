'use strict';
/* 設計文件內每一關、收工小測及考試模式的答案，逐一用模擬器核對。
 * 「預期」一律照抄文件；如不符，測試失敗並列出模擬結果。
 * 錯誤選項的回饋若描述了某個執行結果，亦一併核對（不符則列為「待確認」）。
 */
const { describe, check, warn, sim, run, exec, ev, fmt, countLine, redefine, errType, Sims } = require('./lib.js');

const S = 'stack', Q2 = 'shiftQueue', Q3 = 'circularQueue', L = 'linkedList';
const swapLines = (src, a, b) => {
  const lines = src.split('\n');
  const i = lines.findIndex(l => l.trim() === a), j = lines.findIndex(l => l.trim() === b);
  if (i < 0 || j < 0) throw new Error('swapLines 找不到行');
  [lines[i], lines[j]] = [lines[j], lines[i]];
  return lines.join('\n');
};
const replaceLine = (src, from, to) => {
  const lines = src.split('\n');
  const i = lines.findIndex(l => l.trim() === from);
  if (i < 0) throw new Error('replaceLine 找不到行：' + from);
  lines[i] = lines[i].replace(from, to);
  return lines.join('\n');
};
const funcOnly = (src, name) => {
  // 取出某個函式的原文
  const lines = src.split('\n');
  const s = lines.findIndex(l => l.startsWith('def ' + name + '('));
  let e = s + 1;
  while (e < lines.length && (lines[e].startsWith(' ') || lines[e] === '') && !(lines[e] === '' && !(lines[e + 1] || '').startsWith(' '))) e++;
  return lines.slice(s, e).join('\n');
};
const writes = (trace, arr) => trace.reduce((n, s) => n + s.access.filter(a => a.w && a.name === arr).length, 0);
const P = Sims.PROGRAMS;

/* ======================= 第一章 ======================= */
describe('1-1 阿婆上車', () => {
  const it = sim(S);
  exec(it, 'push("紅")\npush("藍")\npush("橙")');
  check('trunk', ev(it, 'trunk'), '[紅, 藍, 橙, None, None]');
  check('top', ev(it, 'top'), '2');
  // 錯誤處理：未按 + 就放入 → 放落 trunk[-1]
  const bad = redefine(sim(S), swapLines(funcOnly(P.stack, 'push'), 'top = top + 1', 'trunk[top] = x'));
  exec(bad, 'push("紅")');
  check('未先郁 top：資料放入 trunk[-1]（即索引 4）', ev(bad, 'trunk'), '[None, None, None, None, 紅]');
});

describe('1-2 阿婆落車', () => {
  const it = sim(S, 'trunk = ["紅", "藍", "橙", None, None]\ntop = 2');
  check('Q1 第一次 pop() 傳回', fmt(exec(it, 'pop()')), '橙');
  exec(it, 'pop()');
  check('Q2 兩次 pop() 後 top', ev(it, 'top'), '0');
  check('Q3 trunk[2]', ev(it, 'trunk[2]'), '橙');
});

describe('1-3 最底嗰袋', () => {
  const base = 'trunk = ["紅", "藍", "橙", "黃", None]\ntop = 3';
  const it = sim(S, base);
  let n = 0, x = null;
  while (x !== '紅') { x = exec(it, 'pop()'); n++; }
  check('Q1 取得紅要 pop 幾次', n, 4);
  const it3 = sim(S, base);
  exec(it3, 'pop()\npop()\npop()');
  check('Q1 回饋：3 次後紅袋仍在堆疊內（top == 0）', ev(it3, 'top') + ' ' + ev(it3, 'trunk[top]'), '0 紅');
  const it2 = sim(S, base);
  const order = [1, 2, 3, 4].map(() => fmt(exec(it2, 'pop()')));
  check('Q2 pop 次序', order.join('、'), '黃、橙、藍、紅');
  exec(it2, 'push("藍")\npush("橙")\npush("黃")');
  check('Q3 依次 push 藍、橙、黃 → 由底至頂 藍、橙、黃', ev(it2, '[trunk[0], trunk[1], trunk[2]]') + ' top=' + ev(it2, 'top'), '[藍, 橙, 黃] top=2');
  const it4 = sim(S, base); exec(it4, 'pop()\npop()\npop()\npop()');
  exec(it4, 'push("黃")\npush("橙")\npush("藍")');
  check('Q3 回饋：push 黃、橙、藍 → 黃袋壓底', ev(it4, 'trunk[0]'), '黃');
});

describe('1-4 塞爆車尾箱', () => {
  const push = funcOnly(P.stack, 'push'), pop = funcOnly(P.stack, 'pop');
  const sixPush = 'push("A")\npush("B")\npush("C")\npush("D")\npush("E")\npush("F")';
  const tryPush = cond => {
    const it = redefine(sim(S), replaceLine(push, 'if top == 4:', `if ${cond}:`));
    const r = run(it, sixPush);
    return { err: errType(r), out: r.output, top: r.ok ? ev(it, 'top') : null };
  };
  const ok = tryPush('top == 4');
  check('Q1 top == 4：第 6 袋顯示「車尾箱已滿」，top 仍是 4', [ok.err, ok.out, ok.top], [null, ['車尾箱已滿'], '4']);
  check('Q1 回饋 top == 5：trunk[5] 運行錯誤', tryPush('top == 5').err, 'IndexError');
  check('Q1 top > 5：同樣運行錯誤', tryPush('top > 5').err, 'IndexError');
  const m1 = tryPush('top == -1');
  check('Q1 top == -1：空車尾箱時已說「已滿」', m1.out[0], '車尾箱已滿');

  const tryPop = cond => {
    const it = redefine(sim(S), replaceLine(pop, 'if top == -1:', `if ${cond}:`));
    run(it, 'push("A")\npush("B")\npush("C")\npush("D")\npush("E")');
    const outs = [];
    for (let i = 0; i < 6; i++) { const r = run(it, 'pop()'); outs.push(r.ok ? fmt(r.result) : r.error.pyType); }
    return { outs, top: ev(it, 'top') };
  };
  const p = tryPop('top == -1');
  check('Q2 top == -1：第 6 次 pop 傳回 None，top 為 -1', [p.outs, p.top], [['E', 'D', 'C', 'B', 'A', 'None'], '-1']);
  const p0 = tryPop('top == 0');
  check('Q2 回饋 top == 0：仲有一袋時已當空', p0.outs[4], 'None');
  const pn = tryPop('trunk[top] == None');
  check('Q2 回饋 trunk[top] == None：trunk[-1] 是最後一格，不會出錯，但判斷錯誤', [pn.outs[5], pn.top], ['E', '-2']);

  const it = sim(S, 'trunk = ["紅", "藍", "橙", "黃", "紅"]\ntop = 4');
  const r = run(it, 'push("紫")');
  check('Q3 top = 4 時 push("紫")', [r.output, ev(it, 'top'), ev(it, 'trunk[4]')], [['車尾箱已滿'], '4', '紅']);
});

describe('1-5 砌好個程式', () => {
  check('任務 1 push 行數', funcOnly(P.stack, 'push').split('\n').length, 7);
  check('任務 2 pop 共 9 行', funcOnly(P.stack, 'pop').split('\n').length, 9);
  const badPush = redefine(sim(S, 'trunk = ["紅", "藍", None, None, None]\ntop = 1'),
    swapLines(funcOnly(P.stack, 'push'), 'top = top + 1', 'trunk[top] = x'));
  exec(badPush, 'push("橙")');
  check('特別檢查：先放後郁 → 新袋壓扁頂部的袋', ev(badPush, 'trunk[1]'), '橙');
  const badPop = redefine(sim(S, 'trunk = ["紅", "藍", "橙", None, None]\ntop = 2'),
    swapLines(funcOnly(P.stack, 'pop'), 'x = trunk[top]', 'top = top - 1'));
  check('特別檢查：先減 top → 拎錯袋', fmt(exec(badPop, 'pop()')), '藍');
});

describe('1-6 GPS 返回鍵', () => {
  const bad = redefine(sim(S, 'trunk = ["中環", "金鐘", "灣仔", None, None]\ntop = 2'),
    swapLines(funcOnly(P.stack, 'pop'), 'x = trunk[top]', 'top = top - 1'));
  check('捉錯：錯誤版本傳回錯的項目', fmt(exec(bad, 'pop()')), '金鐘');
  const it = sim(S);
  exec(it, 'push("中環")\npush("金鐘")\npush("灣仔")\npush("銅鑼灣")\npop()\npop()');
  check('Q1 兩次 pop 後目前位置', ev(it, 'trunk[top]'), '金鐘');
  exec(it, 'push("北角")');
  check('Q2 trunk', ev(it, 'trunk'), '[中環, 金鐘, 北角, 銅鑼灣, None]');
  check('Q3 堆疊項目數 (top + 1)', ev(it, 'top + 1'), '3');
});

describe('第一章 收工小測', () => {
  const it = sim(S);
  const outs = [];
  for (const c of ['push("A")', 'push("B")', 'pop()', 'push("C")', 'push("D")', 'pop()', 'pop()']) {
    const v = exec(it, c);
    if (c === 'pop()') outs.push(fmt(v));
  }
  check('1. 三次 pop 次序', outs.join('、'), 'B、D、C');
  check('2. 最後 top', ev(it, 'top'), '0');
  check('2. trunk', ev(it, 'trunk'), '[A, C, D, None, None]');
  const e = sim(S); exec(e, 'push("A")\npop()');
  check('3. 空堆疊：top == -1 成立；干擾項 top == 0、trunk[0] == None、top == 4 不成立',
    ['top == -1', 'top == 0', 'trunk[0] == None', 'top == 4'].map(x => ev(e, x)), ['True', 'False', 'False', 'False']);
});

/* ======================= 第二章 ======================= */
const moves = trace => countLine(trace, Q2, 'rank[i] = rank[i + 1]');

describe('2-1 排隊等客', () => {
  const it = sim(Q2);
  exec(it, 'enq("阿強")\nenq("阿明")\nenq("肥仔")');
  check('rank', ev(it, 'rank'), '[阿強, 阿明, 肥仔, None, None]');
  check('count', ev(it, 'count'), '3');
});

describe('2-2 頭架車走', () => {
  const it = sim(Q2, 'rank = ["阿強", "阿明", "肥仔", None, None]\ncount = 3');
  const r = run(it, 'deq()');
  check('Q1 傳回', fmt(r.result), '阿強');
  check('Q2 rank', ev(it, 'rank'), '[阿明, 肥仔, 肥仔, None, None]');
  check('Q3 count', ev(it, 'count'), '2');
  check('Q4 rank[i] = rank[i + 1] 執行次數', moves(r.trace), 2);
});

describe('2-3 郁到攰', () => {
  const full = 'rank = ["A", "B", "C", "D", "E"]\ncount = 5';
  check('Q1 一次 deq 移動次數', moves(run(sim(Q2, full), 'deq()').trace), 4);
  check('Q2 三次 deq 共移動', moves(run(sim(Q2, full), 'deq()\ndeq()\ndeq()').trace), 9);
  const big = new (require('./lib.js').PyRun.Interp)();
  big.run(P.shiftQueue.replace(/\b5\b/g, '100'), 'prog');
  big.run('for i in range(100):\n    enq(i)', 'setup');
  const t = big.run('deq()', 'run', { trace: true }).trace;
  check('Q3 100 個車位排滿，一次 deq 移動', t.filter(s => s.loc.src === 'prog' && P.shiftQueue.split('\n')[s.loc.line - 1].trim() === 'rank[i] = rank[i + 1]').length, 99);
});

describe('2-4 填空', () => {
  const enq = funcOnly(P.shiftQueue, 'enq'), deq = funcOnly(P.shiftQueue, 'deq');
  const fiveEnq = 'enq("A")\nenq("B")\nenq("C")\nenq("D")\nenq("E")';
  const tryEnq = idx => {
    const it = redefine(sim(Q2), replaceLine(enq, 'rank[count] = x', `rank[${idx}] = x`));
    const r = run(it, fiveEnq);
    return { err: errType(r), rank: ev(it, 'rank') };
  };
  check('Q1 rank[count]：五架車正常', tryEnq('count'), { err: null, rank: '[A, B, C, D, E]' });
  const c1 = tryEnq('count + 1');
  check('Q1 回饋 count + 1：留低空位，第 5 架車出錯', [c1.err, c1.rank.startsWith('[None')], ['IndexError', true]);
  // 回饋（2026-11-24 修訂）：「第一架車會放咗喺 rank[-1]，即係最後一格（索引 4），之後 deq() 會傳回第二架車！」
  const it = redefine(sim(Q2), replaceLine(enq, 'rank[count] = x', 'rank[count - 1] = x'));
  exec(it, 'enq("A")');
  check('Q1 回饋 count - 1：第一架車放咗喺 rank[-1]（索引 4）', ev(it, 'rank'), '[None, None, None, None, A]');
  exec(it, 'enq("B")\nenq("C")');
  check('Q1 回饋 count - 1：之後 deq() 傳回第二架車', fmt(exec(it, 'deq()')), 'B');
  const tryDeq = rng => {
    const it2 = redefine(sim(Q2, 'rank = ["A", "B", "C", "D", "E"]\ncount = 5'),
      replaceLine(deq, 'for i in range(count - 1):', `for i in range(${rng}):`));
    const r2 = run(it2, 'deq()');
    return { err: errType(r2), rank: r2.ok ? ev(it2, 'rank') : null };
  };
  check('Q2 range(count - 1)', tryDeq('count - 1'), { err: null, rank: '[B, C, D, E, E]' });
  check('Q2 回饋 range(count)：count 為 5 時 rank[5] IndexError', tryDeq('count').err, 'IndexError');
  check('Q2 range(5)：同樣 IndexError', tryDeq('5').err, 'IndexError');
  // Q3 count = count - 1 放在迴圈內
  const lines = deq.split('\n');
  const ci = lines.findIndex(l => l.trim() === 'count = count - 1');
  const moved = lines.slice(); moved.splice(ci, 1); moved.splice(ci - 0, 0); // remove
  const fi = moved.findIndex(l => l.trim() === 'rank[i] = rank[i + 1]');
  moved.splice(fi + 1, 0, '        count = count - 1');
  const it3 = redefine(sim(Q2, 'rank = ["A", "B", "C", "D", "E"]\ncount = 5'), moved.join('\n'));
  exec(it3, 'deq()');
  check('Q3 回饋：count 減在迴圈內 → count 錯（應為 4）', ev(it3, 'count') !== '4', true);
});

describe('2-5 砌返個 deq', () => {
  check('文件（修訂後）：把打亂的 10 行排成 deq', funcOnly(P.shiftQueue, 'deq').split('\n').length, 10);
  const deq = funcOnly(P.shiftQueue, 'deq').split('\n');
  const xi = deq.findIndex(l => l.trim() === 'x = rank[0]');
  const line = deq.splice(xi, 1)[0];
  const ri = deq.findIndex(l => l.trim() === 'rank[i] = rank[i + 1]');
  deq.splice(ri + 1, 0, line);
  const it = redefine(sim(Q2, 'rank = ["阿強", "阿明", "肥仔", None, None]\ncount = 3'), deq.join('\n'));
  check('特別檢查：x = rank[0] 在迴圈後 → 傳回第二架車', fmt(exec(it, 'deq()')), '阿明');
});

describe('2-6 的士站爆滿', () => {
  const bad = redefine(sim(Q2), replaceLine(funcOnly(P.shiftQueue, 'enq'), 'if count == 5:', 'if count > 5:'));
  const r = run(bad, 'enq("A")\nenq("B")\nenq("C")\nenq("D")\nenq("E")\nenq("F")');
  check('追問：錯誤版本第 6 架車 → 運行錯誤', errType(r), 'IndexError');
  const it = sim(Q2);
  const outs = [];
  for (const c of ['enq("A")', 'enq("B")', 'enq("C")', 'deq()', 'enq("D")', 'deq()']) {
    const v = exec(it, c); if (c === 'deq()') outs.push(fmt(v));
  }
  check('Q1 兩次 deq 輸出', outs.join('、'), 'A、B');
  check('Q2 rank', ev(it, 'rank'), '[C, D, D, None, None]');
  check('Q2 count', ev(it, 'count'), '2');
});

describe('第二章 收工小測', () => {
  const it = sim(Q2);
  check('1. enq P、Q 後 deq', fmt(exec(it, 'enq("P")\nenq("Q")\ndeq()')), 'P');
  const t = run(sim(Q2, 'rank = ["A", "B", "C", "D", None]\ncount = 4'), 'deq()').trace;
  check('2. count = 4 時迴圈賦值次數', moves(t), 3);
});

/* ======================= 第三章 ======================= */
describe('3-1 發哥改革', () => {
  const t = run(sim(Q3, 'bay = ["A", "B", "C", "D", "E"]\ncount = 5'), 'deq()').trace;
  check('Q1 deq 時寫入 bay 的次數（移動車輛）', writes(t, 'bay'), 0);
  check('Q3 (4 + 1) % 5', ev(sim(Q3), '(4 + 1) % 5'), '0');
});

describe('3-2 新制度開工', () => {
  const it = sim(Q3);
  exec(it, 'enq("阿強")\nenq("阿明")\nenq("肥仔")');
  check('bay', ev(it, 'bay'), '[阿強, 阿明, 肥仔, None, None]');
  check('head、tail、count', ev(it, '[head, tail, count]'), '[0, 3, 3]');
  const bad = redefine(sim(Q3), swapLines(funcOnly(P.circularQueue, 'enq'), 'bay[tail] = x', 'tail = (tail + 1) % 5'));
  exec(bad, 'enq("阿強")');
  check('錯誤處理：先郁 tail → 第一格空咗', ev(bad, 'bay'), '[None, 阿強, None, None, None]');
});

describe('3-3 車走，牌郁', () => {
  const it = sim(Q3); exec(it, 'enq("阿強")\nenq("阿明")\nenq("肥仔")');
  const a = fmt(exec(it, 'deq()')), b = fmt(exec(it, 'deq()'));
  check('Q1 兩次 deq 輸出', a + '、' + b, '阿強、阿明');
  check('Q2 head、tail、count', ev(it, '[head, tail, count]'), '[2, 3, 1]');
  check('Q3 bay 沒有改變', ev(it, 'bay'), '[阿強, 阿明, 肥仔, None, None]');
});

describe('3-4 兜返個圈', () => {
  const enq = funcOnly(P.circularQueue, 'enq');
  const seven = 'enq("A")\nenq("B")\nenq("C")\nenq("D")\ndeq()\ndeq()\nenq("E")\nenq("F")\nenq("G")';
  const tryTail = expr => {
    const it = redefine(sim(Q3), replaceLine(enq, 'tail = (tail + 1) % 5', `tail = ${expr}`));
    const r = run(it, seven);
    return { err: errType(r), bay: r.ok ? ev(it, 'bay') : null };
  };
  check('Q1 (tail + 1) % 5：兜圈正常', tryTail('(tail + 1) % 5'), { err: null, bay: '[F, G, C, D, E]' });
  check('Q1 回饋 tail + 1：去到 5 就爆', tryTail('tail + 1').err, 'IndexError');
  check('Q1 回饋 (tail % 5) + 1：tail = 4 時變 5', tryTail('(tail % 5) + 1').err, 'IndexError');
  const it4 = redefine(sim(Q3), replaceLine(enq, 'tail = (tail + 1) % 5', 'tail = (tail + 1) % 4'));
  const r4 = run(it4, 'enq("A")\nenq("B")\nenq("C")\nenq("D")\ndeq()\ndeq()\ndeq()\ndeq()\nenq("E")\nenq("F")\nenq("G")\nenq("H")');
  check('Q1 回饋 (tail + 1) % 4：車位 4 永遠用唔到', [r4.trace.some(s => s.access.some(x => x.w && x.name === 'bay' && x.i === 4)), ev(it4, 'bay[4]')], [false, 'None']);
  const it = sim(Q3, 'tail = 4'); exec(it, 'enq("X")');
  check('Q2 tail = 4 時 enq 後 tail', ev(it, 'tail'), '0');
  const bad = redefine(sim(Q3), swapLines(funcOnly(P.circularQueue, 'deq'), 'x = bay[head]', 'head = (head + 1) % 5'));
  check('排列特別檢查：先郁 head → 叫錯車', fmt(exec(bad, 'enq("阿強")\nenq("阿明")\ndeq()')), '阿明');
});

describe('3-5 繁忙時間', () => {
  const it = sim(Q3, 'bay = ["阿強", "阿明", "肥仔", None, None]\nhead = 2\ntail = 3\ncount = 1');
  exec(it, 'enq("阿May")\nenq("豪哥")');
  check('Q1 阿輝泊的車位', ev(it, 'tail'), '0');
  exec(it, 'enq("阿輝")');
  check('Q2 head、tail、count', ev(it, '[head, tail, count]'), '[2, 1, 4]');
  check('Q3 bay', ev(it, 'bay'), '[阿輝, 阿明, 肥仔, 阿May, 豪哥]');
  check('Q4 下一架', ev(it, 'bay[head]'), '肥仔');
  const c = it.clone();
  const order = [1, 2, 3, 4].map(() => fmt(exec(c, 'deq()')));
  check('Q5 由頭至尾', order.join('、'), '肥仔、阿May、豪哥、阿輝');
});

describe('3-6 係滿定係空？', () => {
  const it = sim(Q3, 'bay = ["阿輝", "阿明", "肥仔", "阿May", "豪哥"]\nhead = 2\ntail = 1\ncount = 4');
  check('Q1 阿傑泊的車位', ev(it, 'tail'), '1');
  exec(it, 'enq("阿傑")');
  check('Q1 之後 head、tail、count', ev(it, '[head, tail, count]'), '[2, 2, 5]');
  check('Q2 head == tail 且 count == 5 → 已滿', ev(it, 'head == tail and count == 5'), 'True');
  const r = run(it, 'enq("阿文")');
  check('Q3 再 enq 阿文', [r.output, ev(it, '[head, tail, count]')], [['的士站已滿'], '[2, 2, 5]']);
  const outs = [1, 2, 3, 4, 5].map(() => fmt(exec(it, 'deq()')));
  check('Q4 五次 deq 次序', outs.join('、'), '肥仔、阿May、豪哥、阿輝、阿傑');
  check('Q4 之後 head、tail、count', ev(it, '[head, tail, count]'), '[2, 2, 0]');
  check('Q5 head == tail 且 count == 0 → 空', ev(it, 'head == tail and count == 0'), 'True');
  // 捉錯：head = head + 1
  const bad = redefine(sim(Q3, 'head = 3\ntail = 3'), replaceLine(funcOnly(P.circularQueue, 'deq'), 'head = (head + 1) % 5', 'head = head + 1'));
  exec(bad, 'enq("A")\nenq("B")\nenq("C")');
  const d1 = run(bad, 'deq()'), d2 = run(bad, 'deq()'), d3 = run(bad, 'deq()');
  check('捉錯追問：head 由 4 加 1 變 5 時未出錯，下一次 deq 讀 bay[5] 才出現 IndexError',
    [errType(d1), errType(d2), ev(bad, 'head'), errType(d3)], [null, null, '5', 'IndexError']);
});

describe('第三章 收工小測', () => {
  const it = sim(Q3, 'bay = ["E", None, None, "C", "D"]\nhead = 3\ntail = 1\ncount = 3');
  check('1. deq 傳回；之後 head', [fmt(exec(it, 'deq()')), ev(it, 'head')], ['C', '4']);
  const t = ev(it, 'tail'); exec(it, 'enq("F")');
  check('2. F 的車位；之後 tail', [t, ev(it, 'tail')], ['1', '2']);
  check('3. count', ev(it, 'count'), '3');
});

/* ======================= 第四章 ======================= */
const route = it => { const r = run(it, 'show_route()', { stepLimit: 400 }); return r.ok ? r.output.join(' → ') : 'LOOP:' + r.output.slice(0, 8).join(' → '); };
const S41 = 'data = ["中環", "旺角", "尖沙咀", None, None]\nnxt = [-1, 2, 0, None, None]\nhead = 1';

describe('4-1 跟住箭咀行', () => {
  const it = sim(L, S41);
  check('Q1 第一個站', ev(it, 'data[head]'), '旺角');
  check('Q2 旺角之後', ev(it, 'data[nxt[1]]'), '尖沙咀');
  check('Q3 全程', route(it), '旺角 → 尖沙咀 → 中環');
  check('Q4 nxt[0] == -1', ev(it, 'nxt[0]'), '-1');
});

describe('4-2 順路經金鐘', () => {
  const it = sim(L, S41);
  exec(it, 'data[3] = "金鐘"\nnxt[3] = nxt[2]\nnxt[2] = 3');
  check('nxt', ev(it, 'nxt'), '[-1, 2, 3, 0, None]');
  check('路線', route(it), '旺角 → 尖沙咀 → 金鐘 → 中環');
  const bad = sim(L, S41);
  exec(bad, 'data[3] = "金鐘"\nnxt[2] = 3\nnxt[3] = nxt[2]');
  check('陷阱：先改 nxt[2] → nxt[3] 指向自己', ev(bad, 'nxt[3]'), '3');
  check('陷阱：在金鐘不停兜圈', route(bad).startsWith('LOOP:旺角 → 尖沙咀 → 金鐘 → 金鐘'), true);
});

describe('4-3 插站程式', () => {
  check('insert_after 共 4 行', funcOnly(P.linkedList, 'insert_after').split('\n').length, 4);
  const bad = redefine(sim(L, S41), swapLines(funcOnly(P.linkedList, 'insert_after'), 'nxt[new] = nxt[p]', 'nxt[p] = new'));
  exec(bad, 'insert_after(2, 3, "金鐘")');
  check('Q1 nxt[3]', ev(bad, 'nxt[3]'), '3');
  check('Q2 金鐘不斷重複，中環不見了', [route(bad).startsWith('LOOP:'), route(bad).includes('中環')], [true, false]);
  const good = sim(L, S41); exec(good, 'insert_after(2, 3, "金鐘")');
  check('正確版本 insert_after(2, 3, "金鐘")', route(good), '旺角 → 尖沙咀 → 金鐘 → 中環');
});

const S44 = 'data = ["中環", "旺角", "尖沙咀", "金鐘", None]\nnxt = [-1, 2, 3, 0, None]\nhead = 1';
describe('4-4 我想先去深水埗', () => {
  const it = sim(L, S44);
  exec(it, 'data[4] = "深水埗"\nnxt[4] = head\nhead = 4');
  check('Q3 新路線', route(it), '深水埗 → 旺角 → 尖沙咀 → 金鐘 → 中環');
  const a = sim(L, S44); exec(a, 'data[4] = "深水埗"\nnxt[4] = nxt[head]\nhead = 4');
  check('Q1 回饋 nxt[head]：跳咗旺角', route(a), '深水埗 → 尖沙咀 → 金鐘 → 中環');
  const b = sim(L, S44); exec(b, 'data[4] = "深水埗"\nnxt[4] = -1\nhead = 4');
  check('Q1 回饋 -1：深水埗之後冇站', route(b), '深水埗');
  const c = sim(L, S44); exec(c, 'data[4] = "深水埗"\nhead = 4\nnxt[4] = head');
  check('Q4 兩行對調 → nxt[4] = 4', ev(c, 'nxt[4]'), '4');
  check('Q4 深水埗指向自己，其餘站失去', route(c).startsWith('LOOP:深水埗 → 深水埗'), true);
});

const S45 = 'data = ["中環", "旺角", "尖沙咀", "金鐘", "深水埗"]\nnxt = [-1, 2, 3, 0, 1]\nhead = 4';
describe('4-5 唔去尖沙咀喇', () => {
  const it = sim(L, S45);
  check('開始狀態路線', route(it), '深水埗 → 旺角 → 尖沙咀 → 金鐘 → 中環');
  const a = sim(L, S45); exec(a, 'nxt[1] = 3');
  check('Q1 nxt[1] = 3', route(a), '深水埗 → 旺角 → 金鐘 → 中環');
  const b = sim(L, S45); exec(b, 'nxt[2] = -1');
  check('Q1 回饋 nxt[2] = -1：金鐘同中環都唔去', route(b), '深水埗 → 旺角 → 尖沙咀');
  const c = sim(L, S45); exec(c, 'delete_after(1)');
  check('Q2 delete_after(1)', route(c), '深水埗 → 旺角 → 金鐘 → 中環');
  const d = sim(L, S45); exec(d, 'delete_after(2)');
  check('Q2 回饋 delete_after(2)：刪咗金鐘', route(d), '深水埗 → 旺角 → 尖沙咀 → 中環');
  check('Q4 data[2] 仍是尖沙咀', ev(c, 'data[2]'), '尖沙咀');
});

const S46 = 'data = ["中環", "旺角", "尖沙咀", "金鐘", "深水埗"]\nnxt = [-1, 3, 3, 0, 1]\nhead = 4';
describe('4-6 行晒全程', () => {
  const it = sim(L, S46);
  const r = run(it, 'show_route()');
  check('Q2 show_route() 輸出', r.output.join('、'), '深水埗、旺角、金鐘、中環');
  check('Q3 迴圈執行次數', countLine(r.trace, L, 'print(data[p])'), 4);
  const bad = redefine(sim(L, S46), replaceLine(funcOnly(P.linkedList, 'show_route'), 'while p != -1:', 'while nxt[p] != -1:'));
  check('捉錯：while nxt[p] != -1 少了中環', run(bad, 'show_route()').output.join('、'), '深水埗、旺角、金鐘');
});

describe('第四章 收工小測', () => {
  const it = sim(L, 'data = ["A", "B", "C", "D", "E"]\nnxt = [3, -1, 4, 1, 0]\nhead = 2');
  check('1. 次序', route(it), 'C → E → A → D → B');
  exec(it, 'head = nxt[head]');
  check('2. head = nxt[head] 後', ev(it, 'head'), '4');
});

/* ======================= 考試模式 ======================= */
describe('考試 題 1 堆疊追蹤', () => {
  const it = sim(S);
  const outs = [];
  for (const c of ['push("P")', 'push("Q")', 'push("R")', 'pop()', 'push("S")', 'pop()', 'pop()', 'push("T")', 'push("U")']) {
    const v = exec(it, c); if (c === 'pop()') outs.push(fmt(v));
  }
  check('(a) 三次 pop 次序', outs.join('、'), 'R、S、Q');
  check('(b) 陣列內容', ev(it, 'trunk'), '[P, T, U, None, None]');
  check('(c) top', ev(it, 'top'), '2');
});

// 題 2：q 陣列，enq 用文件題 2 原文，deq 與第三章相同（bay 改名 q）
function exam2(setup) {
  const it = new (require('./lib.js').PyRun.Interp)();
  it.run('q = [None] * 5\nhead = 0\ntail = -1\ncount = 0', 'prog');
  it.run(P.examTailLast, 'prog');
  it.run(funcOnly(P.circularQueue, 'deq').replace(/bay/g, 'q'), 'prog');
  if (setup) it.run(setup, 'setup');
  return it;
}
describe('考試 題 2 另一種環形隊列', () => {
  const it = exam2();
  exec(it, 'enq("A")\nenq("B")\nenq("C")\nenq("D")\ndeq()\ndeq()\nenq("E")\nenq("F")');
  check('(a) 陣列', ev(it, 'q'), '[F, B, C, D, E]');
  check('(b) head、tail', ev(it, '[head, tail]'), '[2, 0]');
  const empty = exam2(); const full = exam2();
  exec(full, 'enq("A")\nenq("B")\nenq("C")\nenq("D")\nenq("E")');
  check('(c) 空及滿時 (tail + 1) % 5 == head 同樣成立',
    [ev(empty, '(tail + 1) % 5 == head'), ev(full, '(tail + 1) % 5 == head')], ['True', 'True']);
  const later = exam2(); exec(later, 'enq("A")\nenq("B")\ndeq()\ndeq()');
  check('(c) 由非起始狀態變空時亦成立', ev(later, '(tail + 1) % 5 == head'), 'True');
});

describe('考試 題 3 效率比較', () => {
  const it = new (require('./lib.js').PyRun.Interp)();
  it.run(P.shiftQueue.replace(/\b5\b/g, '50'), 'prog');
  it.run('for i in range(50):\n    enq(i)', 'setup');
  const t = it.run('deq()', 'run', { trace: true }).trace;
  check('(a) 容量 50 已滿，移位版 deq 移動', writes(t, 'rank'), 49);
  const c = sim(Q3, 'bay = ["A", "B", "C", "D", "E"]\ncount = 5');
  check('(b) 環形隊列 deq 移動', writes(run(c, 'deq()').trace, 'bay'), 0);
  // (c) 不加 q[head] = None 亦正確：長時間操作與「理想隊列」比較
  const c2 = sim(Q3); const ideal = [];
  let okAll = true;
  for (let i = 0; i < 40; i++) {
    if (i % 3 === 2) { const v = exec(c2, 'deq()'); if (fmt(v) !== fmt(ideal.length ? ideal.shift() : null)) okAll = false; }
    else { const r = run(c2, `enq("X${i}")`); if (!r.output.length) ideal.push('X' + i); }
  }
  check('(c) 不清除舊資料，隊列仍然正確', okAll, true);
});

describe('考試 題 4 鏈表', () => {
  const it = sim(L, 'data = ["新界", None, "九龍", "港島", None]\nnxt = [-1, None, 3, 0, None]\nhead = 2');
  check('(a) 次序', route(it), '九龍 → 港島 → 新界');
  check('(b) nxt[3] 原值', ev(it, 'nxt[3]'), '0');
  exec(it, 'data[1] = "離島"\nnxt[1] = nxt[3]\nnxt[3] = 1');
  check('(b) 插入後', route(it), '九龍 → 港島 → 離島 → 新界');
  exec(it, 'head = nxt[head]');
  check('(c) head 及次序', [ev(it, 'head'), route(it)], ['3', '港島 → 離島 → 新界']);
});

describe('考試 題 5 堆疊與隊列結合', () => {
  const it = new (require('./lib.js').PyRun.Interp)();
  it.run(P.stack, 'prog');
  it.run(P.circularQueue, 'prog');
  exec(it, 'enq("甲")\nenq("乙")\nenq("丙")\nenq("丁")');
  check('起始 head、tail、count', ev(it, '[head, tail, count]'), '[0, 4, 4]');
  exec(it, 'while count > 0:\n    push(deq())');
  check('(a) 堆疊由底至頂及 top', [ev(it, '[trunk[0], trunk[1], trunk[2], trunk[3]]'), ev(it, 'top')], ['[甲, 乙, 丙, 丁]', '3']);
  check('解釋：第一個迴圈後 head = tail = 4', ev(it, '[head, tail]'), '[4, 4]');
  exec(it, 'while top != -1:\n    enq(pop())');
  const c = it.clone();
  check('(b) 隊列由頭至尾', [1, 2, 3, 4].map(() => fmt(exec(c, 'deq()'))).join('、'), '丁、丙、乙、甲');
  check('(c) head、tail、count', ev(it, '[head, tail, count]'), '[4, 3, 4]');
  check('解釋：陣列', ev(it, 'bay'), '[丙, 乙, 甲, 丁, 丁]');
});
