# zcode-remote

手机远程向 PC 上的 ZCode 客户端布置任务：**Android App → 自建服务器 → ZCode 插件**。

```
┌─ 手机 Android App ──┐        ┌─ 自建服务器（VPS）──┐        ┌─ PC：ZCode Desktop ─────────┐
│ 发任务 / 看进度     │ HTTPS/ │  REST + WebSocket   │ WSS/   │ 插件（一个插件三合一）：      │
│ 批准敏感操作 / 收推送│ ←────→ │  任务队列 / 设备认证 │ ←────→ │  · MCP server = 桥接进程     │
└────────────────────┘  WSS   └────────────────────┘ 长轮询  │  · Hooks = 任务注入+远程批准 │
                                                            │  · ZCode 模型 → 操作电脑     │
                                                            └─────────────────────────────┘
```

PC 端始终主动外连服务器（无需公网 IP / 端口映射）；手机只与服务器通信。

## 组件

| 目录 | 说明 |
|---|---|
| `server/`   | Node.js 中转服务器（REST + WS + JSON 持久化 + 双 token 认证），零依赖仅 `ws` |
| `plugin/`   | ZCode 插件（本地市场目录：`plugin/marketplace.json`） |
| `android/`  | 原生 Kotlin + Compose App |
| `docs/`     | 可行性分析 |

## 快速开始

### 1. 启动服务器（本机或 VPS）

```bash
cd server && npm install && npm start
# 首次启动生成 server/data/tokens.json：pcToken 给插件，phoneToken 给手机
# 端口默认 8787，可用 PORT=xxx 覆盖
```

### 2. 安装 ZCode 插件（PC 端）

1. 打开 ZCode 客户端 → **Plugin Marketplace → Add → Add Plugin Marketplace**，粘贴本仓库 `plugin/` 目录路径
2. **Personal → zcode-remote-dev → ZCode Remote → Install**
3. 生成插件配置 `~/.zcode/zcode-remote/config.json`：

```json
{ "serverUrl": "http://<服务器地址>:8787", "pcToken": "<pcToken>" }
```

4. 在会话里说「开启远程值守」或直接下发任务（Stop hook 会自动唤醒处理）

### 3. 手机 App

- 填服务器地址 + phoneToken，保存连接
- 底部输入框下发任务，列表实时看状态/结果/执行输出
- 敏感操作会在手机上弹「远程批准」对话框

## 协议要点

- 任务：`POST /tasks {text, workspace?}` → 状态机 `queued → running → done|failed`
- WS：PC 收 `task.new`，回 `task.accept/status/output/done`；权限请求 `perm.request` → 手机 `POST /perm/:id {allow}`
- 认证：`Authorization: Bearer <token>`（REST）或 `?token=`（WS）

## 开发状态

- [x] 可行性分析
- [x] M1 中转服务器（冒烟通过）
- [x] M2 ZCode 插件（MCP 桥 + Hooks，组件级验证通过）
- [x] M3 Android App
- [ ] 端到端联调 + 插件安装试用

## 安全说明

- 任务注入 ≈ 任意代码执行：双 token 绑定设备，敏感操作默认需手机批准（远程值守窗口期 30 分钟内生效）
- `server/data/`、`~/.zcode/zcode-remote/`、`android/local.properties` 均已 gitignore，勿提交
- 公网部署务必上 HTTPS（反向代理 + 证书）；服务器能看到任务明文，端到端加密为二期规划

## 开发环境（本项目自带工具链，均在 `.tools/` 内，已 gitignore）

- Android SDK：`.tools/android-sdk`（sdkmanager 安装，licenses 已接受）
- Gradle：`.tools/gradle/gradle-8.10.2`（华为镜像下载）
- 构建命令：

```bash
cd android
JAVA_HOME=D:/JAVA GRADLE_USER_HOME=D:/zcode-remote/.tools/gradle-home \
  ../.tools/gradle/gradle-8.10.2/bin/gradle :app:assembleDebug
# 模拟器：../.tools/android-sdk/emulator/emulator.exe -avd medium_phone
# 安装：../.tools/android-sdk/platform-tools/adb.exe install -r app/build/outputs/apk/debug/app-debug.apk
```
