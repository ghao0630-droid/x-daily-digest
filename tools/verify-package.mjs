#!/usr/bin/env node
/**
 * Package self-check for the X 日报 (x-daily-digest) skill.
 *
 * Verifies structure, SKILL.md frontmatter, script syntax and HTML sanity.
 * Zero dependencies - node builtins only.
 *
 * Usage: node tools/verify-package.mjs
 * Exit 0 = pass, 1 = fail.
 */

import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, 'skills', 'x-daily-digest');

const errors = [];
const warnings = [];
const checks = [];

function ok(msg) {
  checks.push(['ok', msg]);
}
function fail(msg) {
  checks.push(['fail', msg]);
  errors.push(msg);
}
function warn(msg) {
  checks.push(['warn', msg]);
  warnings.push(msg);
}

function has(rel) {
  return existsSync(join(ROOT, rel));
}

/* ---------- 1. required layout ---------- */

const required = [
  'README.md',
  'NOTICE.md',
  'package.json',
  '.gitignore',
  'skills/x-daily-digest/SKILL.md',
  'skills/x-daily-digest/scripts/grab.sh',
  'skills/x-daily-digest/scripts/parse.py',
  'skills/x-daily-digest/scripts/brief.py',
  'skills/x-daily-digest/scripts/verify_links.py',
  'skills/x-daily-digest/references/digest-template.html',
  'skills/x-daily-digest/references/design-rules.md',
  'skills/x-daily-digest/examples/demo-2026-10-14.html',
];

for (const rel of required) {
  if (has(rel)) ok(`exists: ${rel}`);
  else fail(`missing: ${rel}`);
}

/* ---------- 2. SKILL.md frontmatter ---------- */

const skillPath = join(SKILL, 'SKILL.md');
if (existsSync(skillPath)) {
  const raw = readFileSync(skillPath, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    fail('SKILL.md: 缺少 YAML frontmatter');
  } else {
    const fm = m[1];
    const name = fm.match(/^name:\s*(.+)$/m);
    const desc = fm.match(/^description:\s*(.+)$/m);

    if (!name) fail('SKILL.md: frontmatter 缺 name');
    else if (name[1].trim() !== 'x-daily-digest') fail(`SKILL.md: name 应为 x-daily-digest，实际 ${name[1].trim()}`);
    else ok('SKILL.md: frontmatter name 正确');

    if (!desc) fail('SKILL.md: frontmatter 缺 description');
    else if (desc[1].trim().length < 20) warn('SKILL.md: description 过短，AI 可能判断不出触发场景');
    else ok('SKILL.md: frontmatter description 存在');

    // 目录名必须和 frontmatter name 一致，否则安装器会错位
    const dirName = SKILL.split(/[\\/]/).pop();
    if (dirName !== 'x-daily-digest') fail(`目录名 ${dirName} 与 SKILL.md name 不一致`);
  }
}

/* ---------- 3. python scripts compile ---------- */

/**
 * 跑一个外部命令做语法检查。
 *
 * 关键区分：**命令没能起来** 和 **命令跑起来后报错** 是两回事。
 * 受限沙箱会拦 spawn（报 EBUSY / EPERM / EACCES），此时 `e.status` 是 undefined。
 * 把它当语法错误报 FAIL 是假失败——真正的语法错误一定带非零 `e.status`。
 */
function runCheck(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return { state: 'ok' };
  } catch (e) {
    if (e.status === undefined || e.status === null) {
      return { state: 'blocked', code: e.code || 'SPAWN_FAILED' };
    }
    return { state: 'error', detail: (e.stderr?.toString() || e.message || '').trim() };
  }
}

const pyCandidates = [
  process.env.PYTHON,
  'python',
  'python3',
  // WorkBuddy 的托管 python：按当前用户推导，避免把某台机器的绝对路径写进仓库
  join(homedir(), '.workbuddy-ai', 'binaries', 'python', 'envs', 'default', 'bin', 'python'),
  join(homedir(), '.workbuddy-ai', 'binaries', 'python', 'envs', 'default', 'Scripts', 'python.exe'),
].filter(Boolean);

let py = null;
let pyBlocked = null;
for (const c of pyCandidates) {
  const r = runCheck(c, ['-c', 'import sys']);
  if (r.state === 'ok') {
    py = c;
    break;
  }
  if (r.state === 'blocked' && !pyBlocked) pyBlocked = r.code;
}

