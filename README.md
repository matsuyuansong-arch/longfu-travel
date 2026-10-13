# longfu-travel｜龍福旅行社官網

純靜態多頁 HTML，一個資料夾配一個 `index.html`，無框架、無建置工具。
架構與內容規格見 Dropbox：`Claude-Cowork/mac-projects/work/龍福旅行社/龍福旅行社網站架構初稿_v1.md`。
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
