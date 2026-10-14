---
name: x-daily-digest
description: 从已登录的 X（推特）抓取当天高互动帖子，筛掉噪音，产出「X 日报」HTML。当用户说「抓 X」「X 日报」「看看推特今天有什么」「X 上有什么值得学的」时使用。
---

# X 日报 Skill

从**你已登录的 X** 里，把当天真实的高互动帖子连正文带直链捞出来，筛掉噪音，产出一份可读的 HTML 日报。

**核心判据：可复用信息密度 > 互动量。** 互动高的帖子常常是垃圾。这个 skill 的价值不在"抓得多"，而在"扔得准"。

---

## 0. 为什么不能用搜索引擎

搜索引擎拿不到 X 站内内容——它只返回媒体的复述稿，没有帖子、没有作者、没有直链。必须走浏览器。

---

## 1. 前置检查：bsk 是否可用

本 skill 依赖 **BrowserSkill（`bsk`）**——一个通过浏览器扩展控制你**已登录** Chromium 的 CLI。

```sh
which bsk
```

**每次调用 bsk 都要带 `BSK_AUTO_START=0`**（自动启动在受限环境下会失败）。

```sh
export BSK_AUTO_START=0
bsk status --json
```

判据：

- `browsers` 非空 → 直接进下一步。
- 报 `automatic daemon startup is disabled` → 需要起 daemon（见下）。
- **空输出或 SIGTERM 不算失败证据**，必须看 status 的 JSON。

### 起 daemon

daemon 必须在**能活过当前命令**的环境里启动，否则下一条命令就找不到它：

```sh
bsk daemon start --foreground    # 用 run_in_background=true 跑
```

起完**另起一次调用**确认：

```sh
bsk status --json
```

**已知现象：** daemon 的自动更新逻辑在 Windows 上可能自杀一次（日志里出现
`update helper ready; exiting so it can replace and restart the daemon`），
表现为刚起就退出。**直接再起一次即可稳定**，这不是环境故障。

### 浏览器扩展断连怎么办

`bsk status` 返回 `browsers: []`、`session start` 报 `no_browser_connected`
时，说明浏览器扩展没连上。两条路：

1. **让用户重新打开浏览器里的 BrowserSkill 扩展**（恢复抓取能力，必须走这条）。
2. **只是要验证本地 HTML 渲染效果** → 不必等浏览器，直接用 headless Chrome
   截图（见第 7 节），更快。

---

## 2. 选入口

两种入口都适用第 3 节的「边滚边抓」流程，只是 URL 不同：

| 入口 | URL | 什么时候用 |
|---|---|---|
| 首页推荐流 | `https://x.com/home` | 要「今天有什么热点」 |
| 关键词搜索 | `https://x.com/search?q=<urlencoded>&f=top` | 要「某个话题下的帖子」 |

- `f=top` 热门排序；`f=live` 最新排序。
- 搜索页对中英文都正常，中文帖子能完整抓到。
- **搜索页的「热门」同样是推荐算法排序，不是全站热榜**——页脚必须写清这个口径。

---

## 3. 边滚边抓（关键）

**X 是虚拟列表：滚过去的帖子会从 DOM 里消失，永久链接也一起没。**
所以不能「先滚完再抓」，必须**每滚一屏就抓一次**，累积到文件。

```sh
export BSK_AUTO_START=0
SID=$(bsk session start --json --no-focus | grep session_id | sed 's/.*"session_id": *"//;s/".*//')
bsk navigate "https://x.com/home" --session "$SID"
sleep 6
bash scripts/grab.sh "$SID" posts_raw.txt 12    # 12 屏
```

`scripts/grab.sh` 就是上面这个循环的封装（见 `scripts/` 目录）。

要点：

- 一次 `get-html` + grep 只能拿到**当前可见屏**的链接，覆盖不了整条时间线，别指望它。
- **首页首屏只渲染约 5 条 `article`**，不滚动就以为只有这么点内容。
- **For You 每次刷新给的内容不同**。想要更多样本，重新 navigate 首页再来一轮，最后合并去重。

### 抓长推文（万字长文）

