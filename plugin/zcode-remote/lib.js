// 插件各组件（MCP server / hooks）共用的本地状态读写
// 目录：~/.zcode/zcode-remote/  config.json  queue.json  bridge.json
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const DIR = path.join(os.homedir(), '.zcode', 'zcode-remote');
export const CONFIG_FILE = path.join(DIR, 'config.json');
export const QUEUE_FILE = path.join(DIR, 'queue.json');
export const BRIDGE_FILE = path.join(DIR, 'bridge.json');

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function loadConfig() {
  return readJson(CONFIG_FILE, null); // { serverUrl, pcToken }
}

// queue.json: [{ id, text, workspace, enqueuedAt, fetched }]
export function loadQueue() {
  return readJson(QUEUE_FILE, []);
}

export function saveQueue(queue) {
  // 只保留最近 100 条已取任务，未取的永远保留
  const unfetched = queue.filter((t) => !t.fetched);
  const fetched = queue.filter((t) => t.fetched).slice(-100);
  writeJson(QUEUE_FILE, [...unfetched, ...fetched]);
}

export function pendingTasks(queue) {
  return queue.filter((t) => !t.fetched);
}
