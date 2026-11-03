// 探测2：按正确封包 {id,method,params} 逐步试探 session 全生命周期
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const LOG = 'D:/zcode-remote/.tools/appserver-probe.log';
const out = [];
const log = (tag, obj) => {
  const line = JSON.stringify(obj);
  out.push(`[${tag}] ${line}`);
  fs.appendFileSync(LOG, `[${tag}] ${line}\n`);
};

fs.writeFileSync(LOG, '');
const child = spawn(process.env.ZCODE_EXE, ['D:/zcode/resources/glm/zcode.cjs', 'app-server', '--stdio'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', (d) => fs.appendFileSync(LOG, '[stderr] ' + d.toString() + '\n'));

const pending = new Map();
let nextId = 1;
child.stdout.on('data', (buf) => {
  for (const line of buf.toString().split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const msg = JSON.parse(s);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else {
        log('notify', msg);
      }
    } catch {
      fs.appendFileSync(LOG, '[raw] ' + s.slice(0, 200) + '\n');
    }
  }
});

function rpc(method, params, timeoutMs = 8000) {
  const id = nextId++;
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ TIMEOUT: true, method }), timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(t);
      log('resp', { id, method, msg });
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

await new Promise((r) => setTimeout(r, 4000));

log('probe', { step: 'session/list 空参数' });
await rpc('session/list', {});

log('probe', { step: 'session/create 空参数(看必填字段报错)' });
await rpc('session/create', {});

log('probe', { step: 'session/create 带 cwd' });
const created = await rpc('session/create', { cwd: 'D:/zcode-remote' });

// 从返回里猜 sessionId 字段名
const sid =
  created?.result?.sessionId || created?.result?.session?.sessionId || created?.result?.session?.id || created?.result?.id || null;
log('probe', { step: 'sessionId 提取', sid, keys: created?.result ? Object.keys(created.result) : null });

if (sid) {
  log('probe', { step: 'session/send 空参数(看 message 必填)' });
  await rpc('session/send', { sessionId: sid });

  log('probe', { step: 'session/send 带 text' });
  await rpc('session/send', { sessionId: sid, message: '用一句话回答：你是谁', text: '用一句话回答：你是谁' });

  // 订阅事件流 25 秒，等模型回复
  await new Promise((r) => setTimeout(r, 25000));
}

child.kill();
process.exit(0);
