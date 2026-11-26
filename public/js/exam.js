/* exam.js — 考試模式核心：產生題目、用模擬器計算答案、評分（沒有畫面，Node 測試亦可使用）
 * 5 題、20 分（設計文件「考試模式」）。答案全部由模擬器計算，不手寫。
 * 「重做」：題 1、題 2 的操作序列換成另一組字母（同一結構），答案重新計算。
 */
(function (root) {
  'use strict';
  const PyRun = root.PyRun || require('./pyrun.js');
  const Sims = root.Sims || require('./sims.js');
  const fmt = PyRun.fmt;
  const P = Sims.PROGRAMS;

  function fnText(src, name) {
    const lines = src.split('\n');
    const s = lines.findIndex(l => l.startsWith('def ' + name + '('));
    let e = s + 1;
    while (e < lines.length && lines[e].startsWith(' ')) e++;
    return lines.slice(s, e).join('\n');
  }
  function must(r) { if (!r.ok) throw r.error; return r; }

  /** 可重現的亂數 */
  function rng(seed) {
    let s = (seed * 2654435761) % 4294967296 || 1;
    return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  }
  function pickLetters(r, n, avoid) {
    const pool = 'ABCDEFGHJKLMNPRSTUVWXYZ'.split('').filter(c => !(avoid || []).includes(c));
    const out = [];
    while (out.length < n) { const c = pool.splice(Math.floor(r() * pool.length), 1)[0]; out.push(c); }
    return out;
  }
  const opsText = ops => ops.map(o => '`' + o + '`').join('、');

  /* ---------- 題 1　堆疊追蹤 ---------- */
  function q1(L) {
    const ops = [`push("${L[0]}")`, `push("${L[1]}")`, `push("${L[2]}")`, 'pop()', `push("${L[3]}")`, 'pop()', 'pop()', `push("${L[4]}")`, `push("${L[5]}")`];
    const it = Sims.create('stack');
    const pops = [];
    for (const o of ops) { const r = must(it.run(o, 'run')); if (o === 'pop()') pops.push(fmt(r.result)); }
    const arr = it.eval('trunk').map(fmt);
    return {
      id: 'Q1', title: '堆疊追蹤', marks: 3,
      intro: `某的士公司以堆疊記錄車輛維修單號，程式與第一章相同（容量 5，起始時 \`top = -1\`）。依次執行：${opsText(ops)}。`,
      code: P.stack, codeNote: '第一章程式',
      parts: [
        { id: 'a', marks: 1, prompt: '三次 `pop()` 的輸出次序', input: { type: 'seq', n: 3, labels: ['第 1 次', '第 2 次', '第 3 次'], choices: L.slice() }, answer: pops },
        { id: 'b', marks: 1, prompt: '最後陣列 0 至 4 格的內容', input: { type: 'cells', n: 5, choices: L.concat(['None']) }, answer: arr },
        { id: 'c', marks: 1, prompt: '最後 `top` 的值', input: { type: 'num', min: -1, max: 4 }, answer: it.eval('top') },
      ],
      explain: {
        a: `每次 pop 取出頂部項目：${pops.join('、')}。`,
        b: `pop 不會刪除陣列內的資料，之後 push 會覆蓋：${arr.join('、')}。`,
        c: `最後堆疊內有 ${it.eval('top') + 1} 個項目，所以 \`top = ${it.eval('top')}\`。`,
      },
    };
  }

  /* ---------- 題 2　另一種環形隊列（tail 指向最後一個項目） ---------- */
  function q2Interp() {
    const it = new PyRun.Interp();
    must(it.run('q = [None] * 5\nhead = 0\ntail = -1\ncount = 0', 'prog'));
    must(it.run(P.examTailLast, 'prog'));
    must(it.run(fnText(P.circularQueue, 'deq').replace(/bay/g, 'q'), 'prog'));
    return it;
  }
  function q2(L) {
    const ops = [`enq("${L[0]}")`, `enq("${L[1]}")`, `enq("${L[2]}")`, `enq("${L[3]}")`, 'deq()', 'deq()', `enq("${L[4]}")`, `enq("${L[5]}")`];
    const it = q2Interp();
    for (const o of ops) must(it.run(o, 'run'));
    const arr = it.eval('q').map(fmt);
    // (c) 空及滿時 (tail + 1) % 5 == head 都成立
    const empty = q2Interp(), full = q2Interp();
    must(full.run('enq("A")\nenq("B")\nenq("C")\nenq("D")\nenq("E")', 'run'));
    const bothTrue = empty.eval('(tail + 1) % 5 == head') === true && full.eval('(tail + 1) % 5 == head') === true;
    return {
      id: 'Q2', title: '另一種環形隊列', marks: 4,
      intro: `以下環形隊列中，\`tail\` 指向**最後一個項目**（與遊戲其他部分不同）。起始時 \`head = 0\`、\`tail = -1\`、\`count = 0\`。\`deq()\` 與第三章相同。依次執行：${opsText(ops)}。`,
      code: P.examTailLast, codeNote: '題 2 的 enq',
      parts: [
        { id: 'a', marks: 2, scoring: 'oneWrongHalf', prompt: '最後陣列 0 至 4 格的內容（全對 2 分，錯一格 1 分）', input: { type: 'cells', n: 5, choices: L.concat(['None']) }, answer: arr },
        { id: 'b', marks: 1, prompt: '最後 `head` 及 `tail`（兩個都對才得分）', input: { type: 'nums', names: ['head', 'tail'], min: -1, max: 4 }, answer: [it.eval('head'), it.eval('tail')] },
        { id: 'c', marks: 1, prompt: '有建議刪去 `count`，改以 `head` 與 `tail` 的關係判斷隊列是空還是滿。你同意嗎？（立場及原因都正確才得分）',
          input: { type: 'stance', reasons: [
            '隊列是空或是滿時，`(tail + 1) % 5 == head` 同樣成立，無法分辨',
            '`head` 與 `tail` 永遠不會相等，所以一定分得到',
            '刪去 `count` 可以令程式行得較快',
            '只要比較 `head` 及 `tail` 的大小便可分辨'] },
          answer: { stance: '不同意', reason: 0 }, verified: bothTrue },
      ],
      explain: {
        a: `\`tail\` 先前進再放入；兩次 deq 後 \`head = 2\`，之後 ${L[4]} 放入索引 4，${L[5]} 兜返個圈放入索引 0：${arr.join('、')}。`,
        b: `\`head = ${it.eval('head')}\`，\`tail = ${it.eval('tail')}\`。`,
        c: '不同意。隊列是空或是滿時，`(tail + 1) % 5 == head` 同樣成立，無法分辨，所以仍然需要 `count`。',
      },
    };
  }

  /* ---------- 題 3　效率比較 ---------- */
  function q3() {
    const big = new PyRun.Interp();
    must(big.run(P.shiftQueue.replace(/\b5\b/g, '50'), 'prog'));
    must(big.run('for i in range(50):\n    enq(i)', 'setup'));
    const t1 = must(big.run('deq()', 'run', { trace: true })).trace;
    const moves = t1.reduce((n, s) => n + s.access.filter(a => a.w && a.name === 'rank').length, 0);
    const c = Sims.create('circularQueue', 'for i in range(5):\n    enq(i)');
    const t2 = must(c.run('deq()', 'run', { trace: true })).trace;
    const moves2 = t2.reduce((n, s) => n + s.access.filter(a => a.w && a.name === 'bay').length, 0);
    return {
      id: 'Q3', title: '效率比較', marks: 3,
      intro: '比較移位版隊列（第二章）及環形隊列（第三章）。',
      parts: [
        { id: 'a', marks: 1, prompt: '移位版隊列容量 50 並已滿，執行一次 `deq()` 要移動多少個項目？', input: { type: 'num', min: 0, max: 60, big: true }, answer: moves },
        { id: 'b', marks: 1, prompt: '同一情況下，環形隊列執行一次 `deq()` 要移動多少個項目？', input: { type: 'num', min: 0, max: 60, big: true }, answer: moves2 },
        { id: 'c', marks: 1, prompt: '有建議在環形隊列的 `deq()` 中必須加入 `q[head] = None`，否則隊列會出錯。你同意嗎？（立場及原因都正確才得分）',
          input: { type: 'stance', reasons: [
            '哪些項目屬於隊列由 `head` 及 `count` 決定，舊資料之後會被 `enq` 覆蓋',
            '不清除的話，`deq()` 會傳回舊資料',
            '清除之後 `head` 才可以前進',
            '`q[head] = None` 可以節省記憶體'] },
          answer: { stance: '不同意', reason: 0 } },
      ],
      explain: {
        a: `除隊頭外，其餘 ${moves} 個項目都要向前移一格。`,
        b: '環形隊列只移動 `head`，不移動資料。',
        c: '不同意。哪些項目屬於隊列由 `head` 及 `count` 決定，舊資料之後會被 `enq` 覆蓋。',
      },
    };
  }

  /* ---------- 題 4　鏈表 ---------- */
  const Q4_SETUP = 'data = ["新界", None, "九龍", "港島", None]\nnxt = [-1, None, 3, 0, None]\nhead = 2';
  function route(it) {
    const c = it.clone();
    const r = c.run('show_route()', 'route', { stepLimit: 400 });
    return r.ok ? r.output : ['（不停兜圈）'];
  }
  function q4() {
    const it = Sims.create('linkedList', Q4_SETUP);
    const r0 = route(it);
    const B1 = ['nxt[3]', 'nxt[2]', '-1', '3'], B2 = ['1', '3', '0', 'nxt[1]'];
    // (b) 用模擬器找出唯一令路線正確的組合
    const want = ['九龍', '港島', '離島', '新界'];
    const good = [];
    for (const a of B1) for (const b of B2) {
      const c = it.clone();
      const r = c.run(`data[1] = "離島"\nnxt[1] = ${a}\nnxt[3] = ${b}`, 'run');
      if (r.ok && fmt(route(c)) === fmt(want)) good.push([a, b]);
    }
    const after = it.clone();
    must(after.run('data[1] = "離島"\nnxt[1] = nxt[3]\nnxt[3] = 1', 'run'));
    const r1 = route(after);
    must(after.run('head = nxt[head]', 'run'));
    return {
      id: 'Q4', title: '鏈表', marks: 5,
      intro: '`data = [新界, None, 九龍, 港島, None]`，`nxt = [-1, None, 3, 0, None]`，`head = 2`。',
      code: P.linkedList, codeNote: '第四章程式',
      parts: [
        { id: 'a', marks: 1, prompt: '鏈表的次序', input: { type: 'seq', n: 3, labels: ['第 1 個', '第 2 個', '第 3 個'], choices: ['新界', '九龍', '港島', '離島'] }, answer: r0 },
        { id: 'b1', marks: 1, prompt: '把「離島」放入索引 1，並插在港島之後。完成：`nxt[1] = ____`', input: { type: 'choice', options: B1, mono: true }, answer: good.length === 1 ? good[0][0] : null },
        { id: 'b2', marks: 1, prompt: '同上，完成：`nxt[3] = ____`', input: { type: 'choice', options: B2, mono: true }, answer: good.length === 1 ? good[0][1] : null },
        { id: 'c', marks: 1, prompt: '接著刪除第一個節點。`head` 的新值及鏈表次序（兩項都對才得分）',
          input: { type: 'numseq', name: 'head', min: -1, max: 4, n: 3, labels: ['第 1 個', '第 2 個', '第 3 個'], choices: ['新界', '九龍', '港島', '離島'] },
          answer: { num: after.eval('head'), seq: route(after) } },
        { id: 'd', marks: 1, prompt: '有建議用對分檢索在這個鏈表中尋找地區名稱。你同意嗎？（立場及原因都正確才得分）',
          input: { type: 'stance', reasons: [
            '鏈表不能直接存取中間的節點，必須由 `head` 逐個節點走',
            '鏈表佔用較多記憶體',
            '對分檢索只可以用於數字',
            '鏈表的資料存放在 `data` 陣列中'] },
          answer: { stance: '不同意', reason: 0 } },
      ],
      explain: {
        a: `由 \`head = 2\` 開始跟 \`nxt\` 走：${r0.join(' → ')}。`,
        b1: '先把新節點接去港島原本的下一個節點：`nxt[1] = nxt[3]`（即 0）。',
        b2: `再把港島指去新節點：\`nxt[3] = 1\`。路線：${r1.join(' → ')}。`,
        c: `\`head = nxt[head]\`，即 \`head = ${after.eval('head')}\`；次序：${route(after).join(' → ')}。`,
        d: '不同意。鏈表不能直接存取中間的節點，必須由 `head` 逐個節點走，所以不能用對分檢索。',
      },
    };
  }

  /* ---------- 題 5　堆疊與隊列結合 ---------- */
  function q5() {
    const it = new PyRun.Interp();
    must(it.run(P.stack, 'prog'));
    must(it.run(P.circularQueue, 'prog'));
    must(it.run('enq("甲")\nenq("乙")\nenq("丙")\nenq("丁")', 'setup'));
    const start = [it.eval('head'), it.eval('tail'), it.eval('count')];
    must(it.run('while count > 0:\n    push(deq())', 'run'));
    const top = it.eval('top');
    const stack = it.eval('trunk').slice(0, top + 1).map(fmt);
    must(it.run('while top != -1:\n    enq(pop())', 'run'));
    const final = [it.eval('head'), it.eval('tail'), it.eval('count')];
    const c = it.clone();
    const order = [];
    for (let i = 0; i < 4; i++) order.push(fmt(must(c.run('deq()', 'run')).result));
    const items = ['甲', '乙', '丙', '丁'];
    return {
      id: 'Q5', title: '堆疊與隊列結合', marks: 5,
      intro: `環形隊列（第三章版本）內由頭至尾有：甲、乙、丙、丁，\`head = ${start[0]}\`、\`tail = ${start[1]}\`、\`count = ${start[2]}\`；堆疊 S 為空。執行以下程式：`,
      code: 'while count > 0:\n    push(deq())\nwhile top != -1:\n    enq(pop())', codeNote: '題 5 程式',
      parts: [
        { id: 'a', marks: 1, prompt: '第一個迴圈完成後，堆疊由底至頂的內容及 `top`（兩項都對才得分）',
          input: { type: 'numseq', name: 'top', min: -1, max: 4, n: 4, labels: ['底', '', '', '頂'], choices: items }, answer: { num: top, seq: stack } },
        { id: 'b', marks: 1, prompt: '全部完成後，隊列由頭至尾的次序', input: { type: 'seq', n: 4, labels: ['頭', '', '', '尾'], choices: items }, answer: order },
        { id: 'c', marks: 2, scoring: 'twoOfThree', prompt: '全部完成後 `head`、`tail`、`count`（三個全對 2 分，對兩個 1 分）',
          input: { type: 'nums', names: ['head', 'tail', 'count'], min: -1, max: 5 }, answer: final },
        { id: 'd', marks: 1, prompt: '這段程式的目的', input: { type: 'choice', options: ['把隊列內項目的次序倒轉', '把隊列清空', '把堆疊內的項目排序', '把隊列內的項目複製一份'] }, answer: '把隊列內項目的次序倒轉' },
      ],
      explain: {
        a: `第一個迴圈把隊列項目依次放入堆疊：由底至頂 ${stack.join('、')}，\`top = ${top}\`。`,
        b: `第二個迴圈由頂部取出，所以次序倒轉：${order.join('、')}。`,
        c: `第一個迴圈後 \`head = tail = ${start[1]}\`；之後四個項目放入索引 ${start[1]}、0、1、2，所以 \`head = ${final[0]}\`、\`tail = ${final[1]}\`、\`count = ${final[2]}\`。陣列最後是 [${it.eval('bay').map(fmt).join(', ')}]，索引 3 的丁是舊資料。`,
        d: '先全部放入堆疊再取出，後進先出令次序倒轉。',
      },
    };
  }

  /** variant 0 = 設計文件原題；其他 = 重做時換字母 */
  function build(variant) {
    let L1 = ['P', 'Q', 'R', 'S', 'T', 'U'], L2 = ['A', 'B', 'C', 'D', 'E', 'F'];
    if (variant) {
      const r = rng(variant + 7);
      L1 = pickLetters(r, 6);
      L2 = pickLetters(r, 6);
    }
    const qs = [q1(L1), q2(L2), q3(), q4(), q5()];
    return { variant: variant || 0, total: qs.reduce((n, q) => n + q.marks, 0), questions: qs };
  }

  /* ---------- 評分 ---------- */
  const same = (a, b) => fmt(a) === fmt(b);
  function gradePart(part, resp) {
    const ans = part.answer;
    if (resp === undefined || resp === null) return 0;
    switch (part.input.type) {
      case 'seq':
      case 'cells': {
        const wrong = ans.filter((v, i) => !same(v, resp[i])).length;
        if (wrong === 0) return part.marks;
        if (part.scoring === 'oneWrongHalf' && wrong === 1) return part.marks - 1;
        return 0;
      }
      case 'num': return same(ans, resp) ? part.marks : 0;
      case 'nums': {
        const right = ans.filter((v, i) => same(v, resp[i])).length;
        if (right === ans.length) return part.marks;
        if (part.scoring === 'twoOfThree' && right === ans.length - 1) return part.marks - 1;
        return 0;
      }
      case 'numseq': return same(ans.num, resp.num) && ans.seq.every((v, i) => same(v, (resp.seq || [])[i])) ? part.marks : 0;
      case 'choice': return resp === ans ? part.marks : 0;
      case 'stance': return resp.stance === ans.stance && resp.reason === ans.reason ? part.marks : 0;
    }
    return 0;
  }
  function grade(exam, responses) {
    const byQ = {};
    let total = 0;
    for (const q of exam.questions) {
      const parts = {};
      let qm = 0;
      for (const p of q.parts) { const m = gradePart(p, ((responses || {})[q.id] || {})[p.id]); parts[p.id] = m; qm += m; }
      byQ[q.id] = { marks: qm, of: q.marks, parts };
      total += qm;
    }
    return { total, of: exam.total, byQ, level: levelOf(total) };
  }
  function levelOf(total) {
    if (total >= 17) return '的士王';
    if (total >= 12) return '熟手司機';
    if (total >= 6) return '學師中';
    return '返去重溫第一章';
  }

  /** 正確答案（作答格式），用於測試及顯示 */
  function correctResponses(exam) {
    const r = {};
    for (const q of exam.questions) { r[q.id] = {}; for (const p of q.parts) r[q.id][p.id] = p.answer; }
    return r;
  }

  const api = { build, grade, gradePart, levelOf, correctResponses, TIME_LIMIT_MIN: 10 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Exam = api;
})(typeof window !== 'undefined' ? window : globalThis);