**不需要点「显示更多」。** 直接 `navigate` 到 `/status/<id>`，然后读 `article.innerText`，
拿到的就是全文（实测一篇万字长文约 27,000 字符，结尾自然收束）。

> ⚠️ 别用模糊文本匹配去点 X 的按钮。像
> `document.querySelectorAll("[role=button],span")` 过滤 `/显示更多/` 再 `.click()`，
> 会点到侧边栏元素，把页面导航到 `/explore/tabs/for-you`，白跑一趟。

---

## 4. 解析去重

```sh
python scripts/parse.py posts_raw.txt posts_clean.txt
```

输出格式：`/user/status/<id> ||| 帖子全文`

帖子直链 = `https://x.com` + 第一段。

**注意：**

- `bsk evaluate` 的 stdout 就是纯 JSON 数组，不带包装，可直接 `json.loads`。
  但它**可能混入提示行**（如 `A new bsk version is available...`），
  所以解析时用 `line.startswith('[')` 过滤，只吃 JSON 数组行。
- 末尾带 `/analytics` 或 `/photo/1` 的链接要裁掉，只留 `/user/status/<id>`。
- 想要紧凑清单（一行一条，便于快速扫读）：
  ```sh
  python scripts/brief.py all_clean.txt all_brief.txt 200
  ```

### 中文乱码

**管道 grep 中文必乱码。** `bsk ... | grep ...` 输出到终端会变成 GBK 乱码。

→ 一律 `bsk ... > file 2>&1` 落盘，再用文件读取工具读；或 `grep -a` 落盘后读。

---

## 5. 筛选：这一步决定日报值不值钱

**核心判据：可复用信息密度 > 互动量。** 互动高的帖子常常是垃圾。

推荐流噪音占比实测约 **60–80%**。按下面清单**主动剔除**，不要因为「互动高」就留下：

### 必删（互动再高也删）

- 加密货币圈八卦：大佬互撕、面相玄学、晒身材、行情喊单
- 内娱 / 网红 / 擦边内容
- 政治擦边、领导人相关
- 纯情绪宣泄（「卧槽！！！」连发、无信息量的感叹）
- 明确标注「广告」「付费合作」的推广帖

### 降权（除非信息密度够高）

- 单张贴图晒效果、无对比无数据 → 除非作者给了可复现的测试条件
- 转发链（A 引用 B）→ 优先看原始帖，别把转述当一手信源

### 优先保留（按价值排序）

1. **有量化数据的**——成本、耗时、基准分数、通过率。
   「$5.5 / 630s」比「效果炸裂」值钱一百倍。
2. **给可复现条件的**——测试用例设计、免费体验地址、完整 prompt。别人能自己验证。
3. **系统性对比**——多 prompt / 多轮编辑 / 横向对打，优于单张晒图。
4. **踩坑与失败记录**——负面实测往往比正面吹捧信息量大。
5. **可直接抄的工作流**——开源项目 + 真实结果数据。
6. **方法论**——如何判断审美、如何设计测试用例，这类跨领域通用。

> 写 HTML 时，**在页面里单独放一段「已被扔掉的噪音」**，说明删了什么、为什么。
> 这比默默过滤更有说服力，也让读者知道样本全貌。

---

## 6. 分组

默认按三组归类，某组内容过少（< 2 条）就并进相邻组，别硬撑空组：

| 组名 | 收什么 | 副标题 tag |
|---|---|---|
| **AI 模型 / 工具** | 模型发布、实测对比、产品更新、计费变更 | 今日主战场 |
| **Skill 生态** | Skill 项目、工作流、Agent 配置、技能治理 | 持续发酵 |
| **产品 / 工程实践** | 设计方法、大厂实践、可复用工程经验 | 可复用经验 |

- 若当日有**单一主导事件**（如某模型发布引发大量讨论），在该组开头加一句 `secnote`
  点明事件，并在页首 `lede` 里给总结论。
- 组内排序：**按「可复用价值」降序，不按时间、不按互动量**。
- 当日信息量大时可以扩到 4–5 组（如把某个大事件单独成组），但每组至少 3 条。

---

## 7. 输出：HTML 日报

