// 往指定 Desktop 会话注入一条 sendText/startNow 消息（官方 session_input 队列机制）
// 用法: node inject-test.mjs [sessionId] [text]
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

const sid = process.argv[2] || 'sess_01621db1-2bb1-477f-b1cd-254efb03ea4b';
const text = process.argv[3] || '[远程注入测试] 如果你能看到这条消息，请只回复四个字：注入成功';

const db = new DatabaseSync('C:/Users/13033/.zcode/cli/db/db.sqlite');
const maxSeq = db.prepare('SELECT COALESCE(MAX(admitted_sequence),0) m FROM session_input WHERE session_id=?').get(sid).m;
const id = crypto.randomUUID();
const payload = JSON.stringify({ text, requestedDelivery: 'startNow' });
db.prepare(
  `INSERT INTO session_input (id,session_id,kind,delivery,payload,admitted_sequence,status,time_created,time_updated)
   VALUES (?,?,'sendText','startNow',?,?,'admitted',?,?)`
).run(id, sid, payload, maxSeq + 1, Date.now(), Date.now());
console.log('已注入:', id, 'seq=', maxSeq + 1, '→', sid);
db.close();
