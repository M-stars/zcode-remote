// zcode-remote 中转服务器
// REST：手机端发任务/查状态/批准权限；WebSocket：PC 桥接与手机实时推送
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { loadTokens, loadTasks, saveTasks, persistDebounced, newId } from './store.js';

const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 256 * 1024;
const MAX_TAIL_LINES = 100;

const tokens = loadTokens();
let tasks = loadTasks();

const clients = { pc: null, phones: new Set() };
const pendingPerms = new Map(); // permId -> { tool, summary, taskId, requestedAt }

// ---------- 任务操作 ----------

function publicTask(t) {
  return { ...t };
}

function findTask(id) {
  return tasks.find((t) => t.id === id) || null;
}

function createTask(text, workspace) {
  const task = {
    id: newId(),
    text: String(text).slice(0, 20_000),
    workspace: workspace ? String(workspace) : null,
    state: 'queued', // queued -> running -> done | failed | cancelled
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    finishedAt: null,
    result: null,
    outputTail: [],
  };
  tasks.unshift(task);
  persistDebounced(tasks);
  sendToPc({ type: 'task.new', task: publicTask(task) });
  broadcastPhones({ type: 'task.status', id: task.id, state: task.state });
  return task;
}

function updateTask(id, patch, phoneEvent) {
  const t = findTask(id);
  if (!t) return null;
  Object.assign(t, patch);
  persistDebounced(tasks);
  if (phoneEvent) broadcastPhones({ ...phoneEvent, id });
  return t;
}

// ---------- WebSocket ----------

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function sendToPc(obj) {
  send(clients.pc, obj);
}

function broadcastPhones(obj) {
  for (const ws of clients.phones) send(ws, obj);
}

function attachHeartbeat(ws) {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
}

setInterval(() => {
  for (const ws of [clients.pc, ...clients.phones].filter(Boolean)) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000).unref();

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token') || '';
  const role = token === tokens.pcToken ? 'pc' : token === tokens.phoneToken ? 'phone' : null;
  if (!role) {
    ws.close(4001, 'invalid token');
    return;
  }
  ws.role = role;
  attachHeartbeat(ws);

  if (role === 'pc') {
    if (clients.pc && clients.pc !== ws) clients.pc.close(4002, 'replaced');
    clients.pc = ws;
    console.log(`[ws] PC 桥接已连接`);
    broadcastPhones({ type: 'pc.online' });
    // 补发积压任务
    for (const t of tasks.filter((x) => x.state === 'queued')) {
      send(ws, { type: 'task.new', task: publicTask(t) });
    }
  } else {
    clients.phones.add(ws);
    console.log(`[ws] 手机已连接（共 ${clients.phones.size} 台）`);
  }

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    // Phase2: session.* 请求/结果 双向转发（手机↔桥接）
    const isSessionReq = msg.type && (msg.type === 'sessions.list' || msg.type === 'session.messages' || msg.type === 'session.send');
    if (isSessionReq && role === 'phone') {
      sendToPc(msg);
      return;
    }
    if (msg.type && (msg.type.startsWith('sessions.') || msg.type.startsWith('session.')) && msg.type.endsWith('.result') && role === 'pc') {
      broadcastPhones(msg);
      return;
    }
    handleWsMessage(ws, msg);
  });

  ws.on('close', () => {
    if (ws.role === 'pc') {
      if (clients.pc === ws) {
        clients.pc = null;
        console.log('[ws] PC 桥接已断开');
        broadcastPhones({ type: 'pc.offline' });
      }
    } else {
      clients.phones.delete(ws);
    }
  });
});

function handleWsMessage(ws, msg) {
  switch (msg.type) {
    case 'task.accept': {
      const t = updateTask(msg.id, { state: 'running', acceptedAt: new Date().toISOString() });
      if (t) broadcastPhones({ type: 'task.status', id: t.id, state: 'running' });
      break;
    }
    case 'task.status': {
      const state = msg.state === 'running' ? 'running' : msg.state === 'queued' ? 'queued' : null;
      if (!state) return;
      const t = updateTask(msg.id, { state, note: msg.note ?? null });
      if (t) broadcastPhones({ type: 'task.status', id: t.id, state, note: msg.note ?? null });
      break;
    }
    case 'task.output': {
      const t = findTask(msg.id);
      if (!t || !Array.isArray(msg.lines)) return;
      t.outputTail.push(...msg.lines.map(String));
      if (t.outputTail.length > MAX_TAIL_LINES) t.outputTail.splice(0, t.outputTail.length - MAX_TAIL_LINES);
      persistDebounced(tasks);
      broadcastPhones({ type: 'task.output', id: t.id, lines: msg.lines.map(String) });
      break;
    }
    case 'task.done': {
      const t = updateTask(msg.id, {
        state: msg.ok ? 'done' : 'failed',
        finishedAt: new Date().toISOString(),
        result: typeof msg.result === 'string' ? msg.result.slice(0, 20_000) : msg.result ?? null,
      });
      if (t) broadcastPhones({ type: 'task.done', id: t.id, state: t.state, result: t.result });
      break;
    }
    case 'perm.request': {
      const permId = typeof msg.permId === 'string' ? msg.permId : newId();
      pendingPerms.set(permId, {
        tool: String(msg.tool || 'unknown'),
        summary: String(msg.summary || '').slice(0, 2000),
        taskId: msg.taskId || null,
        requestedAt: new Date().toISOString(),
      });
      broadcastPhones({ type: 'perm.request', permId, tool: pendingPerms.get(permId).tool, summary: pendingPerms.get(permId).summary, taskId: msg.taskId || null });
      break;
    }
    default:
      break;
  }
}

