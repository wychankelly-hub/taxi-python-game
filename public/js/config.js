/* config.js — 第 6 步設定（見 docs/設定教學.md）
 * 兩項都填好後，首頁才會出現「用 Google 登入」；未填好時遊戲照玩，只是不傳送成績。
 */
window.TSD_CONFIG = {
  // Google Cloud → API 和服務 → 憑證 → OAuth 2.0 用戶端 ID（網頁應用程式）
  googleClientId: '',
  // Apps Script → 部署 → 網頁應用程式網址（…/exec）
  appsScriptUrl: '',
};
