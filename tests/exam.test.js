'use strict';
// 考試模式：答案（由模擬器計算）必須等於設計文件；評分規則；「重做」產生的新題目
const { describe, check, PyRun } = require('./lib.js');
const Exam = require('../public/js/exam.js');
const fmt = PyRun.fmt;

describe('考試模式：原題答案等於設計文件', () => {
  const ex = Exam.build(0);
  const A = (q, p) => ex.questions.find(x => x.id === q).parts.find(x => x.id === p).answer;
  check('總分 20', ex.total, 20);
  check('每題分數 3、4、3、5、5', ex.questions.map(q => q.marks), [3, 4, 3, 5, 5]);
  check('每題各小題分數加起來等於該題分數', ex.questions.map(q => q.parts.reduce((n, p) => n + p.marks, 0)), [3, 4, 3, 5, 5]);
  check('題 1 (a) R、S、Q', A('Q1', 'a'), ['R', 'S', 'Q']);
  check('題 1 (b) P、T、U、None、None', A('Q1', 'b'), ['P', 'T', 'U', 'None', 'None']);
  check('題 1 (c) top = 2', A('Q1', 'c'), 2);
  check('題 2 (a) F、B、C、D、E', A('Q2', 'a'), ['F', 'B', 'C', 'D', 'E']);
  check('題 2 (b) head = 2，tail = 0', A('Q2', 'b'), [2, 0]);
  check('題 2 (c) 空及滿時條件同樣成立（模擬核對）', ex.questions[1].parts[2].verified, true);
  check('題 3 (a) 49', A('Q3', 'a'), 49);
  check('題 3 (b) 0', A('Q3', 'b'), 0);
  check('題 4 (a) 九龍 → 港島 → 新界', A('Q4', 'a'), ['九龍', '港島', '新界']);
  check('題 4 (b) nxt[1] = nxt[3]（唯一正確組合）', A('Q4', 'b1'), 'nxt[3]');
  check('題 4 (b) nxt[3] = 1', A('Q4', 'b2'), '1');
  check('題 4 (c) head = 3；港島 → 離島 → 新界', A('Q4', 'c'), { num: 3, seq: ['港島', '離島', '新界'] });
  check('題 5 (a) 甲、乙、丙、丁；top = 3', A('Q5', 'a'), { num: 3, seq: ['甲', '乙', '丙', '丁'] });
  check('題 5 (b) 丁、丙、乙、甲', A('Q5', 'b'), ['丁', '丙', '乙', '甲']);
  check('題 5 (c) 4、3、4', A('Q5', 'c'), [4, 3, 4]);
  check('每個選擇題的答案都在選項內', ex.questions.flatMap(q => q.parts.filter(p => p.input.type === 'choice').map(p => p.input.options.includes(p.answer))).every(Boolean), true);
  check('每個 seq / cells 答案都在選單內', ex.questions.flatMap(q => q.parts.filter(p => ['seq', 'cells'].includes(p.input.type)).map(p => p.answer.every(v => p.input.choices.includes(v)))).every(Boolean), true);
});

describe('考試模式：評分', () => {
  const ex = Exam.build(0);
  const full = Exam.correctResponses(ex);
  check('全對 20 分，等級「的士王」', [Exam.grade(ex, full).total, Exam.grade(ex, full).level], [20, '的士王']);
  check('交白卷 0 分，等級「返去重溫第一章」', [Exam.grade(ex, {}).total, Exam.grade(ex, {}).level], [0, '返去重溫第一章']);
  const r = JSON.parse(JSON.stringify(full));
  r.Q2.a[0] = 'None';
  check('題 2 (a) 錯一格得 1 分', Exam.grade(ex, r).byQ.Q2.parts.a, 1);
  r.Q2.a[1] = 'None';
  check('題 2 (a) 錯兩格得 0 分', Exam.grade(ex, r).byQ.Q2.parts.a, 0);
  const s = JSON.parse(JSON.stringify(full));
  s.Q5.c = [4, 3, 0];
  check('題 5 (c) 對兩個得 1 分', Exam.grade(ex, s).byQ.Q5.parts.c, 1);
  s.Q5.c = [4, 0, 0];
  check('題 5 (c) 對一個得 0 分', Exam.grade(ex, s).byQ.Q5.parts.c, 0);
  const t = JSON.parse(JSON.stringify(full));
  t.Q2.c = { stance: '不同意', reason: 1 };
  check('立場對、原因錯：0 分', Exam.grade(ex, t).byQ.Q2.parts.c, 0);
  t.Q2.c = { stance: '同意', reason: 0 };
  check('原因對、立場錯：0 分', Exam.grade(ex, t).byQ.Q2.parts.c, 0);
  const u = JSON.parse(JSON.stringify(full));
  u.Q4.c = { num: 3, seq: ['港島', '新界', '離島'] };
  check('題 4 (c) head 對、次序錯：0 分', Exam.grade(ex, u).byQ.Q4.parts.c, 0);
  check('等級分界', [17, 16, 12, 11, 6, 5].map(Exam.levelOf), ['的士王', '熟手司機', '熟手司機', '學師中', '學師中', '返去重溫第一章']);
});

describe('考試模式：「重做」換題（30 個版本）', () => {
  const seen = new Set();
  for (let v = 1; v <= 30; v++) {
    const ex = Exam.build(v);
    const q1 = ex.questions[0], q2 = ex.questions[1];
    const L1 = q1.parts[0].input.choices, L2 = q2.parts[0].input.choices.slice(0, 6);
    seen.add(L1.join('') + L2.join(''));
    check(`版本 ${v}：字母不重複`, [new Set(L1).size, new Set(L2).size], [6, 6]);
    check(`版本 ${v}：題 1 結構相同（pop 次序 = 第 3、4、2 個）`, q1.parts[0].answer, [L1[2], L1[3], L1[1]]);
    check(`版本 ${v}：題 1 陣列`, q1.parts[1].answer, [L1[0], L1[4], L1[5], 'None', 'None']);
    check(`版本 ${v}：題 2 陣列`, q2.parts[0].answer, [L2[5], L2[1], L2[2], L2[3], L2[4]]);
    check(`版本 ${v}：題 2 head、tail`, q2.parts[1].answer, [2, 0]);
    check(`版本 ${v}：全對 20 分`, Exam.grade(ex, Exam.correctResponses(ex)).total, 20);
  }
  check('30 個版本的字母組合各不相同', seen.size, 30);
});
