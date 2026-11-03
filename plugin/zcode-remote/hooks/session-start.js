// SessionStart hook：有未取的远程任务时，向会话注入提示
import { loadQueue, pendingTasks } from '../lib.js';

function main() {
  const pending = pendingTasks(loadQueue());
  if (!pending.length) return; // 无任务：输出空，正常通过
  const lines = pending.map((t) => `- [${t.id}] ${t.text}`);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          `有 ${pending.length} 条来自用户手机的远程任务待处理。请立即调用 zcode-remote 的 remote_check_inbox 工具取出并逐条执行，` +
          '每条任务开始时 remote_report(state=running)，结束时 remote_report(state=done/failed)。:\n' +
          lines.join('\n'),
      },
    })
  );
}

try {
  main();
} catch {
  /* 静默失败，不阻塞会话 */
}
