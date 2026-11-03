// PermissionRequest hook：远程任务进行中时，把工具权限请求转发到手机等用户批准
// 仅当 30 分钟内有过取出的远程任务（远程值守态）才介入；否则输出空，走本地正常确认
import http from 'node:http';
import { readJson, loadQueue, BRIDGE_FILE } from '../lib.js';

const REMOTE_WINDOW_MS = 30 * 60 * 1000;

function remoteSessionActive() {
  const queue = loadQueue().filter((t) => t.fetchedAt && Date.now() - new Date(t.fetchedAt).getTime() < REMOTE_WINDOW_MS);
  return queue.length > 0;
}

function askBridge(tool, summary) {
  const bridge = readJson(BRIDGE_FILE, null);
  if (!bridge || !bridge.port) return Promise.resolve({ allow: false, reason: '桥接未运行' });
  const body = JSON.stringify({ tool, summary });
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: bridge.port, path: '/perm', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 315000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ allow: false, reason: '桥接响应异常' });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ allow: false, reason: '等待批准超时' });
    });
    req.on('error', (e) => resolve({ allow: false, reason: `桥接连接失败: ${e.message}` }));
    req.end(body);
  });
}

async function main() {
  const raw = await new Promise((resolve) => {
    let d = '';
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
    setTimeout(() => resolve(d), 2000);
  });
  let tool = 'tool';
  let summary = '';
  try {
    const input = JSON.parse(raw);
    tool = input.tool_name || 'tool';
    summary = JSON.stringify(input.tool_input || {}).slice(0, 500);
  } catch {
    /* 无输入也能继续 */
  }
  if (!remoteSessionActive()) return; // 本地使用，不打扰手机
  const r = await askBridge(tool, summary);
  process.stdout.write(JSON.stringify({ decision: r.allow ? 'allow' : 'deny', reason: r.reason || '' }));
}

main().catch(() => {});
