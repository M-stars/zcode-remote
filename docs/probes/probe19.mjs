import { spawn } from 'node:child_process';
import fs from 'node:fs';
const LOG = 'D:/zcode-remote/.tools/appserver-probe19.log';
fs.writeFileSync(LOG, '');
const child = spawn(process.env.ZCODE_EXE, ['D:/zcode/resources/glm/zcode.cjs', 'app-server', '--stdio'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
});
const pending = new Map(); let nextId = 1;
child.stdout.on('data', (buf) => {
  for (const line of buf.toString().split('\n')) { const s = line.trim(); if (!s) continue;
    let m; try { m = JSON.parse(s); } catch { continue; }
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method && m.id !== undefined) {
      child.stdin.write(JSON.stringify({ id: m.id, result: { nativeSearchEnhancementsEnabled: false } }) + '\n');
    } else if (m.method === 'state.updated') {
      fs.appendFileSync(LOG, `[event] ${JSON.stringify(m.params).slice(0,300)}\n`);
    }
  }
});
function rpc(method, params, timeoutMs = 25000) {
  const id = nextId++;
  return new Promise((res) => { const t = setTimeout(() => res({ TIMEOUT: true }), timeoutMs);
    pending.set(id, (m) => { clearTimeout(t);
      fs.appendFileSync(LOG, `[resp] ${method} → ${JSON.stringify(m).slice(0, 350)}\n`); res(m); });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); });
}
await new Promise(r => setTimeout(r, 4000));
const list = await rpc('session/list', {});
const sessions = list?.result?.sessions || [];
console.log('会话数:', sessions.length);
// 找一个非当前会话的老会话
const target = sessions.find(s => s.sessionId !== 'sess_01621db1-2bb1-477f-b1cd-254efb03ea4b' && s.status === 'idle');
console.log('resume 目标:', target?.sessionId, '|', String(target?.title).slice(0,30));
if (!target) process.exit(1);
const r = await rpc('session/resume', { sessionId: target.sessionId });
const sid = r?.result?.session?.sessionId || target.sessionId;
console.log('resume 后 avail =', JSON.stringify(r?.result?.settings?.model?.available), '| model:', JSON.stringify(r?.result?.settings?.model?.current ?? null));
await rpc('session/send', { sessionId: sid, content: '只回答四个字：收到没有' });
await new Promise(rr => setTimeout(rr, 40000));
const msgs = await rpc('session/messages', { sessionId: sid });
const list2 = msgs?.result?.messages || [];
console.log('messages:', list2.length);
for (const m of list2.slice(-3)) console.log(' -', m.info?.role, m.info?.semantics?.kind || '', JSON.stringify(m.parts).slice(0, 140));
child.kill(); process.exit(0);
