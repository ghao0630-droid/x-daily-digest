#!/usr/bin/env python3
"""交付前校验：日报 HTML 的每个 X 链接都必须来自抓取样本。

用法:  python verify_links.py <digest.html> <posts_clean.txt>

为什么必须有这一步:
  X 的 status id 是一串无规律的长数字，凭记忆或推测写出来的链接
  会指向完全无关的帖子 —— 而且页面看起来毫无异常，只有点进去才发现。
  这是这份日报最隐蔽也最致命的一类错误，必须机器核对。

检查项:
  1. 每个 /status/<id> 链接都能在抓取样本里找到
  2. 卡片数量
  3. 模板占位符 {{...}} 残留
  4. 组锚点 id 是否齐全
"""

import io
import re
import sys

if len(sys.argv) < 3:
    print('usage: python verify_links.py <digest.html> <posts_clean.txt>')
    sys.exit(2)

html_path, sample_path = sys.argv[1], sys.argv[2]

# 1. 抓取样本里的所有 (handle, status_id)
sample = set()
with io.open(sample_path, encoding='utf-8', errors='replace') as fh:
    for line in fh:
        m = re.match(r'/([^/]+)/status/(\d+)', line)
        if m:
            sample.add((m.group(1), m.group(2)))

html = io.open(html_path, encoding='utf-8').read()

# 2. HTML 里的 status 链接
links = re.findall(r'https://x\.com/([^/"\s]+)/status/(\d+)', html)
bad = [l for l in links if l not in sample]

# 3. 作者主页链接（允许存在，单独报告）
profiles = re.findall(r'https://x\.com/([A-Za-z0-9_]{1,15})(?=["\s])', html)
profiles = sorted(set(profiles) - {h for h, _ in links})

cards = len(re.findall(r'class="card"', html))
placeholders = len(re.findall(r'\{\{', html))
anchors = sorted(set(re.findall(r'id="(g\d+)"', html)))

print('cards        : %d' % cards)
print('status links : %d (unique %d)' % (len(links), len(set(links))))
print('sample size  : %d' % len(sample))
print('anchors      : %s' % (', '.join(anchors) if anchors else 'none'))
print('profile links: %s' % (', '.join('@' + p for p in profiles) if profiles else 'none'))
print('placeholders : %d' % placeholders)

if bad:
    print('\nFAIL - links not found in sample (%d):' % len(bad))
    for h, i in bad:
        print('  https://x.com/%s/status/%s' % (h, i))
    sys.exit(1)

print('\nOK - every status link traces back to a captured post.')
