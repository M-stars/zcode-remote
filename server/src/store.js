// 数据持久化：tokens.json（双设备 token）+ tasks.json（任务队列）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(SERVER_ROOT, 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 首次启动生成 PC / 手机两把 token；之后固定复用
export function loadTokens() {
  ensureDataDir();
  if (fs.existsSync(TOKENS_FILE)) {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  }
  const tokens = {
    pcToken: crypto.randomBytes(24).toString('hex'),
    phoneToken: crypto.randomBytes(24).toString('hex'),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  return tokens;
}

export function loadTasks() {
  ensureDataDir();
  if (!fs.existsSync(TASKS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

const MAX_PERSISTED = 500;

export function saveTasks(tasks) {
  ensureDataDir();
  const tmp = TASKS_FILE + '.tmp';
  // 只持久化最近的任务，避免文件无限膨胀
  fs.writeFileSync(tmp, JSON.stringify(tasks.slice(0, MAX_PERSISTED), null, 2));
  fs.renameSync(tmp, TASKS_FILE);
}

export function newId() {
  return crypto.randomBytes(8).toString('hex');
}

export function persistDebounced(tasks) {
  clearTimeout(persistDebounced._t);
  persistDebounced._t = setTimeout(() => saveTasks(tasks), 300);
}
