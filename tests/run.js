'use strict';
// 執行全部測試：node tests/run.js
// 有任何失敗 → 結束碼 1（Render 建置會停止，不會發佈）
const { results } = require('./lib.js');

for (const f of ['pyrun.test.js', 'programs.test.js', 'doc-answers.test.js', 'cpython.test.js', 'levels.test.js', 'score.test.js', 'exam.test.js', 'apps-script.test.js']) {
  try { require('./' + f); } catch (e) { results.fail.push(`[${f}] 測試程式出錯：${e.stack}`); }
}

console.log(`\n通過：${results.pass}`);
if (results.warn.length) {
  console.log(`\n⚠ 待確認（文件文字與模擬不符，未計作失敗）：${results.warn.length}`);
  results.warn.forEach(w => console.log('  - ' + w));
}
if (results.fail.length) {
  console.log(`\n✘ 失敗：${results.fail.length}`);
  results.fail.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('\n✔ 全部通過');
