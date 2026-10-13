# longfu-travel｜龍福旅行社官網

純靜態多頁 HTML，一個資料夾配一個 `index.html`，無框架、無建置工具。
架構與內容規格見 Dropbox：`Claude-Cowork/mac-projects/work/龍福旅行社/龍福旅行社網站架構初稿_v1.md`。

## 目前頁面

| 路徑 | 狀態 |
|---|---|
| `index.html` | 草稿 v1（2026-09-06）|
| `about/index.html` | 草稿 v1（2026-09-06）|
| `css/style.css` | 共用樣式，色彩 token 取自龍福山莊標準色規範 v1.1 |
| `img/` | 三張龍福自有照片（芹壁巷弄、北竿空拍、芹壁灣）原檔 jpg ＋ 1600px WebP |

導覽列連到的 `tours/`、`experiences/`、`packages/`、`custom/`、`b2b/`、`guide/`、`faq/`、`legal/`、`contact/` 尚未建立。

## 上線前必做

1. 全站 `https://example.com` 換正式網域
2. 核對交觀甲字號與品保號原件，移除 `.pending` 標記
3. 移除每頁最上方的 `.draft` 草稿橫幅
4. 東莒卡片補照片（只能用龍福自有照片）
5. `git ls-files` 確認沒有證件、帳戶、個資

## 本機預覽

```bash
python3 -m http.server 8765 -d ~/longfu-travel
```
