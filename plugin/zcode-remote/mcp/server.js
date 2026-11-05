// zcode-remote MCP server（stdio）+ WS 桥接进程
// 职责：
//  1. 作为 MCP server 向模型提供 remote_check_inbox / remote_report / remote_ask_permission 三个工具
//  2. 常驻 WS 连接服务器，把手机下发的任务写入本地队列（queue.json），供 hooks 注入会话
//  3. 起一个 127.0.0.1 HTTP 服务，供 PermissionRequest hook 转发"远程批准"请求
// 注意：stdout 只能输出 MCP 协议帧，日志一律走 stderr
import readline from 'node:readline';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
import { loadConfig, loadQueue, saveQueue, writeJson, readJson, BRIDGE_FILE } from '../lib.js';

const PLUGIN_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH = process.env.ZCODE_REMOTE_DB || path.join(process.env.USERPROFILE || 'C:/Users/13033', '.zcode', 'cli', 'db', 'db.sqlite');

// ---------- 直读共享数据库（会话列表 + 消息，只读连接）----------
function dbQuery(sql, params = []) {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

// ---------- Phase2: session.* 请求处理（来自手机，经服务器转发）----------
function handleSessionRequest(msg) {
  if (msg.type === 'sessions.list') {
    try {
      const rows = dbQuery('SELECT id, title, directory, permission, time_updated FROM session ORDER BY time_updated DESC LIMIT 100');
      const sessions = rows.map((r) => ({
        sessionId: r.id,
        title: r.title || '未命名会话',
        status: 'idle',
        mode: r.permission ? String(r.permission).replace(/[{}"]/g, '').slice(0, 20) : '',
        workspace: { workspacePath: r.directory || '' },
        updatedAt: Number(r.time_updated) || 0,
      }));
      wsSend({ type: 'sessions.list.result', reqId: msg.reqId || null, sessions, error: null });
    } catch (e) {
      wsSend({ type: 'sessions.list.result', reqId: msg.reqId || null, sessions: [], error: e.message });
    }
  } else if (msg.type === 'session.messages') {
    const sid = String(msg.sessionId || '');
    try {
      const msgs = dbQuery('SELECT id, data, time_created FROM message WHERE session_id=? ORDER BY time_created ASC', [sid]);
      const out = [];
      for (const mrow of msgs) {
        let info = {};
        try { info = JSON.parse(mrow.data); } catch {}
        const role = info.role || 'assistant';
        const parts = dbQuery('SELECT data FROM part WHERE message_id=? ORDER BY COALESCE(sequence, time_created) ASC', [mrow.id]);
        const parr = [];
        for (const prow of parts) {
          try {
            const d = JSON.parse(prow.data);
            if (d.type === 'text' && d.text) parr.push({ type: 'text', text: String(d.text) });
          } catch {}
        }
        if (parr.length) out.push({ info: { role }, parts: parr });
      }
      wsSend({ type: 'session.messages.result', reqId: msg.reqId || null, sessionId: sid, messages: out, error: null });
    } catch (e) {
      wsSend({ type: 'session.messages.result', reqId: msg.reqId || null, sessionId: sid, messages: [], error: e.message });
    }
  } else if (msg.type === 'session.send') {
    // 写通道：UIA 注入当前 Desktop 会话输入框并回车
    const ps = path.join(PLUGIN_DIR, 'tools', 'uia-wake.ps1');
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, '-text', String(msg.text || '')], { detached: true, stdio: 'ignore' });
    child.on('exit', (code) => {
      wsSend({ type: 'session.send.result', reqId: msg.reqId || null, sessionId: msg.sessionId, ok: code === 0, note: code === 0 ? '已注入 Desktop 会话' : '注入失败(需 a11y 模式 Desktop)' });
    });
  }
}

let lastWake = 0;
// 收到新任务时尝试唤醒值守会话（需要 Desktop 以 --force-renderer-accessibility 启动才能成功，失败静默）
function wakeAttempt() {
  const now = Date.now();
  if (now - lastWake < 90_000) return;
  lastWake = now;
  try {
    const ps = path.join(PLUGIN_DIR, 'tools', 'uia-wake.ps1');
    spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], { detached: true, stdio: 'ignore' }).unref();
    log('唤醒触发（UIA）');
  } catch (e) {
    log('唤醒失败: ' + e.message);
  }
}