// ---------- HTTP ----------

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function auth(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const t = m[1].trim();
  if (t === tokens.pcToken) return 'pc';
  if (t === tokens.phoneToken) return 'phone';
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    // 健康检查（无需认证）
    if (p === '/health' && req.method === 'GET') {
      const queued = tasks.filter((t) => t.state === 'queued').length;
      const running = tasks.filter((t) => t.state === 'running').length;
      return json(res, 200, { ok: true, pcOnline: !!clients.pc, phones: clients.phones.size, queued, running, time: new Date().toISOString() });
    }

    const role = auth(req);
    if (!role) return json(res, 401, { error: 'unauthorized' });

    if (p === '/tasks' && req.method === 'POST' && role === 'phone') {
      const body = await readBody(req);
      const text = (body.text || '').trim();
      if (!text) return json(res, 400, { error: 'text required' });
      const task = createTask(text, body.workspace);
      return json(res, 201, { task: publicTask(task) });
    }

    if (p === '/tasks' && req.method === 'GET') {
      return json(res, 200, { tasks: tasks.map(publicTask) });
    }

    const taskMatch = /^\/tasks\/([0-9a-f]+)$/.exec(p);
    if (taskMatch && req.method === 'GET') {
      const t = findTask(taskMatch[1]);
      return t ? json(res, 200, { task: publicTask(t) }) : json(res, 404, { error: 'not found' });
    }

    const cancelMatch = /^\/tasks\/([0-9a-f]+)\/cancel$/.exec(p);
    if (cancelMatch && req.method === 'POST') {
      const id = cancelMatch[1];
      const t = findTask(id);
      if (!t) return json(res, 404, { error: 'not found' });
      if (t.state !== 'queued' && t.state !== 'running') return json(res, 409, { error: `state=${t.state}` });
      updateTask(id, { state: 'queued', cancelRequested: true });
      sendToPc({ type: 'task.cancel', id });
      broadcastPhones({ type: 'task.status', id, state: 'cancel_requested' });
      return json(res, 200, { ok: true });
    }

    if (taskMatch && req.method === 'DELETE' && role === 'phone') {
      const idx = tasks.findIndex((t) => t.id === taskMatch[1]);
      if (idx === -1) return json(res, 404, { error: 'not found' });
      tasks.splice(idx, 1);
      persistDebounced(tasks);
      broadcastPhones({ type: 'task.deleted', id: taskMatch[1] });
      return json(res, 200, { ok: true });
    }

    const permMatch = /^\/perm\/([A-Za-z0-9_-]+)$/.exec(p);
    if (permMatch && req.method === 'POST' && role === 'phone') {
      const body = await readBody(req);
      if (typeof body.allow !== 'boolean') return json(res, 400, { error: 'allow required' });
      if (!pendingPerms.has(permMatch[1])) return json(res, 404, { error: 'perm not found or expired' });
      const perm = pendingPerms.get(permMatch[1]);
      pendingPerms.delete(permMatch[1]);
      sendToPc({ type: 'perm.decision', permId: permMatch[1], allow: body.allow, tool: perm.tool });
      return json(res, 200, { ok: true });
    }

    if (p === '/perm' && req.method === 'GET' && role === 'phone') {
      return json(res, 200, { pending: [...pendingPerms.entries()].map(([permId, v]) => ({ permId, ...v })) });
    }

    return json(res, 404, { error: 'not found' });
  } catch (err) {
    return json(res, err.message === 'invalid json' || err.message === 'body too large' ? 400 : 500, { error: err.message });
  }
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

server.listen(PORT, () => {
  console.log(`zcode-remote 服务器已启动: http://0.0.0.0:${PORT}`);
  console.log(`token 文件: server/data/tokens.json（PC 与手机各一把，勿泄露）`);
});
