/* sims.js — 四種數據結構的模擬器
 *
 * 每個模擬器 = 設計文件內該章的 Python 程式原文（逐字相同，測試會對比文件），
 * 交給 pyrun.js 執行。所以模擬結果就是那段 Python 程式真正執行的結果，
 * 包括 pop 後舊資料仍留在陣列、移位後最後一格保留舊值等。
 */
(function (root) {
  'use strict';
  const PyRun = root.PyRun || (typeof require !== 'undefined' ? require('./pyrun.js') : null);

  const PROGRAMS = {
    // 第一章　堆疊
    stack: [
      'trunk = [None] * 5',
      'top = -1',
      '',
      'def push(x):',
      '    global top',
      '    if top == 4:',
      '        print("車尾箱已滿")',
      '    else:',
      '        top = top + 1',
      '        trunk[top] = x',
      '',
      'def pop():',
      '    global top',
      '    if top == -1:',
      '        print("車尾箱冇嘢")',
      '        return None',
      '    else:',
      '        x = trunk[top]',
      '        top = top - 1',
      '        return x',
    ].join('\n'),

    // 第二章　隊列（移位版）
    shiftQueue: [
      'rank = [None] * 5',
      'count = 0',
      '',
      'def enq(x):',
      '    global count',
      '    if count == 5:',
      '        print("的士站已滿")',
      '    else:',
      '        rank[count] = x',
      '        count = count + 1',
      '',
      'def deq():',
      '    global count',
      '    if count == 0:',
      '        print("的士站冇車")',
      '        return None',
      '    x = rank[0]',
      '    for i in range(count - 1):',
      '        rank[i] = rank[i + 1]',
      '    count = count - 1',
      '    return x',
    ].join('\n'),

    // 第三章　環形隊列
    circularQueue: [
      'bay = [None] * 5',
      'head = 0      # 下一架車 (front)',
      'tail = 0      # 下一個空位 (next empty bay)',
      'count = 0     # 有幾多架車',
      '',
      'def enq(x):',
      '    global tail, count',
      '    if count == 5:',
      '        print("的士站已滿")',
      '    else:',
      '        bay[tail] = x',
      '        tail = (tail + 1) % 5',
      '        count = count + 1',
      '',
      'def deq():',
      '    global head, count',
      '    if count == 0:',
      '        print("的士站冇車")',
      '        return None',
      '    x = bay[head]',
      '    head = (head + 1) % 5',
      '    count = count - 1',
      '    return x',
    ].join('\n'),

    // 第四章　鏈表
    linkedList: [
      'data = [None] * 5',
      'nxt = [None] * 5',
      'head = -1',
      '',
      'def insert_after(p, new, stop):',
      '    data[new] = stop',
      '    nxt[new] = nxt[p]',
      '    nxt[p] = new',
      '',
      'def delete_after(p):',
      '    nxt[p] = nxt[nxt[p]]',
      '',
      'def show_route():',
      '    p = head',
      '    while p != -1:',
      '        print(data[p])',
      '        p = nxt[p]',
    ].join('\n'),

    // 考試模式題 2：tail 指向最後一個項目的 enq（文件原文）
    examTailLast: [
      'def enq(x):',
      '    global tail, count',
      '    if count == 5:',
      '        print("隊列已滿")',
      '    else:',
      '        tail = (tail + 1) % 5',
      '        q[tail] = x',
      '        count = count + 1',
    ].join('\n'),
  };

  /* 建立一個模擬器：先執行該章程式（定義函式及初始變量），再執行 setup。 */
  function create(name, setup) {
    if (!PROGRAMS[name]) throw new Error('沒有這個模擬器：' + name);
    const it = new PyRun.Interp();
    const r = it.run(PROGRAMS[name], 'prog');
    if (!r.ok) throw r.error;
    if (setup) {
      const s = it.run(setup, 'setup');
      if (!s.ok) throw s.error;
    }
    return it;
  }

  const api = { PROGRAMS, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sims = api;
})(typeof window !== 'undefined' ? window : globalThis);
