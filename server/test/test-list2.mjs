import WebSocket from 'ws';
import fs from 'node:fs';
const t = JSON.parse(fs.readFileSync('D:/zcode-remote/.tools/aliyun-tokens.json','utf8')).phoneToken;
const ws = new WebSocket('wss://mstarsm.com/zremote/ws?token=' + t);
const timer = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 30000);
ws.on('open', () => ws.send(JSON.stringify({ type: 'sessions.list' })));
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.type !== 'sessions.list.result') return;
  clearTimeout(timer);
  for (const s of (m.sessions||[]).filter(s => String(s.title).includes('收到没有') || String(s.title).includes('remote_check_inbox')))
    console.log(s.sessionId, '|', String(s.title).slice(0,40), '|', s.status);
  process.exit(0);
});
