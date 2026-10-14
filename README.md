# X 日报 Skill

从**你已登录的 X** 里抓当天真实的高互动帖子，筛掉噪音，产出一份可读的 HTML 日报。

**核心判据：可复用信息密度 > 互动量。** 互动高的帖子常常是垃圾。
这个 skill 的价值不在「抓得多」，而在「扔得准」。

---

## 为什么需要它

搜索引擎拿不到 X 站内内容——它只返回媒体的复述稿，**没有帖子、没有作者、没有直链**。
想拿到一手信息，只能走浏览器。

而 X 的时间线噪音占比实测约 **60–80%**：加密货币喊单、内娱擦边、政治段子、
明确标注「广告」的推广帖。它们互动量往往最高（单条 40 万+ 观看很常见），
但看完学不到任何可复用的东西。

所以这个 skill 做三件事：

1. **边滚边抓**，把整条时间线连正文带永久链接捞干净
2. **按「可复用价值」排序筛选**，而不是按互动量
3. **产出可直接阅读的 HTML 日报**，并在页面上明说扔掉了什么

---

## 它长什么样

一份日报包含：

```
品牌头 + 刊头（日期 / 采集时间 / 数据源）
数据概览（去重样本数 / 入选数 / 噪音占比 / 采集轮次）
今日最值钱的三条          ← 时间有限只看这里
分组导航（吸顶，点击跳转）
一句话结论
按组分卡片：标题(直链) / 为什么值得学 / 作者 + 互动 + 价值标签
已被扔掉的噪音说明
采集口径与局限
```

样例见 [`skills/x-daily-digest/examples/demo-2026-10-14.html`](skills/x-daily-digest/examples/demo-2026-10-14.html)
（2026-10-14 实跑：181 条去重样本 → 筛出 35 条）。

在线预览：<https://ghao0630-droid.github.io/x-daily-digest/skills/x-daily-digest/examples/demo-2026-10-14.html>

---

## 安装

```sh
# 非交互环境必须显式给 --agent 和 -y；Windows 必须 --copy（符号链接要开发者模式）
npx --yes skills@latest add ghao0630-droid/x-daily-digest \
  --skill x-daily-digest --agent codebuddy -y --copy
```

> **WorkBuddy 用户注意：** `skills` CLI 的 agent 列表里**没有 workbuddy**，
> 上面的命令只会装到 `.codebuddy/skills`。WorkBuddy 只读 `.workbuddy-ai/skills/`，
> 所以装完还要镜像一份，否则命令 exit 0 但技能永远不生效：
>
> ```sh
> mkdir -p ~/.workbuddy-ai/skills
> cp -r .codebuddy/skills/x-daily-digest ~/.workbuddy-ai/skills/
> ```

不想用 CLI 的话，直接拷目录也行：

```sh
git clone https://github.com/ghao0630-droid/x-daily-digest
cp -r x-daily-digest/skills/x-daily-digest ~/.workbuddy-ai/skills/
```

落点二选一：

- 用户级（所有项目可用）：`~/.workbuddy-ai/skills/`
- 项目级（仅当前项目）：`<项目>/.workbuddy-ai/skills/`

---

## 前置依赖

