# 的士佬日記

設計文件：`docs/的士佬日記_設計文件.md`

## 開發次序（每步完成後停下試玩）

1. 模擬器 + 自動測試 ← **已完成（2026-11-24）**
2. 第一章 1-2 完整畫面範本（像素風新版面）← **已完成**
3. 第一章全部關卡 ← **已完成**
4. 第二至四章 ← **已完成**
5. 考試模式 ← **已完成**
6. Google 登入、Sheets 成績記錄、老師控制台 ← **程式已完成；按 docs/設定教學.md 設定後上線**

## 素材

- `public/assets/`：美術素材（普通及 @2x；iPhone 用 @2x）。未有：bag_red / bag_blue / bag_yellow / bag_purple / bag_orange（暫用色塊）。
- `public/assets/bg/`：場景背景：首頁、第一章車尾箱、第二章的士站（夜）、第三章的士站（黃昏）、第四章維港地圖。
- `docs/screenshots/`：版面參考（只參考版面及像素風格）。

## 發佈

- GitHub Pages（`.github/workflows/pages.yml`）：每次推送到 `main`，先跑 `npm test`，全部通過才發佈 `public/`；測試失敗不會發佈。
- 第一次要在 repository **Settings → Pages → Source** 揀「GitHub Actions」。
- 遊戲：https://wychankelly-hub.github.io/taxi-python-game/
- 老師控制台：https://wychankelly-hub.github.io/taxi-python-game/teacher.html
- Google 登入及成績記錄的設定：`docs/設定教學.md`

## 資料夾

```
public/
  index.html              遊戲頁面（GitHub Pages 發佈 public/ 資料夾）
  css/base.css            色彩、字型、像素外框、按鈕
  css/pixel.css           狀態列、對白框、主場景、咪錶、程式區、操作面板、彈出視窗
  assets/                 美術素材（普通 + @2x）；bg/ 場景背景
  levels/ch1.json … ch4.json  四章關卡內容（文件沒有、由 Claude 新增的文字標有 "source": "新增"）
  js/pyrun.js             迷你 Python 解譯器
  js/sims.js              四種模擬器（程式與設計文件逐字相同）
  js/store.js             星數、營收（1 星 = $10）、進度儲存
  js/ui.js                共用工具、程式區（5 行，可展開）、人物頭像
  js/scenes/trunk.js      第一章主場景（車尾箱 + 行李 + 索引 + top 箭咀 + 咪錶）
  js/scenes/stand.js      第二、三章主場景（的士站；移動次數 + 黑煙；head/tail 牌 + 環形圖）
  js/scenes/route.js      第四章主場景（維港地圖路線 + data/nxt 兩行陣列 + 小的士）
  js/stepper.js           逐行執行彈出視窗
  js/level.js             關卡畫面及流程、收工結算
  js/tasks/predict.js     「預測」題
  js/tasks/operate.js     「操作」題（大型彩色按鈕；按鈕、次序、回饋在關卡 JSON 設定）
  js/tasks/fill.js        「填空」題（答錯可「試行」錯誤版本）
  js/tasks/order.js       「排列」題（點選程式行）
  js/tasks/bug.js         「捉錯」題（直接點程式行）
  js/exam.js              考試模式核心：產生題目、模擬器計算答案、評分、重做換數據（時限：TIME_LIMIT_MIN，預設 10 分鐘）
  js/exam-ui.js           考試模式畫面（計時、作答、交卷、結果及解釋）
  js/config.js            Google 用戶端 ID 及 Apps Script 網址（第 6 步填寫）
  js/sync.js              Google 登入、成績補傳、取回自己的成績、老師解鎖
  teacher.html, js/teacher.js, css/teacher.css  老師控制台
  js/app.js               首頁、更份、解鎖、重溫
apps-script/Code.gs       Apps Script 後端（驗證 Google 登入、寫入 Google Sheets、老師資料及解鎖）
apps-script/appsscript.json
docs/設定教學.md          第 6 步一步一步設定教學
tests/                    自動測試（npm test）
build.js                  打包成單一 HTML（dist/taxi-diary.html）
```

行李素材（bag_red 等）放入 `public/assets/` 後會自動取代色塊，不用改程式。

老師測試：網址最後加 `#unlock` 解鎖全部關卡，加 `#lock` 回復（第 6 步改為老師控制台）。

