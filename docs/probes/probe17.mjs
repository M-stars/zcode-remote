import { spawn } from 'node:child_process';
import fs from 'node:fs';
const LOG = 'D:/zcode-remote/.tools/appserver-probe17.log';
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
      fs.appendFileSync(LOG, `[resp] ${method} → ${JSON.stringify(m).slice(0, 450)}\n`); res(m); });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); });
}
await new Promise(r => setTimeout(r, 4000));
const cfg = {
  revision: 'v1', basedOnZCodeBuiltinRevision: '43', states: {},
  providers: { 'bigmodel-start-plan': { builtinModelIds: ['GLM-5.3', 'GLM-5.3-Flash'], access: { type: 'zhipu-account', entitled: true } } },
};
await rpc('provider/updateAccountConfig', cfg);
await rpc('provider/refreshRegistry', { reason: 'bridge' });
// 变体1: create + runtimeConfig.modelSelection
let created = await rpc('session/create', {
  workspace: { workspacePath: 'D:/zcode-remote', workspaceKey: 'D:/zcode-remote' },
  runtimeConfig: { modelSelection: { providerId: 'bigmodel-start-plan', modelId: 'GLM-5.3-Flash' } },
});
if (created?.error) {
  console.log('create+runtimeConfig 失败:', String(created.error.data?.message).replace(/\s+/g,' ').slice(0,150));
  // 变体2: 普通create
  created = await rpc('session/create', { workspace: { workspacePath: 'D:/zcode-remote', workspaceKey: 'D:/zcode-remote' } });
}
const sid = created?.result?.session?.sessionId;
console.log('sid =', sid, '| avail =', JSON.stringify(created?.result?.settings?.model?.available));
if (!sid) process.exit(1);
const sm = await rpc('session/setModel', { sessionId: sid, model: { providerId: 'bigmodel-start-plan', modelId: 'GLM-5.3-Flash' } });
console.log('setModel:', sm?.error ? String(sm.error.data?.message||sm.error.message).replace(/\s+/g,' ').slice(0,120) : JSON.stringify(sm.result).slice(0,120));
if (!sm?.error) {
  await rpc('session/send', { sessionId: sid, content: '只回答四个字：收到没有' });
  await new Promise(r => setTimeout(r, 40000));
  const msgs = await rpc('session/messages', { sessionId: sid });
  const list = msgs?.result?.messages || [];
  console.log('messages:', list.length);
  for (const m of list) console.log(' -', m.info?.role, JSON.stringify(m.parts).slice(0, 140));
}
child.kill(); process.exit(0);
