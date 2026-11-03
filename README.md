# zcode-remote

手机远程向 PC 上的 ZCode 客户端布置任务：**Android App → 自建服务器 → ZCode 插件**。

## 架构

```
┌─ 手机 Android App ──┐        ┌─ 自建服务器（VPS）──┐        ┌─ PC：ZCode Desktop ─────────┐
│ 发任务 / 看进度     │ HTTPS/ │  REST + WebSocket   │ WSS/   │ 插件（一个插件三合一）：      │
│ 批准敏感操作 / 收推送│ ←────→ │  任务队列 / 设备认证 │ ←────→ │  · MCP server = 桥接进程     │
└────────────────────┘  WSS   └────────────────────┘ 长轮询  │  · Hooks = 任务注入+远程批准 │
                                                            │  · ZCode 模型 → 操作电脑     │
                                                            └─────────────────────────────┘
```

- PC 端始终主动外连服务器（无需公网 IP / 端口映射）
- 手机只与服务器通信

## 目录结构

| 目录 | 说明 |
|---|---|
| `server/`   | Node.js 中转服务器（REST + WS + 存储 + 双 token 认证） |
| `plugin/`   | ZCode 插件（MCP 桥接进程 + Hooks 任务注入） |
| `android/`  | 原生 Kotlin + Compose App |
| `docs/`     | 可行性分析与设计文档 |

## 开发状态

- [x] 可行性分析（docs/可行性分析-手机远程控制ZCode.md）
- [ ] M1 中转服务器
- [ ] M2 ZCode 插件
- [ ] M3 Android App
- [ ] 端到端联调

## 安全说明

- 任务注入 ≈ 任意代码执行：设备通过双 token 绑定，敏感操作默认需手机端批准
- `tokens.json` 等机密文件已在 `.gitignore` 中排除，请勿提交
