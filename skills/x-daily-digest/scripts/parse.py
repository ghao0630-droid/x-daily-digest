#!/usr/bin/env python3
"""解析 grab.sh 抓下来的原始输出，去重后输出干净清单。

用法:  python parse.py <raw.txt> [clean.txt]

输入: 每行一个 JSON 数组（grab.sh 的产物），可能混有 bsk 的提示行。
输出: 每行 `<status路径> ||| <帖子全文>`

设计要点:
  - 只用 startswith('[') 过滤，因为 bsk 的提示行（如版本更新提醒）会混进 stdout。
  - 末尾的 /analytics、/photo/1 要裁掉，只留 /user/status/<id>。
  - 保留首次出现顺序，方便回溯是哪一轮抓到的。
"""

import io
import json
import re
import sys

src = sys.argv[1] if len(sys.argv) > 1 else 'posts_raw.txt'
dst = sys.argv[2] if len(sys.argv) > 2 else 'posts_clean.txt'

seen = {}
order = []

with io.open(src, encoding='utf-8', errors='replace') as fh:
    for line in fh:
        line = line.strip()
        if not line.startswith('['):
            continue
        try:
            arr = json.loads(line)
        except ValueError:
            continue
        if not isinstance(arr, list):
            continue
        for it in arr:
            if not isinstance(it, dict):
                continue
            u = re.sub(r'/(analytics|photo/\d+)$', '', it.get('u') or '')
            t = (it.get('t') or '').strip()
            if u and t and u not in seen:
                seen[u] = t
                order.append(u)

with io.open(dst, 'w', encoding='utf-8') as out:
    for k in order:
        out.write(k + ' ||| ' + seen[k] + '\n')

print('unique posts: %d -> %s' % (len(order), dst))
