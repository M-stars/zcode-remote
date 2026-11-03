// 冒烟测试：node test/smoke.mjs [baseUrl]
// 前置：服务器已启动（npm start）。验证健康检查、鉴权、任务创建与列表。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://127.0.0.1:8787';
const tokens = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/tokens.json'), 'utf8'));
const H = (t) => ({ 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' });

const health = await (await fetch(`${base}/health`)).json();
console.log('health:', JSON.stringify(health));
if (!health.ok) process.exit(1);

const noAuth = await fetch(`${base}/tasks`);
console.log('无token应401:', noAuth.status);

const created = await (await fetch(`${base}/tasks`, {
  method: 'POST',
  headers: H(tokens.phoneToken),
  body: JSON.stringify({ text: '冒烟测试：列出 D 盘根目录' }),
})).json();
console.log('创建任务:', created.task?.id, created.task?.text, created.task?.state);

const list = await (await fetch(`${base}/tasks`, { headers: H(tokens.phoneToken) })).json();
console.log('任务总数:', list.tasks.length, '| 最新状态:', list.tasks[0]?.state);
if (!created.task?.id) process.exit(1);