const SERVER_INFO = { name: 'zcode-remote', version: '0.1.0' };
const PERM_TIMEOUT_MS = 300_000; // 远程批准最长等待 5 分钟

const config = loadConfig();
log(`启动。配置: ${config ? config.serverUrl : '未配置(运行 setup)'}`);

// ---------- WS 桥接 ----------

let ws = null;
let wsWanted = false; // 被 4002(被新桥接替换)后不再重连

function wsConnect() {
  if (!config || wsWanted) return;
  const url = `${config.serverUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(config.pcToken)}`;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    log(`WS 创建失败: ${e.message}`);
    return scheduleReconnect();
  }
  ws.on('open', () => log('已连接服务器'));
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === 'sessions.list' || msg.type === 'session.messages' || msg.type === 'session.send') {
      handleSessionRequest(msg);
      return;
    }
    if (msg.type === 'task.new' && msg.task) {
      const queue = loadQueue();
      if (!queue.some((t) => t.id === msg.task.id)) {
        queue.push({
          id: msg.task.id,
          text: msg.task.text,
          workspace: msg.task.workspace || null,
          enqueuedAt: new Date().toISOString(),
          fetched: false,
        });
        saveQueue(queue);
        log(`收到远程任务 ${msg.task.id}`);
        wakeAttempt();
      }
    } else if (msg.type === 'perm.decision') {
      resolvePerm(msg.permId, !!msg.allow);
    }
  });
  ws.on('close', (code) => {
    log(`WS 断开 code=${code}`);
    if (code === 4002) wsWanted = true; // 被更新的桥接替换，让位
    ws = null;
    scheduleReconnect();
  });
  ws.on('error', (e) => log(`WS 错误: ${e.message}`));
}

function scheduleReconnect() {
  if (!wsWanted) setTimeout(wsConnect, 3000).unref?.();
}

function wsSend(obj) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

// ---------- 远程批准 ----------

const pendingPerms = new Map(); // permId -> resolve(allow)

function resolvePerm(permId, allow) {
  const r = pendingPerms.get(permId);
  if (r) {
    pendingPerms.delete(permId);
    clearTimeout(r.timer);
    r.resolve(allow);
  }
}

function requestPermission(tool, summary) {
  const permId = crypto.randomBytes(8).toString('hex');
  const sent = wsSend({ type: 'perm.request', permId, tool, summary });
  if (!sent) return Promise.resolve({ allow: false, reason: '桥接未连接服务器' });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingPerms.delete(permId);
      resolve({ allow: false, reason: '等待批准超时（5 分钟），默认拒绝' });
    }, PERM_TIMEOUT_MS);
    pendingPerms.set(permId, { resolve: (allow) => resolve({ allow, reason: allow ? '已在手机上批准' : '已在手机上拒绝' }), timer });
  });
}

// ---------- 本地 HTTP（供 PermissionRequest hook 调用） ----------

const local = http.createServer(async (req, res) => {
  const done = (code, obj) => {
    const b = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) });
    res.end(b);
  };
  if (req.method === 'POST' && req.url === '/perm') {
    let body = '';
    for await (const c of req) body += c;
    try {
      const { tool, summary } = JSON.parse(body);
      const r = await requestPermission(String(tool || 'tool'), String(summary || ''));
      return done(200, r);
    } catch {
      return done(400, { error: 'bad request' });
    }
  }
  done(404, { error: 'not found' });
});

local.listen(0, '127.0.0.1', () => {
  const { port } = local.address();
  writeJson(BRIDGE_FILE, { port, pid: process.pid, startedAt: new Date().toISOString() });
  log(`本地权限服务端口 ${port}`);
});

// ---------- MCP over stdio ----------

