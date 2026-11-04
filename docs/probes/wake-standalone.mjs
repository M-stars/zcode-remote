// 独立唤醒脚本：不依赖 ZCode 会话，直接用 computer-use 客户端给值守会话注入唤醒消息
// 供桥接进程 spawn 调用：node wake-standalone.mjs
const root =
  process.env.ZCODE_CUA_PLUGIN_ROOT ??
  process.env.ZCODE_PLUGIN_ROOT ??
  process.env.CLAUDE_PLUGIN_ROOT ??
  'C:\\Users\\13033\\.zcode\\cli\\plugins\\cache\\zcode-plugins-official\\computer-use\\0.6.5';
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const { setupComputerUseRuntime } = await import(
  pathToFileURL(join(root, "scripts", "computer-use-client.mjs")).href,
);
await setupComputerUseRuntime({ globals: globalThis });

const apps = await agent.computerUse.listApps({ emit: false });
const zcode = apps.find((a) => (a.name || "").toLowerCase().includes("zcode"));
if (!zcode) { console.log("NO_ZCODE"); process.exit(1); }

const app = await agent.computerUse.getApp({ pid: zcode.pid });
const els = await app.elements();
const composer = els.find((e) => e.editable && (e.title || "").includes("向 ZCode 提问"));
if (!composer) { console.log("NO_COMPOSER"); process.exit(1); }
await app.click(composer.index);
await app.typeText("请调用 remote_check_inbox 处理远程任务队列中的待办任务，完成后逐一汇报结果。");
await new Promise((r) => setTimeout(r, 800));
const els2 = await app.elements();
const send = els2.find((e) => (e.title || "") === "发送" && e.enabled);
if (!send) { console.log("SEND_NOT_ENABLED"); process.exit(1); }
await app.click(send.index);
console.log("WAKE_SENT");
process.exit(0);
