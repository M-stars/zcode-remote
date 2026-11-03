// 探测4：长超时 + 应答服务器反向请求 + 完整事件流采集
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const LOG = 'D:/zcode-remote/.tools/appserver-probe4.log';
fs.writeFileSync(LOG, '');
const log = (tag, obj) => fs.appendFileSync(LOG, `[${tag}] ${JSON.stringify(obj).slice(0, 1500)}\n`);

const child = spawn(process.env.ZCODE_EXE, ['D:/zcode/resources/glm/zcode.cjs', 'app-server', '--stdio'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', (d) => fs.appendFileSync(LOG, '[stderr] ' + d.toString().slice(0, 300) + '\n'));

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
      // 服务器反向请求：按 schema 应答 runtime preferences
      log('srvReq', msg);
      child.stdin.write(
        JSON.stringify({ id: msg.id, result: { nativeSearchEnhancementsEnabled: false } }) + '\n'
      );
    } else if (msg.method) {
      log('event', msg);
    }
  }
});

function rpc(method, params, timeoutMs = 30000) {
  const id = nextId++;
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ TIMEOUT: true }), timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(t);
      log('resp', { method, msg });
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

await new Promise((r) => setTimeout(r, 4000));

const created = await rpc('session/create', {
  workspace: { workspacePath: 'D:/zcode-remote', workspaceKey: 'D:/zcode-remote' },
});
const r = created?.result || {};
const sid = r.sessionId || r.session?.sessionId || r.session?.id || r.id || null;
log('probe', { sid, resultKeys: Object.keys(r) });
if (!sid) {
  child.kill();
  process.exit(1);
}

await new Promise((rr) => setTimeout(rr, 3000));
log('probe', 'send:text');
await rpc('session/send', { sessionId: sid, content: '用一句话回答：你是谁' });

await new Promise((rr) => setTimeout(rr, 40000));
child.kill();
process.exit(0);