| 依赖 | 用途 |
|---|---|
| [BrowserSkill](https://github.com/Tencent/BrowserSkill)（`bsk`） | 通过浏览器扩展控制你**已登录**的 Chromium |
| Python 3 | 跑解析 / 校验脚本 |
| Chrome（可选） | headless 截图，用于验证渲染效果 |

`bsk` 是硬依赖：X 站内内容没有可用的公开 API，也没有搜索引擎索引，只能走浏览器。

---

## 用法

装好后对 AI 说：

> 抓 X，出今天的日报

或更具体的：

> 帮我抓一下 X 上关于 "Agent Skill" 的帖子，整理成日报

手动跑（想自己控制每一步时）：

```sh
export BSK_AUTO_START=0
cd skills/x-daily-digest

# 1. 起会话
SID=$(bsk session start --json --no-focus | grep session_id | sed 's/.*"session_id": *"//;s/".*//')

# 2. 打开入口（首页推荐流 或 关键词搜索页）
bsk navigate "https://x.com/home" --session "$SID"
sleep 6

# 3. 边滚边抓（X 是虚拟列表，滚过去的帖子会从 DOM 消失，必须边滚边抓）
bash scripts/grab.sh "$SID" posts_raw.txt 12

# 4. 解析去重
python scripts/parse.py posts_raw.txt posts_clean.txt

# 5. 压成一行一条，便于快速扫读和人工筛选
python scripts/brief.py posts_clean.txt posts_brief.txt 200

# 6. 按 references/digest-template.html 生成日报后，交付前校验
python scripts/verify_links.py 日报.html posts_clean.txt

# 7. 归还标签页
bsk session stop "$SID"
```

---

## 目录结构

```
.
├── README.md
├── NOTICE.md
├── package.json
├── index.html                          GitHub Pages 落地页
├── .nojekyll                           关掉 Jekyll，Pages 直接按文件服务
├── skills/
│   └── x-daily-digest/
│       ├── SKILL.md                    完整工作流（给 AI 读）
│       ├── scripts/
│       │   ├── grab.sh                 边滚边抓
│       │   ├── parse.py                解析去重
│       │   ├── brief.py                压成紧凑清单
│       │   └── verify_links.py         交付前校验链接来源
│       ├── references/
│       │   ├── digest-template.html    HTML 模板（含完整 CSS）
│       │   └── design-rules.md         设计约束清单
│       └── examples/
│           └── demo-2026-10-14.html    真实产出样例
└── tools/
    └── verify-package.mjs              包完整性自检
```

---

## 几个关键设计决定

### 1. 为什么必须「边滚边抓」

X 是虚拟列表：**滚过去的帖子会从 DOM 里消失，永久链接也一起没**。
所以不能「先滚完再抓」，必须每滚一屏就抓一次，累积到文件。

### 2. 为什么链接要机器校验

X 的 status id 是一串无规律的长数字，凭记忆或推测写出来的链接
**会指向完全无关的帖子，而且页面看起来毫无异常**——只有点进去才发现。

`scripts/verify_links.py` 会核对 HTML 里每个 `/status/<id>` 是否真的来自抓取样本。
拿不到直链时，宁可给作者主页链接，也不猜 id。

### 3. 为什么要在页面里列出「扔掉了什么」

默默过滤和明说过滤，说服力完全不同。
列出噪音清单，读者才知道样本全貌，也才知道这份日报的筛选标准是什么。

### 4. 为什么页脚必须写清局限

首页时间线是 **For You 个性化推荐流，不是全站热榜**——
不同账号同一时间刷新，结果完全不同。
把个性化推荐包装成「全网热点」是这份日报最容易犯的错，必须在页脚说清楚。

---

## 设计约束

日报的视觉遵循一套明确的约束，不靠「感觉好看」：

- 不用纯白纯黑、不用紫色渐变、不用发光和大面积 blur、不用过度圆角
- **一个页面只允许一个主色相**（克莱因蓝 `#002fa7`），黄 `#ffd400` 只做底和高亮
- 圆角一律 0，阴影一律去掉，用 1px 细线分隔
- 衬线体只给数字和英文（编辑感最省力的来源）

完整清单见 [`skills/x-daily-digest/references/design-rules.md`](skills/x-daily-digest/references/design-rules.md)。

---

## 自检

```sh
npm run verify     # 等价于 node tools/verify-package.mjs
```

检查 SKILL.md frontmatter、必需文件是否齐全、脚本能否编译、模板是否残留未替换的占位符。

> 在受限沙箱里跑时，python/bash 两项会报 `spawn 被拦（EBUSY）` 并降级为警告——
> 那是沙箱不让起子进程，不是脚本有错。想在普通 shell 里拿到完整结果，直接重跑即可。

---

## License

MIT
