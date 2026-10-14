#!/usr/bin/env python3
"""把 parse.py 的产物压成一行一条的紧凑清单，便于快速扫读和人工筛选。

用法:  python brief.py <clean.txt> [brief.txt] [每行截断字符数]

输入: 每行 `<status路径> ||| <帖子全文>`
输出: 每行 `[序号] @handle (status_id) 正文前 N 字`

为什么要这一步: 去重后动辄一两百条，全文读会淹掉上下文。
压成一行 200 字之后，一次就能扫完，再决定哪些值得展开细看。
"""

import io
import re
import sys

src = sys.argv[1] if len(sys.argv) > 1 else 'posts_clean.txt'
dst = sys.argv[2] if len(sys.argv) > 2 else 'posts_brief.txt'
width = int(sys.argv[3]) if len(sys.argv) > 3 else 200

rows = 0
with io.open(src, encoding='utf-8', errors='replace') as fh, \
        io.open(dst, 'w', encoding='utf-8') as out:
    for line in fh:
        line = line.rstrip('\n')
        if ' ||| ' not in line:
            continue
        path, text = line.split(' ||| ', 1)
        m = re.match(r'/([^/]+)/status/(\d+)', path)
        handle = m.group(1) if m else '?'
        sid = m.group(2) if m else '?'
        rows += 1
        out.write('[%d] @%s (%s) %s\n' % (rows, handle, sid, text[:width]))

print('rows: %d -> %s' % (rows, dst))
