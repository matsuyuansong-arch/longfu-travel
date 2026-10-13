#!/usr/bin/env python3
"""替網頁標記「可線上編輯的段落」，並掛上 js/cms.js。可重複執行，不會改動已經標過的代號。

  python3 _tools/tag_editable.py

做三件事（只處理 <main> 裡面，頁首、導覽、頁尾不開放編輯）：
  1. <body> 加 data-page="頁面代號"（首頁 home，其餘為資料夾路徑，例 tours/dongju-3d）
  2. 標題、段落、清單項目、表格格、標籤等元素加 data-edit="e數字"
     已有代號的保留原號；新元素從該頁最大號往後編，所以後台存的修改不會對錯段落
  3. </body> 前加 <script src="…js/cms.js" defer>

不標記：<a> 裡的文字（電話卡、按鈕）、只包一個按鈕的 <p>、空元素。
新增頁面或段落後重跑一次即可。底線開頭的資料夾不會被 GitHub Pages 發布。
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'404.html', 'privacy/index.html', 'inquiry/index.html'}
TAGS = 'h1|h2|h3|h4|p|li|dt|dd|td|th'
CMS_VER = '1'

OPEN = re.compile(r'<(%s)(\s[^>]*)?>|<span class="(?:eyebrow|tag|price)"[^>]*>|<a\b[^>]*>|</a>' % TAGS)


def page_id(rel):
    d = os.path.dirname(rel)
    return d if d else 'home'


def process(rel):
    path = os.path.join(ROOT, rel)
    s = open(path, encoding='utf-8').read()
    m1, m2 = s.find('<main>'), s.find('</main>')
    if m1 < 0 or m2 < 0:
        return None
    head, main, tail = s[:m1], s[m1:m2], s[m2:]

    used = [int(x) for x in re.findall(r'data-edit="e(\d+)"', main)]
    nxt = max(used) + 1 if used else 1
    out, pos, depth_a, added = [], 0, 0, 0

    for m in OPEN.finditer(main):
        tag = m.group(0)
        out.append(main[pos:m.start()])
        pos = m.end()
        if tag.startswith('<a'):
            depth_a += 1
            out.append(tag); continue
        if tag == '</a>':
            depth_a = max(0, depth_a - 1)
            out.append(tag); continue
        if 'data-edit=' in tag or depth_a:
            out.append(tag); continue
        rest = main[pos:pos + 200].lstrip()
        name = m.group(1) or 'span'
        # 空元素、只包一個按鈕的段落不標
        if rest.startswith('</%s>' % name) or (name == 'p' and re.match(r'<a class="btn', rest)):
            out.append(tag); continue
        out.append(tag[:-1] + ' data-edit="e%d">' % nxt)
        nxt += 1; added += 1
    out.append(main[pos:])
    main = ''.join(out)

    pid = page_id(rel)
    head = re.sub(r'<body(?: data-page="[^"]*")?>', '<body data-page="%s">' % pid, head, count=1)

    depth = rel.count('/')
    src = '../' * depth + 'js/cms.js?v=' + CMS_VER
    tail = re.sub(r'\n?<script src="[^"]*js/cms\.js[^"]*" defer></script>', '', tail)
    tail = tail.replace('</body>', '<script src="%s" defer></script>\n</body>' % src, 1)

    open(path, 'w', encoding='utf-8').write(head + main + tail)
    return pid, added, nxt - 1


def main():
    pages = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if not d.startswith(('.', '_'))]
        for f in fn:
            if f.endswith('.html'):
                rel = os.path.relpath(os.path.join(dp, f), ROOT)
                if rel not in SKIP:
                    pages.append(rel)
    for rel in sorted(pages):
        r = process(rel)
        if r:
            print('%-32s 頁面代號 %-24s 新標 %3d 段，共 %3d 段' % (rel, r[0], r[1], r[2]))
        else:
            print('%-32s 沒有 <main>，略過' % rel)


if __name__ == '__main__':
    sys.exit(main())
