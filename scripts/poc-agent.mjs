#!/usr/bin/env node
// VibeReel POC —— 证明"创意步 = 本机 claude CLI"这条路真能通。
// 跑法：node scripts/poc-agent.mjs ["产品一句话"]
//
// 它把一个 writeStoryboard step 交给本机 claude（零 API key，复用本地登录态），
// 经 --append-system-prompt 注入四件套·知识包，要求只输出 JSON，
// 再解析 + 校验出"多后端分镜"。这正是 v1 里 lib/agent.ts 的 POC 形态。

import { spawn } from 'node:child_process';

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const MODEL = process.env.MODEL || 'sonnet';                 // 映射模型档；别名或全名皆可
const RENDERERS = ['remotion', 'generative', 'lottie', 'still-kenburns'];

const product = process.argv.slice(2).join(' ') ||
  'Acme Analytics —— 给小团队的实时数据看板，主打"数据自己说话"，对标 linear.app 的克制质感';

// 四件套·知识包（showreel 导演）→ 经 --append-system-prompt 注入（等价 SDK 系统提示）
const SYSTEM = [
  '你是产品 showreel 导演。',
  '情绪曲线固定：hook（痛点）→ 演示（功能/数据）→ payoff（slogan/CTA）。',
  '给每个分镜选最合适的渲染后端，只能从这四个里选：',
  '- remotion：信息镜（文字/图表/数据/UI）',
  '- generative：氛围镜 / 写实 b-roll',
  '- lottie：动态图标 / 矢量插画',
  '- still-kenburns：上传素材图缓慢推拉',
  '严格只输出 JSON，不要任何解释、不要 markdown 代码围栏。',
].join('\n');

const PROMPT = [
  `为这个产品写一支 16:9、约 18 秒的 showreel 分镜：`,
  product,
  '',
  '输出 JSON，schema：',
  '{ "scenes": [ { "index": number, "role": string, "durationSec": number, "onScreenText": string, "renderer": "remotion|generative|lottie|still-kenburns" } ] }',
  '要求：4–6 镜；至少用到 3 种不同 renderer；总时长接近 18 秒；只输出该 JSON。',
].join('\n');

function runClaude() {
  const args = ['-p', PROMPT, '--model', MODEL, '--output-format', 'json',
                '--append-system-prompt', SYSTEM, '--tools', ''];
  console.log(`▶ spawn: ${CLAUDE_BIN} -p <prompt> --model ${MODEL} --output-format json --append-system-prompt <四件套> --tools ""\n`);
  return new Promise((resolve, reject) => {
    const p = spawn(CLAUDE_BIN, args, { cwd: process.cwd() });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('claude 调用超时(150s)')); }, 150000);
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.on('close', code => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

function extractJson(text) {
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');     // 去掉可能的代码围栏
  const a = s.indexOf('{'), b = s.lastIndexOf('}');                  // 截首个 { 到末个 }
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

async function main() {
  const { code, out, err } = await runClaude();
  if (code !== 0) {
    console.error('❌ claude 非零退出:', code, '\nstderr 末尾:\n', err.slice(-800));
    process.exit(1);
  }

  let env;
  try { env = JSON.parse(out); }
  catch (e) { console.error('❌ 解析 claude 外层 JSON 失败:', e.message, '\nstdout 末尾:\n', out.slice(-800)); process.exit(1); }

  const resultText = env.result ?? '';
  console.log('── claude 元信息 ──');
  console.log('  model    :', MODEL);
  console.log('  is_error :', env.is_error);
  console.log('  duration :', env.duration_ms, 'ms');
  console.log('  cost_usd :', env.total_cost_usd);
  console.log('  turns    :', env.num_turns);
  console.log('\n── 助手输出 (.result) ──\n' + resultText.slice(0, 500) + (resultText.length > 500 ? '…' : ''));

  let parsed;
  try { parsed = extractJson(resultText); }
  catch (e) { console.error('\n❌ 解析助手 JSON 失败:', e.message); process.exit(1); }

  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  console.log('\n── 解析出的分镜 ──');
  let fieldsOk = true, total = 0;
  for (const sc of scenes) {
    const rOk = RENDERERS.includes(sc.renderer);
    const fOk = Number.isFinite(Number(sc.durationSec)) && sc.role && sc.onScreenText;
    if (!rOk || !fOk) fieldsOk = false;
    total += Number(sc.durationSec) || 0;
    console.log(`  #${sc.index}  ${String(sc.durationSec).padStart(2)}s  [${String(sc.renderer || '?').padEnd(14)}] ${sc.role}  —  ${sc.onScreenText}${rOk ? '' : '  ⚠后端非法'}`);
  }

  const uniq = new Set(scenes.map(s => s.renderer)).size;
  const allRendererOk = scenes.length > 0 && scenes.every(s => RENDERERS.includes(s.renderer));
  console.log('\n── 校验 ──');
  console.log('  分镜数      :', scenes.length, scenes.length >= 4 && scenes.length <= 6 ? '✅' : '⚠');
  console.log('  后端种类    :', uniq, uniq >= 3 ? '✅(≥3)' : '⚠(<3)');
  console.log('  后端均合法  :', allRendererOk ? '✅' : '❌');
  console.log('  字段齐全    :', fieldsOk ? '✅' : '❌');
  console.log('  总时长      :', total, 's');

  const pass = scenes.length > 0 && fieldsOk && allRendererOk;
  console.log('\n' + (pass
    ? '✅ POC 通过：本机 claude CLI → 结构化多后端分镜 JSON，链路可行（零 key，复用本地登录态）。'
    : '⚠ 调用跑通了，但输出未完全达标，prompt 还需收紧。'));
  process.exit(pass ? 0 : 2);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
