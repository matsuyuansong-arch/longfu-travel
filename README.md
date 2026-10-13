# longfu-travel｜龍福旅行社官網

純靜態多頁 HTML，一個資料夾配一個 `index.html`，無框架、無建置工具。
架構與內容規格見 Dropbox：`Claude-Cowork/mac-projects/work/龍福旅行社/龍福旅行社官網/龍福旅行社網站架構初稿_v1.md`。
舊站盤點與切換計畫：`Claude-Cowork/mac-projects/work/龍福旅行社/龍福旅行社官網/官網matsu-tour_盤點與自建計畫_v1.md`。

正式網域：`www.matsu-tour.com.tw`（HiNet 註冊，2027-06-10 到期）。舊站（Fillo 租用）2026-10 月底終止。

## 目前頁面（緊急上線版，2026-10-13）

| 路徑 | 內容 |
|---|---|
| `index.html` | 首頁：四條團體行程卡、機加酒方案、聯絡 |
| `about/` | 關於龍福：沿革、法人資訊、集團架構 |
| `contact/` | 電話、LINE、FB、包團與同業 |
| `legal/` | 旅遊契約、執照與保險、隱私權 |
| `privacy/` | 舊網址 `/privacy` 轉到 `legal/#privacy` |
| `404.html` | 舊網址 `/products/...`、`/member` 等，3 秒後回首頁 |
| `robots.txt`、`sitemap.xml` | 搜尋引擎設定 |

舊網址 `/about`、`/contact` 由 GitHub Pages 自動補斜線接到新頁。

## 有期限的內容

- **首頁 `#package` 機加酒補助方案**：住宿日 115.11.30 截止，12 月起刪除或改常態版
- **`legal/` 履約保證保險期間** 2026/04/19 – 2027/04/19，續保後更新

## 下一批（架構初稿 W2 之後）

四條行程獨立頁 `/tours/...`、包團、同業、旅遊須知、FAQ。建好後把首頁卡片的「洽詢」改回「看行程」。

## 本機預覽

```bash
python3 -m http.server 8961 -d ~/longfu-travel
```

## 切換網域（舊站到期前做）

`CNAME` 檔刻意先不放：放了之後 github.io 測試網址會被轉到正式網域，而正式網域那時還指向舊站，就沒辦法測。

1. 測試網址 `https://matsuyuansong-arch.github.io/longfu-travel/` 每頁點過
2. HiNet DNS：`www` 改 CNAME → `matsuyuansong-arch.github.io`
3. GitHub repo Settings → Pages → Custom domain 填 `www.matsu-tour.com.tw`（會自動產生 CNAME commit，記得 `git pull`）
4. 憑證核發後勾 Enforce HTTPS，`curl -I https://www.matsu-tour.com.tw/` 回 200

## 線上編輯文字（2026-10-13）

網站維持靜態頁；改過的文字存在 GAS 後台，頁面載入時由 `js/cms.js` 換上去。後台沒設定或連不上時，訪客看到的就是 HTML 原文。

| 身分 | 能做什麼 |
|---|---|
| 編輯者 | 開始編輯 → 直接點頁面文字修改 → 儲存；「還原原文」換回 HTML 原本的字；改自己的密碼 |
| 管理員 | 以上全部，加上帳號管理（新增／移除／改身分／重設密碼）、操作紀錄（誰在何時把哪段從什麼改成什麼） |

- 入口：網址加 `?admin`，或點頁尾「管理登入」
- 可編輯範圍：`<main>` 裡標有 `data-edit` 的標題、段落、清單、表格；頁首、導覽、頁尾、電話與按鈕不開放
- 只保留粗體、小字、換行、連結等少數標籤；貼上一律轉純文字，顯示前會再過白名單
- 兩人同時改同一段：後存的人會被擋下並提示，不會蓋掉前一人的修改

| 檔案 | 用途 |
|---|---|
| `js/cms.js` | 前端；第 16 行 `API` 是後台網址，清空即停用 |
| `css/cms.css` | 工具列與對話框，只在管理者登入時載入 |
| `_gas/Code.gs` | 後台（帳號、文字、操作紀錄）。底線資料夾不會被 Pages 發布 |
| `_tools/tag_editable.py` | 新增頁面或段落後執行，替新元素編 `data-edit` 代號（舊代號不變） |
| `_tools/bake.py` | 把後台改過的文字寫回 HTML，讓搜尋引擎也看到新字（`--write` 才寫入） |

後台：GAS 專案「龍福旅行社官網 文字編輯後台」，以擁有者身分執行、任何人可存取。
更新後台程式：`cd _gas && clasp push -f && clasp update-deployment <部署ID>`（部署 ID 見 `clasp list-deployments`，沿用同一個才不用改網址）。
第一次使用或忘記全部密碼：Apps Script 編輯器執行 `bootstrapOwner()`，執行紀錄印出 owner 密碼。

**注意**：改 HTML 結構時不要手動刪改 `data-edit` 代號；後台的修改是對代號存的，代號錯位會把字換到別的段落。
