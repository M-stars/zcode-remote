import WebSocket from 'ws';
import fs from 'node:fs';

const t = JSON.parse(fs.readFileSync('D:/zcode-remote/.tools/aliyun-tokens.json', 'utf8')).phoneToken;
const ws = new WebSocket('wss://mstarsm.com/zremote/ws?token=' + t);
const timer = setTimeout(() => { console.log('TIMEOUT_NO_RESULT'); process.exit(1); }, 40000);
ws.on('open', () => { console.log('ws open'); ws.send(JSON.stringify({ type: 'sessions.list' })); });
ws.on('message', (d) => {
  const m = JSON.parse(d);
  console.log('MSG:', m.type, '| sessions:', (m.sessions || []).length, '| error:', m.error || '-');
  if (m.type === 'sessions.list.result') {
    clearTimeout(timer);
    (m.sessions || []).slice(0, 3).forEach((s) => console.log(' -', s.sessionId, String(s.title).slice(0, 30)));
    process.exit(0);
  }
});
ws.on('error', (e) => console.log('ERR', e.message));
