'use strict';
// 模擬器所用程式必須與設計文件內的 Python 程式逐字相同
const fs = require('fs');
const path = require('path');
const { describe, check, Sims } = require('./lib.js');

const docDir = path.join(__dirname, '..', 'docs');
const docFile = fs.readdirSync(docDir).find(f => f.endsWith('.md'));
const doc = fs.readFileSync(path.join(docDir, docFile), 'utf8');

const blocks = [];
const re = /```python\n([\s\S]*?)```/g;
let m;
while ((m = re.exec(doc))) blocks.push(m[1].replace(/\s+$/, ''));

describe('程式與設計文件逐字相同', () => {
  check('文件內 Python 程式段數', blocks.length, 6);
  check('第一章 堆疊', Sims.PROGRAMS.stack, blocks[0]);
  check('第二章 隊列（移位版）', Sims.PROGRAMS.shiftQueue, blocks[1]);
  check('第三章 環形隊列', Sims.PROGRAMS.circularQueue, blocks[2]);
  check('第四章 鏈表', Sims.PROGRAMS.linkedList, blocks[3]);
  check('考試題 2 的 enq', Sims.PROGRAMS.examTailLast, blocks[4]);

  // 每行不超過約 30 字元（中文字當 2 格計）
  const width = s => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  for (const [name, src] of Object.entries(Sims.PROGRAMS)) {
    const long = src.split('\n').filter(l => width(l.replace(/\s+#.*$/, '')) > 32);
    check(`${name}：每行不超過約 30 字元`, long, []);
  }
});