if (!py) {
  if (pyBlocked) warn(`python 存在但被沙箱拦下 spawn（${pyBlocked}），跳过脚本语法检查；请在沙箱外重跑本脚本`);
  else warn('找不到可用的 python，跳过脚本语法检查');
} else {
  const pyFiles = readdirSync(join(SKILL, 'scripts')).filter((f) => f.endsWith('.py'));
  for (const f of pyFiles) {
    const r = runCheck(py, ['-m', 'py_compile', join(SKILL, 'scripts', f)]);
    if (r.state === 'ok') ok(`python 语法通过: scripts/${f}`);
    else if (r.state === 'blocked') warn(`scripts/${f}: spawn 被拦（${r.code}），未能检查`);
    else fail(`python 语法错误: scripts/${f}\n${r.detail}`);
  }
  // py_compile 会留 __pycache__，清掉别污染工作区
  rmSync(join(SKILL, 'scripts', '__pycache__'), { recursive: true, force: true });
}

/* ---------- 4. bash script syntax ---------- */

const shPath = join(SKILL, 'scripts', 'grab.sh');
if (existsSync(shPath)) {
  const body = readFileSync(shPath, 'utf8');
  if (!body.includes('BSK_AUTO_START')) {
    warn('grab.sh: 未见 BSK_AUTO_START，bsk 在受限环境下可能起不来');
  } else {
    ok('grab.sh: 已处理 BSK_AUTO_START');
  }
  const r = runCheck('bash', ['-n', shPath]);
  if (r.state === 'ok') ok('bash 语法通过: scripts/grab.sh');
  else if (r.state === 'blocked') warn(`grab.sh: spawn 被拦（${r.code}），未能检查`);
  else fail(`bash 语法错误: scripts/grab.sh\n${r.detail}`);
}

/* ---------- 5. HTML sanity ---------- */

function checkHtml(rel, { expectPlaceholders }) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return;
  const html = readFileSync(p, 'utf8');

  const ph = (html.match(/\{\{/g) || []).length;
  if (expectPlaceholders) {
    if (ph === 0) warn(`${rel}: 模板里没有 {{...}} 占位符，确认是否还需要它当模板`);
    else ok(`${rel}: 模板占位符 ${ph} 处`);
  } else {
    if (ph > 0) fail(`${rel}: 残留 ${ph} 处 {{...}} 占位符，不能作为样例交付`);
    else ok(`${rel}: 无占位符残留`);
  }

  const cards = (html.match(/class="card"/g) || []).length;
  const statusLinks = [...html.matchAll(/\/status\/(\d+)/g)].map((x) => x[1]);
  const uniqueStatus = new Set(statusLinks);

  if (!expectPlaceholders) {
    if (cards === 0) fail(`${rel}: 没有 class="card"，结构不对`);
    else ok(`${rel}: ${cards} 张卡片`);
    if (uniqueStatus.size === 0) fail(`${rel}: 没有任何 /status/ 直链`);
    else ok(`${rel}: ${uniqueStatus.size} 条唯一 status 直链`);

    // 页脚诚实性：必须写明这是个性化推荐流
    if (!/推荐流|For You|个性化/.test(html)) {
      warn(`${rel}: 未见「个性化推荐流」说明，页脚诚实性可能不足`);
    } else {
      ok(`${rel}: 已声明数据源为个性化推荐流`);
    }
  }
}

checkHtml('skills/x-daily-digest/references/digest-template.html', { expectPlaceholders: true });
checkHtml('skills/x-daily-digest/examples/demo-2026-10-14.html', { expectPlaceholders: false });

/* ---------- 6. design-rules must state the palette ---------- */

const drPath = join(SKILL, 'references', 'design-rules.md');
if (existsSync(drPath)) {
  const dr = readFileSync(drPath, 'utf8');
  if (!/#002fa7/i.test(dr)) warn('design-rules.md: 未写明克莱因蓝主色 #002fa7');
  else ok('design-rules.md: 主色 #002fa7 已定义');
}

/* ---------- report ---------- */

const icon = { ok: 'PASS', fail: 'FAIL', warn: 'WARN' };
for (const [kind, msg] of checks) {
  console.log(`[${icon[kind]}] ${msg}`);
}

console.log('');
console.log(`通过 ${checks.filter((c) => c[0] === 'ok').length} 项，警告 ${warnings.length} 项，失败 ${errors.length} 项`);

if (errors.length) {
  console.log('');
  console.log('包校验失败。');
  process.exit(1);
}
console.log('包校验通过。');
