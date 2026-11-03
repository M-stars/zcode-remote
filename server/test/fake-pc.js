// 模拟 PC 桥接：连接服务器，接收任务，自动回accept/进度/结果。用于无插件环境的联调测试。
// 用法: node test/fake-pc.js [wsUrl] [pcToken]
//   wsUrl 默认 ws://127.0.0.1:8787/ws ，pcToken 默认读取 data/tokens.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tokens.json'), 'utf8'));
const url = process.argv[2] || 'ws://127.0.0.1:8787/ws';
const pcToken = process.argv[3] || tokens.pcToken;

const ws = new WebSocket(`${url}?token=${pcToken}`);
const auto = !process.argv.includes('--manual');

ws.on('open', () => console.log('[fake-pc] 已连接'));
ws.on('close', (c, r) => console.log('[fake-pc] 断开', c, String(r)));
ws.on('error', (e) => console.log('[fake-pc] 错误', e.message));
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('[fake-pc] <-', JSON.stringify(msg).slice(0, 200));
  if (!auto) return;
  if (msg.type === 'task.new') {
    const id = msg.task.id;
    ws.send(JSON.stringify({ type: 'task.accept', id }));
    setTimeout(() => ws.send(JSON.stringify({ type: 'task.output', id, lines: [`[fake] 正在处理: ${msg.task.text.slice(0, 40)}`] })), 300);
    setTimeout(() => ws.send(JSON.stringify({ type: 'task.done', id, ok: true, result: '[fake] 已完成（模拟 PC 执行）' })), 800);
  }
  if (msg.type === 'perm.decision') console.log('[fake-pc] 权限决定:', msg.permId, msg.allow);
});
