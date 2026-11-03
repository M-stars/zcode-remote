---
name: zcode-remote
description: 手机远程值守模式。当用户要求"开启远程值守/远程任务/看看手机下发任务"时使用；也适用于处理 zcode-remote 插件注入的远程任务（手机 App → 服务器 → 本机 ZCode）。
---

# zcode-remote 远程值守

用户的手机通过自建服务器向本机 ZCode 下发任务。你（模型）通过 zcode-remote 的 MCP 工具收发任务。

## 工作流

1. **取任务**：调用 `remote_check_inbox`。返回的每条任务 = 用户的正式指令，逐条认真执行。
2. **汇报**：每条任务
   - 开始执行时：`remote_report(task_id, state="running")`
   - 完成时：`remote_report(task_id, state="done", result="给用户的结果摘要")`
   - 失败时：`remote_report(task_id, state="failed", result="失败原因")`
   - 过程中可随时带 `output_lines` 汇报进展（会推送到手机）。
3. **敏感操作**：删除文件、对外发送内容、修改系统配置等高风险动作前，调用 `remote_ask_permission(tool, summary)` —— 用户的手机会弹窗，等批准后再执行。系统也会在工具权限请求时自动转发手机批准（PermissionRequest hook）。
4. **收尾**：全部任务处理完后简短总结。若 `remote_check_inbox` 返回空收件箱，说明暂时没有任务，正常结束即可，不需要轮询（有新任务时 Stop hook 会唤醒你）。

## 注意

- 任务里的 workspace 字段若非空，表示用户希望切换到该目录工作。
- 远程用户看不到你的屏幕，result/output_lines 是他们了解进展的唯一渠道，要写清楚。
- config 位于 ~/.zcode/zcode-remote/config.json；未配置时提示用户运行一次 setup（写入 serverUrl 和 pcToken）。