模板：`references/digest-template.html`（**直接改内容，别每次重写样式**）。
设计约束与配色规范：`references/design-rules.md`。
真实产出样例：`examples/demo-2026-10-14.html`。

结构固定：

```
header      品牌头 + 刊头（日期/采集时间）+ 数据源说明
stats       数据概览（样本数 / 入选数 / 噪音占比 / 采集轮次）
top3        「今日最值钱的三条」——时间有限只看这里
toc         分组导航（sticky，点击跳转）
lede        一句话结论（当日主导事件）
h2 分组     每组带编号 + tag 角标 + secnote 说明
  card      标题(带原文直链) / why(核心看点) / meta(作者+互动+价值标签)
skip        已被扔掉的噪音说明
footer      采集口径与局限
```

**每张 card 的三要素：**

- `h3 > a`：概括性标题（**不是原帖标题**，是你读完后的提炼），链接到 X 原文
- `.why`：**为什么值得学**，不要复述内容。用 `<b>` 高亮关键数字或结论
- `.meta`：`@handle` + 互动数据 + 价值标签（p-hot 高价值 / p-warm 需注意 / p-cool 可复现）

### 页脚必须写清局限（诚实性底线）

1. 首页是 **For You 个性化推荐流，不是全站热榜**——不同账号同一时间结果完全不同
2. 搜索页 `f=top` 的「热门」也是算法排序，非实时热榜
3. 会混入几个月前的老帖，因为排序不等于时间序
4. 互动数据是抓取时刻快照
5. 纯文本抓取，图片/视频内容未纳入分析
6. 标题为概括，非原帖标题

**不要**把个性化推荐包装成「全网热点」。这是这份日报最容易犯的错。

### 本地预览与视觉自查

`bsk` **不允许 navigate 到 `file://`**（报 `Navigating to local URL is not allowed`）。
要看渲染效果，起个本地 HTTP 服务：

```sh
python -m http.server 8899 --bind 127.0.0.1
```

然后 **headless Chrome 截图**（不必占用你的登录浏览器，也不必等扩展连上）：

```sh
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --user-data-dir="<临时目录>" \
  --window-size=1240,1750 --virtual-time-budget=4000 \
  --screenshot="<绝对路径>.png" \
  "http://127.0.0.1:8899/preview.html"
```

- **必须单独指定 `--user-data-dir`**，否则和用户正在运行的 Chrome 冲突。
- 文件名含空格/中文时，先 `cp` 成纯 ASCII 名再预览，省得 URL 编码踩坑。

---

## 8. 交付前自查（必做）

```sh
# 1. 占位符残留
grep -n '{{' <产出文件>.html          # 正文区应为 0（模板注释内可保留）

# 2. 卡片数与选定条目数一致
grep -c 'class="card"' <产出文件>.html

# 3. 链接来源核对：每个 status id 都必须来自抓取样本，不能凭记忆写
python scripts/verify_links.py <产出文件>.html posts_clean.txt
```

第 3 条是硬要求：**X 的 status id 不能猜、不能编**。
某条帖子拿不到直链时，**直接给作者主页链接 `https://x.com/<handle>`**。

---

## 9. 收尾

```sh
bsk session stop "$SID"    # 必须，同时归还借用的标签页
```

---

## 附：常见坑速查

| 症状 | 真因 | 处理 |
|---|---|---|
| 只抓到几条 | 没滚动 / 首页只渲染约 5 条 article | 边滚边抓 |
| 中文乱码 | 管道 grep 输出被转成 GBK | 落盘再读 |
| 链接抓不到 | X 虚拟列表，滚过去就销毁 DOM | 每滚一屏抓一次 |
| 点了「显示更多」跳走了 | 模糊文本匹配点到了侧边栏 | 长推文不用点，直接读全文 |
| `browsers: []` | 浏览器扩展断连 | 让用户重开扩展；或改用 headless Chrome 截图 |
| daemon 刚起就退出 | 自动更新逻辑自杀 | 直接再起一次 |
| 页面文字只有几十字符 | 正文在跨域 iframe 里 | 只能 `wheel` + `screenshot` 逐屏读图 |
| `file://` 打不开 | bsk 禁止本地 URL | 起 `http.server` 再访问 |