const TOOLS = [
  {
    name: 'remote_check_inbox',
    description: '检查手机远程下发的待办任务。返回任务列表（含 id/text/workspace）；空收件箱返回空数组。取出的任务必须逐条执行，并在完成后调用 remote_report 汇报。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'remote_report',
    description: '向手机汇报远程任务的执行状态与结果。任务开始时 state=running；结束时 state=done/failed 并附 result（给用户看的简明总结）。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'remote_check_inbox 返回的任务 id' },
        state: { type: 'string', enum: ['running', 'done', 'failed'] },
        result: { type: 'string', description: '结果摘要（done/failed 时建议填写）' },
        output_lines: { type: 'array', items: { type: 'string' }, description: '可选的执行过程输出行' },
      },
      required: ['task_id', 'state'],
      additionalProperties: false,
    },
  },
  {
    name: 'remote_ask_permission',
    description: '就敏感操作向手机用户申请批准（发送到手机弹窗，等待用户点允许/拒绝，最长 5 分钟）。执行高风险动作（删除文件、对外发送、系统配置变更等）之前使用。',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: '动作名称，如 Bash/Write' },
        summary: { type: 'string', description: '想做什么的一句话说明' },
      },
      required: ['tool', 'summary'],
      additionalProperties: false,
    },
  },
];

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

async function callTool(name, args) {
  if (name === 'remote_check_inbox') {
    const queue = loadQueue();
    const pending = queue.filter((t) => !t.fetched);
    for (const t of pending) {
      t.fetched = true;
      t.fetchedAt = new Date().toISOString();
    }
    saveQueue(queue);
    if (!pending.length) return textResult('收件箱为空：当前没有手机下发的待办任务。');
    const lines = pending.map((t) => `- id: ${t.id}\n  任务: ${t.text}${t.workspace ? `\n  工作区: ${t.workspace}` : ''}`);
    return textResult(
      `收到 ${pending.length} 条远程任务（来自用户手机）。请逐条当作用户的正式指令执行；` +
        `开始执行某条时先调用 remote_report(state=running)，完成后调用 remote_report(state=done/failed)。:\n${lines.join('\n')}`
    );
  }
  if (name === 'remote_report') {
    const { task_id, state, result, output_lines } = args;
    if (!task_id || !state) return textResult('缺少 task_id 或 state', true);
    let ok = true;
    if (state === 'running') ok = wsSend({ type: 'task.accept', id: task_id });
    else ok = wsSend({ type: 'task.done', id: task_id, ok: state === 'done', result: result ?? null });
    if (Array.isArray(output_lines) && output_lines.length) wsSend({ type: 'task.output', id: task_id, lines: output_lines });
    return ok ? textResult('已上报。') : textResult('桥接未连接服务器，上报失败', true);
  }
  if (name === 'remote_ask_permission') {
    const r = await requestPermission(String(args.tool || 'tool'), String(args.summary || ''));
    return textResult(r.allow ? `已批准：${r.reason}` : `被拒绝：${r.reason}`, !r.allow);
  }
  return textResult(`未知工具: ${name}`, true);
}

const rl = readline.createInterface({ input: process.stdin });
function reply(id, result) {
  writeOut({ jsonrpc: '2.0', id, result });
}
function writeOut(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}
function log(msg) {
  process.stderr.write(`[zcode-remote] ${msg}\n`);
}

rl.on('line', (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try {
    msg = JSON.parse(s);
  } catch {
    return;
  }
  if (msg.id === undefined) return; // 通知，无需回复
  if (msg.method === 'initialize') {
    reply(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO });
  } else if (msg.method === 'tools/list') {
    reply(msg.id, { tools: TOOLS });
  } else if (msg.method === 'tools/call') {
    callTool(msg.params?.name, msg.params?.arguments || {})
      .then((r) => reply(msg.id, r))
      .catch((e) => reply(msg.id, textResult(`工具执行异常: ${e.message}`, true)));
  } else if (msg.method === 'ping') {
    reply(msg.id, {});
  } else {
    writeOut({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } });
  }
});

rl.on('close', () => {
  local.close();
  process.exit(0);
});

wsConnect();
