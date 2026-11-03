// Stop hook：会话即将空闲时，若队列里还有未取的远程任务，请求继续以处理它们
import { loadQueue, pendingTasks } from '../lib.js';

function main() {
  const pending = pendingTasks(loadQueue());
  if (!pending.length) return;
  const lines = pending.map((t) => `- [${t.id}] ${t.text}`);
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        `用户手机下发了 ${pending.length} 条远程任务，请继续处理：调用 zcode-remote 的 remote_check_inbox 取出任务并逐条执行，` +
        '开始时 remote_report(state=running)，结束时 remote_report(state=done/failed)。任务列表:\n' +
        lines.join('\n'),
    })
  );
}

try {
  main();
} catch {
  /* 静默失败 */
}
