// MCP server 冒烟测试：spawn 子进程，走 stdio 协议验证握手/工具列表/收件箱/上报
// 前置：中转服务器已启动（server: npm start）
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // plugin/zcode-remote
const child = spawn('node', [path.join(root, 'mcp', 'server.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', (d) => process.stderr.write('[bridge] ' + d));

const pending = new Map();
let nextId = 1;
child.stdout.on('data', (buf) => {
  for (const line of buf.toString().split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const msg = JSON.parse(s);
      const r = pending.get(msg.id);
      if (r) {
        pending.delete(msg.id);
        r(msg);
      }
    } catch {}
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
console.log('initialize →', JSON.stringify(init.result?.serverInfo));
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const list = await rpc('tools/list', {});
console.log('tools →', list.result?.tools?.map((t) => t.name).join(', '));

const empty = await rpc('tools/call', { name: 'remote_check_inbox', arguments: {} });
console.log('空收件箱 →', empty.result?.content?.[0]?.text?.slice(0, 40));

// 通过 REST 注入一条任务（等桥接 WS 收到）
const tokens = (await import('node:fs')).readFileSync('D:/zcode-remote/server/data/tokens.json', 'utf8');
const phoneToken = JSON.parse(tokens).phoneToken;
const created = await (
  await fetch('http://127.0.0.1:8787/tasks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${phoneToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'MCP 冒烟：计算 1+1 并回答' }),
  })
).json();
console.log('注入任务 →', created.task?.id);
await new Promise((r) => setTimeout(r, 1500));

const inbox = await rpc('tools/call', { name: 'remote_check_inbox', arguments: {} });
const text = inbox.result?.content?.[0]?.text || '';
console.log('收件箱 →', text.slice(0, 120));
const taskId = created.task.id;

await rpc('tools/call', { name: 'remote_report', arguments: { task_id: taskId, state: 'running' } });
await rpc('tools/call', {
  name: 'remote_report',
  arguments: { task_id: taskId, state: 'done', result: 'MCP 冒烟测试完成：1+1=2', output_lines: ['[smoke] 计算完毕'] },
});
await new Promise((r) => setTimeout(r, 800));
const check = await (await fetch(`http://127.0.0.1:8787/tasks/${taskId}`, { headers: { Authorization: `Bearer ${phoneToken}` } })).json();
console.log('服务器端任务状态 →', check.task?.state, '|', check.task?.result);

child.kill();
process.exit(check.task?.state === 'done' ? 0 : 1);
