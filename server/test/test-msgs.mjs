import WebSocket from 'ws';
import fs from 'node:fs';

const t = JSON.parse(fs.readFileSync('D:/zcode-remote/.tools/aliyun-tokens.json', 'utf8')).phoneToken;
const sid = process.argv[2];
const ws = new WebSocket('wss://mstarsm.com/zremote/ws?token=' + t);
const timer = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 60000);
ws.on('open', () => ws.send(JSON.stringify({ type: 'session.messages', sessionId: sid })));
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.type !== 'session.messages.result') return; // 忽略广播（pc.online 等）
  console.log('RESULT | error:', m.error || '-', '| msgs:', (m.messages || []).length);
  for (const x of (m.messages || []).slice(0, 4)) {
    console.log(' -', x.info?.role, JSON.stringify(x.parts).slice(0, 90));
  }
  clearTimeout(timer);
  process.exit(0);
});
ws.on('close', (c, r) => { console.log('CLOSED', c, String(r).slice(0, 80)); });
ws.on('error', (e) => console.log('ERR', e.message));
