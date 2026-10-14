#!/usr/bin/env bash
# 边滚边抓 X 时间线 / 搜索页。
#
# 用法:  bash grab.sh <session_id> <输出文件> [滚动屏数]
#
# X 是虚拟列表：滚过去的帖子会从 DOM 里消失，永久链接也一起没。
# 所以必须「每滚一屏就抓一次」，累积到文件 —— 不能先滚完再抓。
#
# 输出：每行一个 JSON 数组，形如 [{"u":"/user/status/123","t":"帖子全文"}]

set -u

SESSION="${1:-}"
OUT="${2:-posts_raw.txt}"
ROUNDS="${3:-12}"

if [ -z "$SESSION" ]; then
  echo "usage: bash grab.sh <session_id> <outfile> [rounds]" >&2
  exit 2
fi

export BSK_AUTO_START=0

# 一次抓取当前可见屏里所有 article 的永久链接 + 文本
readonly EXPR='JSON.stringify(Array.from(document.querySelectorAll("article")).map(function(a){var l=a.querySelector("a[href*=\"/status/\"]");return {u:l?l.getAttribute("href"):"",t:(a.innerText||"").replace(/\s+/g," ").slice(0,400)}}))'

rm -f "$OUT"

for i in $(seq 1 "$ROUNDS"); do
  # 落盘而不是管道 —— 中文经管道 grep 会变成 GBK 乱码
  bsk evaluate --session "$SESSION" "$EXPR" >> "$OUT" 2>&1
  echo "" >> "$OUT"
  bsk wheel --delta-y 1600 --session "$SESSION" >/dev/null 2>&1
  sleep 1.3
done

GRABBED=$(grep -c '^\[' "$OUT" 2>/dev/null || echo 0)
echo "grabbed $OUT : ${GRABBED}/${ROUNDS} rounds returned data"
