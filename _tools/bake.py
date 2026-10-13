#!/usr/bin/env python3
"""把後台改過的文字寫回 HTML 原始檔（讓搜尋引擎與不跑 JavaScript 的環境也看到新文字）。

  python3 _tools/bake.py            # 只列出會改哪些段落
  python3 _tools/bake.py --write    # 實際寫入，之後 git diff 檢查再 commit

後台的修改仍然保留，網頁照常顯示；寫回後原文與後台一致，兩邊不衝突。
"""
import json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def api_url():
    s = open(os.path.join(ROOT, 'js', 'cms.js'), encoding='utf-8').read()
    m = re.search(r"var API = '([^']*)'", s)
    if not m or not m.group(1):
        sys.exit('js/cms.js 的 API 還沒設定')
    return m.group(1)


def main():
    write = '--write' in sys.argv
    with urllib.request.urlopen(api_url() + '?a=all', timeout=60) as r:
        res = json.loads(r.read().decode('utf-8'))
    if not res.get('ok'):
        sys.exit('後台回應錯誤：%s' % res.get('error'))
    total = 0
    for page, edits in sorted(res['data'].items()):
        if not edits:
            continue
        rel = 'index.html' if page == 'home' else page + '/index.html'
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print('找不到 %s，略過 %d 段' % (rel, len(edits))); continue
        s = open(path, encoding='utf-8').read()
        for key, html in sorted(edits.items()):
            pat = re.compile(r'(<(\w+)\b[^>]*\bdata-edit="%s"[^>]*>)(.*?)(</\2>)' % re.escape(key), re.S)
            m = pat.search(s)
            if not m:
                print('%s %s：HTML 裡找不到這個段落' % (rel, key)); continue
            if m.group(3) == html:
                continue
            print('%s %s\n  原：%s\n  新：%s' % (rel, key, re.sub(r'\s+', ' ', m.group(3))[:80], html[:80]))
            s = s[:m.start(3)] + html + s[m.end(3):]
            total += 1
        if write:
            open(path, 'w', encoding='utf-8').write(s)
    print('共 %d 段%s' % (total, '已寫入' if write else '（加 --write 才會寫入）'))


if __name__ == '__main__':
    main()
