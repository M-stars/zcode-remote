// 注入实验2：完整 intent 结构复刻（对比 inject-test.mjs 的瘦 payload）
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

const sid = 'sess_01621db1-2bb1-477f-b1cd-254efb03ea4b';
const text = '[远程注入测试-完整结构] 如果收到，请只回复：注入成功';

const db = new DatabaseSync('C:/Users/13033/.zcode/cli/db/db.sqlite');
const maxSeq = db.prepare('SELECT COALESCE(MAX(admitted_sequence),0) m FROM session_input WHERE session_id=?').get(sid).m;
const now = Date.now();
const cmdId = crypto.randomUUID();
const queueItemId = 'queue_' + cmdId;
const clientId = 'client-zcode-remote-bridge';

const payload = JSON.stringify({
  text,
  intent: {
    sourceCommandId: cmdId,
    queueItemId,
    clientId,
    kind: 'sendText',
    admissionSeq: maxSeq + 1,
    admittedAt: now,
    requestedDelivery: 'startNow',
    admittedDelivery: 'startNow',
    attachmentRefs: [],
    genUiContext: [],
  },
  conversationInputIntent: {
    inputOrigin: 'desktop',
    sourceCommandId: cmdId,
    queueItemId,
    clientId,
  },
  attachments: [],
  sourceCommandType: 'sendText',
});

db.prepare(
  `INSERT INTO session_input (id,session_id,kind,delivery,payload,admitted_sequence,status,time_created,time_updated)
   VALUES (?,?,'sendText','startNow',?,?,'admitted',?,?)`
).run(queueItemId, sid, payload, maxSeq + 1, now, now);
console.log('已注入(完整结构):', queueItemId, 'seq=', maxSeq + 1);
db.close();
