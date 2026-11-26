'use strict';
// 打包成單一 HTML（dist/taxi-diary.html），圖片以 data URI 內嵌，方便直接在手機開啟試玩。
// 腳本次序跟 public/index.html 相同。
const fs = require('fs');
const path = require('path');
const pub = p => path.join(__dirname, 'public', p);
const read = p => fs.readFileSync(pub(p), 'utf8');

const html = read('index.html');
const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => read(m[1])).join('\n');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const js = scripts.map(f => `<script>\n${read(f).replace(/<\/script/gi, '<\\/script')}\n</script>`).join('\n');

// 素材：所有 @2x PNG + 用得着的背景
const BGS = ['bg_home', 'bg_ch1_trunk', 'bg_ch2_stand', 'bg_ch3_stand_dusk', 'bg_ch4_map'];
const assets = {};
for (const f of fs.readdirSync(pub('assets'))) {
  const m = f.match(/^(.+)@2x\.png$/);
  if (m) assets[m[1]] = 'data:image/png;base64,' + fs.readFileSync(pub('assets/' + f)).toString('base64');
}
for (const b of BGS) assets[b] = 'data:image/jpeg;base64,' + fs.readFileSync(pub(`assets/bg/${b}.jpg`)).toString('base64');

const data = {};
for (const n of [1, 2, 3, 4]) data['ch' + n] = JSON.parse(read(`levels/ch${n}.json`));
const out = `<title>的士佬日記</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#11131f">
<style>
${css}
</style>
<main id="app" class="app"></main>
<script>window.TSD_DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};
window.TSD_ASSETS = ${JSON.stringify(assets)};</script>
${js}
`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'taxi-diary.html'), out);
console.log(`已輸出 dist/taxi-diary.html ${(out.length / 1024).toFixed(0)} KB（素材 ${Object.keys(assets).length} 個）`);
