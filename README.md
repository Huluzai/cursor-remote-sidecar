# cursor-remote-sidecar

在 Mac 上用 `@cursor/sdk` 的 **local** runtime 跑 Agent，向 **Cursor Remote** iOS 客户端暴露与 Cloud Agents 近似的 HTTP/SSE 接口。  
**不需要 Git remote**，适合纯本地开发目录。

## 要求

- Node.js ≥ 22.13
- Cursor 账号（首次启动时在浏览器登录）
- Mac 与 iPhone 同一局域网，或都在 Tailscale 上

## 启动

```bash
npx github:Huluzai/cursor-remote-sidecar
```

首次运行会在浏览器打开 Cursor 登录页；登录成功后 sidecar 监听 `8787`，终端会打印 **配对二维码**、本机 IP 与 **6 位配对码**。之后再次启动会直接使用本机已保存的登录状态（`~/.cursor/sdk/auth.json`）。

可选环境变量：

```bash
export SIDECAR_CWD=/path/to/your/local/project   # 可选；不设则默认为用户主目录
export SIDECAR_PORT=8787
export SIDECAR_MODEL=composer-2.5
# export SIDECAR_RECYCLE_MS=3000000              # 主动回收间隔，默认 50 分钟
```

配对码默认保存在 `~/.cursor-remote-sidecar/pairing-token`，进程回收后 iOS 不用重填。

## 开发

```bash
git clone https://github.com/Huluzai/cursor-remote-sidecar.git
cd cursor-remote-sidecar
npm install
npm start
```

`npm run dev` 用 tsx 热重载源码。`npm run start:once` 只跑一轮子进程（不监督重启）。

### 开发者选项

贡献者可在本机设置 `CURSOR_API_KEY` 跳过浏览器登录（**不要**写进用户文档）。

## 进程回收（SDK token）

`@cursor/sdk` 会把凭证换成约 1 小时的短期 token 缓存在 **当前 Node 进程**里；过期后会出现  
`Authentication error / try logging out and back in`，**只有重启 Node 才恢复**。

| 组件 | 行为 |
|------|------|
| sidecar | 定时（默认 50min）或检测到上述鉴权文案后，等当前 run 结束，`exit 75` |
| `scripts/supervise.mjs` | 收到 exit 75 / 异常退出后自动重新 `spawn` 子进程 |
| 配对码文件 | 默认持久化，回收后 iOS 配对码不变 |

会话会写入 `~/.cursor-remote-sidecar/sessions.json`，新进程启动时 `Agent.resume` 恢复 **ACTIVE** 会话；**ARCHIVED** 会话仅恢复 transcript 数据（只读，不 resume SDK Agent）。

## iOS 配对

1. 打开 App → 选择 **Path C · 本机 Sidecar**
2. 点 **扫描二维码**，对准 Mac 终端 sidecar 打印的 QR；或手动填入 IP / 端口 / 配对码
3. 连接成功后即可新建会话
4. 「新建」里可填 Mac 上的绝对路径 cwd（留空则用用户主目录，或 `SIDECAR_CWD` 若已设置）

## API（摘要）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 无鉴权 |
| GET | `/v1/me` | 校验配对码 |
| GET | `/v1/folders` | 列目录；无 `path` 时为默认 cwd（主目录或 `SIDECAR_CWD`）；`path=~` / `home` 跳到主目录 |
| GET/POST | `/v1/agents` | 列表 / 创建本地 Agent（`?includeArchived=true` 含归档） |
| POST | `/v1/agents/:id/archive` | 归档会话（释放 SDK Agent，历史保留只读） |
| POST | `/v1/agents/:id/runs` | 追问 |
| GET | `/v1/agents/:id/runs/:runId/stream` | SSE |
| GET | `/v1/agents/:id/transcript` | 会话转写（sidecar events 真源） |
| GET | `/v1/agents/:id/artifacts` | Agent 产物列表 |
| PUT | `/v1/agents/:id/queue` | 待发队列（run 结束后 sidecar 自动 drain） |
| POST | `/v1/agents/:id/runs/:runId/cancel` | 取消 |

鉴权：`Authorization: Bearer <token>`

## 安全

- 默认监听 `0.0.0.0`，依赖配对码；公网不要裸暴露
- 生产建议：仅绑 Tailscale IP，或前面加 TLS / SSH 隧道
- 不要把配对码或 Cursor 凭证提交进 git
