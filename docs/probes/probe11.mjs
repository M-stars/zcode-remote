import { spawn } from 'node:child_process';
import fs from 'node:fs';
const LOG = 'D:/zcode-remote/.tools/appserver-probe11.log';
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
      fs.appendFileSync(LOG, `[event] ${JSON.stringify(m.params).slice(0,350)}\n`);
    }
  }
});
function rpc(method, params, timeoutMs = 25000) {
  const id = nextId++;
  return new Promise((res) => { const t = setTimeout(() => res({ TIMEOUT: true }), timeoutMs);
    pending.set(id, (m) => { clearTimeout(t);
      fs.appendFileSync(LOG, `[resp] ${method} → ${JSON.stringify(m).slice(0, 600)}\n`); res(m); });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); });
}
await new Promise(r => setTimeout(r, 4000));
const cfg = {
  revision: 'v1',
  basedOnZCodeBuiltinRevision: '43',
  providers: { 'bigmodel-start-plan': { access: { type: 'zhipu-account' } } },
  states: {},
};
const upd = await rpc('provider/updateAccountConfig', cfg);
if (upd?.error) { console.log('CFG_ERR'); process.exit(1); }
await rpc('provider/refreshRegistry', { reason: 'bridge' });
const created = await rpc('session/create', { workspace: { workspacePath: 'D:/zcode-remote', workspaceKey: 'D:/zcode-remote' } });
const sid = created?.result?.session?.sessionId;
const avail = created?.result?.settings?.model?.available;
console.log('model.available =', JSON.stringify(avail));
if (!sid || !avail || !avail.length) process.exit(1);
const sm = await rpc('session/setModel', { sessionId: sid, model: { providerId: 'bigmodel-start-plan', modelId: 'GLM-5.3-Flash' } });
console.log('setModel:', JSON.stringify(sm).slice(0, 150));
await rpc('session/send', { sessionId: sid, content: '只回答四个字：收到没有' });
await new Promise(r => setTimeout(r, 40000));
const msgs = await rpc('session/messages', { sessionId: sid });
const list = msgs?.result?.messages || [];
console.log('messages:', list.length);
for (const m of list) console.log(' -', m.info?.role, JSON.stringify(m.parts).slice(0, 160));
child.kill(); process.exit(0);
