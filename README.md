# 粵讀 Cantonese Reader

粵讀是一個只在使用者裝置處理內容的私人 PWA。它從文字型 PDF 抽取文章，以香港粵語 Jyutping 在每個中文字上方排版，並把文章和閱讀位置保存在 IndexedDB。沒有帳號、伺服器上傳或雲端同步。

## 本機運行

需要 Node.js 20.19+（20.x）或 22.12+（建議 Node 22）和 npm。

```bash
npm install
npm run dev
```

然後開啟終端顯示的本機網址。完整檢查：

```bash
npm run check
npm run test:e2e
```

端對端測試預設使用本機 Google Chrome；如未安裝 Chrome，可先執行 `npx playwright install chromium`，並把 `playwright.config.ts` 內兩個 `channel: 'chrome'` 移除。

`npm run check` 會執行單元測試、TypeScript build、PWA build 檢查，並確認 PDF.js worker 已加入離線 precache。端對端測試會啟動 production preview，以 iPhone 和 iPad 尺寸匯入一份真正包含中文 Unicode 對照的 PDF，再檢查 ruby 對齊、粵典網址、閱讀位置、IndexedDB 持久化及離線重開文章。

## 部署到 GitHub Pages

專案已包含 [deploy-pages.yml](.github/workflows/deploy-pages.yml)。

1. 在 GitHub 建立 repository，把這個資料夾的內容推到 `main` branch。
2. 在 repository 的 **Settings → Pages → Build and deployment**，把 Source 選為 **GitHub Actions**。
3. 推送到 `main`，等待 **Deploy to GitHub Pages** workflow 完成。
4. 以 iPhone／iPad 開啟 workflow 顯示的 HTTPS 網址。

Vite 使用相對資產路徑，所以 repository project URL（例如 `https://name.github.io/yuedu/`）和自訂 domain 都不需再改 `base`。

免費 GitHub Pages 網站本身通常是公開網址，並不提供登入保護；但 PDF、文章文字和閱讀位置都只存在每部裝置的 IndexedDB，從不寫入 repository 或上傳到 GitHub。若 repository／網站也必須私有，需要支援 private Pages 的 GitHub 方案或另一個有存取控制的託管服務。

## 加入 iPhone／iPad 主畫面

1. 用 Safari 開啟部署網址（iOS／iPadOS 16.4+ 也可從支援的其他瀏覽器分享選單安裝）。
2. 點「分享」。
3. 選「加入主畫面」。
4. 保留名稱「粵讀」，再點「加入」。

首次上線開啟後，app shell、PDF.js worker 和粵拼資料會由 Service Worker 快取。已匯入文章由 IndexedDB 提供，可離線閱讀；查粵典網頁仍需要網絡，已安裝的粵典 App 則由 iOS Universal Link 自行接管。

## iOS／PDF 限制

- 掃描版、沒有文字層的 PDF 只會顯示提示；第一版沒有 OCR。
- PDF 沒有保證一致的閱讀順序。一般單欄文章會按 PDF 內容順序重排；複雜多欄、表格或製作不良的 PDF 可能需要原檔修正。
- 受密碼保護的 PDF 暫不支援。
- 網頁不能可靠偵測粵典 App 是否已安裝，所以使用 `https://words.hk/zidin/詞語` 的 Universal Link：有 App 時由 iOS 開 App，否則開網站。
- iOS 不允許 PWA 把「查粵典」插入原生選字選單，因此長按選詞後會顯示一個獨立的浮動按鈕。
- IndexedDB 通常會長期保留；安裝到主畫面後 app 亦會要求 persistent storage。不過使用者刪除網站資料、移除 PWA 或裝置儲存空間極度不足時，iOS 仍可能清除資料。

## 私隱

PDF 透過瀏覽器的 File input 讀取，PDF.js、`to-jyutping`、IndexedDB 和 Service Worker 全部在本機運行。程式沒有分析服務、遙測、登入、API 或上傳端點。
