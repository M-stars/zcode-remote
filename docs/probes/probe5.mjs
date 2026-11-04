// 探测5：state.updated 完整 payload + session/messages/setModel/setMode/setThoughtLevel/stop
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const LOG = 'D:/zcode-remote/.tools/appserver-probe5.log';
fs.writeFileSync(LOG, '');
const log = (tag, obj) => fs.appendFileSync(LOG, `[${tag}] ${JSON.stringify(obj)}\n`);

const child = spawn(process.env.ZCODE_EXE, ['D:/zcode/resources/glm/zcode.cjs', 'app-server', '--stdio', '--surface', 'desktop'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', () => {});

const pending = new Map();
let nextId = 1;
child.stdout.on('data', (buf) => {
  for (const line of buf.toString().split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let msg;
    try {
      msg = JSON.parse(s);
    } catch {
      continue;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const r = pending.get(msg.id);
      pending.delete(msg.id);
      r(msg);
    } else if (msg.method && msg.id !== undefined) {
      // 服务器反向请求
      log('srvReq', msg);
      child.stdin.write(JSON.stringify({ id: msg.id, result: { nativeSearchEnhancementsEnabled: false } }) + '\n');
    } else if (msg.method) {
      // 只记 lifecycle 和 state.updated 的完整 payload，遥测类只计数
      if (String(msg.method).startsWith('startup/')) continue;
      if (msg.method === 'state.updated' || msg.method === 'session/lifecycle/changed') log('event', msg);
      else log('other', { method: msg.method });
    }
  }
});

function rpc(method, params, timeoutMs = 30000) {
  const id = nextId++;
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ TIMEOUT: true, method }), timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(t);
      log('resp', { method, msg });
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

await new Promise((r) => setTimeout(r, 4000));

// 1. 创建会话
const created = await rpc('session/create', {
  workspace: { workspacePath: 'D:/zcode-remote', workspaceKey: 'D:/zcode-remote' },
});
const r = created?.result || {};
const sid = r.session?.sessionId || r.sessionId || null;
log('probe', { step: 'created', sid });
if (!sid) process.exit(1);
await new Promise((rr) => setTimeout(rr, 3000));

// 2. 设置类方法：先用空参探 schema（zod 报错即文档）
log('probe', { step: 'setModel 空参' });
await rpc('session/setModel', { sessionId: sid });
log('probe', { step: 'setThoughtLevel 空参' });
await rpc('session/setThoughtLevel', { sessionId: sid });
log('probe', { step: 'setMode 空参' });
await rpc('session/setMode', { sessionId: sid });

// 3. 发消息触发回复
log('probe', { step: 'send' });
await rpc('session/send', { sessionId: sid, content: '只回答四个字：收到没有' });

// 4. 等模型回复的事件流
await new Promise((rr) => setTimeout(rr, 30000));

// 5. 拉完整消息
log('probe', { step: 'messages 空参' });
await rpc('session/messages', { sessionId: sid });

// 6. stop
log('probe', { step: 'stop' });
await rpc('session/stop', { sessionId: sid });

await new Promise((rr) => setTimeout(rr, 2000));
child.kill();
process.exit(0);
