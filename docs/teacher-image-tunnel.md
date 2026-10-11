# 教师生图工具的本机连接

更新：2026-10-11。

本机桥接程序使用官方 MCP SDK，供 OpenAI 官方安全隧道客户端运行。它只开放当前教师的图片申请、材料、学生对话绑定与结果回传，不开放课堂其他管理操作或任意文件读写。无需公开课堂端口，也无需绕过浏览器的局域网证书警告。

## 已实现与接通判据

- 教师的“内部设置”打开时，每五秒获取申请与连接状态。页面隐藏或对话框关闭时不再周期请求；恢复可见后刷新。刷新保留正在填写的学生对话地址和核对状态。
- 连接状态区分未配置、等待首次工具调用、最近互通、近期无调用和凭证过期。创建凭证或完成 MCP 握手不会显示互通；只有通过权限验证的实际工具调用才记录活动。
- “最近互通”仅说明两分钟内调用过图片工具，不证明调用者是 ChatGPT、图像模型已经可用或无人值守处理已启动。
- 撤销、轮换或过期的凭证无法在既有 stdio 会话中继续调用。断开工具保留学生申请、额度、对话绑定和图片结果。
- 教师与桥接进程共享同一个 SQLite 数据库；双方使用 WAL 和写锁等待，结果继续由学生端自动接收、保存在本地。

## 先保存教师的专用凭证

在真实教师账号的“内部设置 → MCP 连接设置”创建并复制图片连接令牌。在项目目录运行：

```sh
npm run mcp:images:configure
npm run mcp:images:check
```

配置程序要求交互终端，输入不回显；先检查教师权限，再替换本机凭证文件。默认文件是 `data/image-mcp/teacher.token`，macOS/Linux 权限为 600。Windows 部署需管理员将目录与文件 ACL 限制到运行桥接程序的账号。该目录已被 Git 忽略。

可在本机 `.env` 配置 `FREE_IMPRO_DB` 和 `FREE_IMPRO_IMAGE_TOKEN_FILE`，相对路径始终按项目目录解析。桥接程序不会创建一个空的课堂数据库来假装已连接。凭证有效期 24 小时，轮换后重新保存并重启桥接进程；不要把令牌放在命令行参数、聊天或 Git 中。

## 创建并运行官方安全隧道

按 [OpenAI 官方隧道指南](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) 在 [Platform 隧道设置](https://platform.openai.com/settings/organization/tunnels) 创建隧道，关联当前个人 Platform 组织和目标 ChatGPT 工作区。此步骤需要组织级 Tunnels Read + Manage；运行与选择隧道需要 Read + Use。

隧道还需要一个 Platform runtime API key。它用来认证隧道传输，不能用 Plus 网页会话替代。这里不调用计费图像生成 API，也不把 `OPENAI_API_KEY` 交给学生端；如平台要求新增付费项目或接受协议，应由账户所有者决定。

使用 [官方最新发布](https://github.com/openai/tunnel-client/releases/latest)，验证下载文件的校验值。本机已下载 v0.0.16 的 macOS arm64 客户端，并核对 GitHub asset digest 与 SHA256SUMS；这是 2026-10-11 的本地验证记录，不是其他机器的固定版本要求。客户端位于本机忽略目录 `data/tools/tunnel-client/v0.0.16/`，未上传 Git。

将 runtime key 保存为仅本人可读的本机文件，在初始化中使用 `file:/绝对路径` 引用。以下命令中的隧道 ID、Node 路径、项目路径和密钥文件都必须替换为本机真实值：

```sh
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile ev-teacher-images \
  --profile-dir /绝对路径/EMPVC/data/image-mcp/profiles \
  --tunnel-id tunnel_实际ID \
  --control-plane-api-key-ref file:/绝对路径/runtime-key \
  --health-listen-addr 127.0.0.1:0 \
  --mcp-command "/绝对路径/node /绝对路径/EMPVC/scripts/image-mcp.js"

tunnel-client doctor --profile ev-teacher-images --profile-dir /绝对路径/EMPVC/data/image-mcp/profiles --explain
tunnel-client run --profile ev-teacher-images --profile-dir /绝对路径/EMPVC/data/image-mcp/profiles
```

示例适用于路径不含空格的 macOS/Linux；其他路径与 Windows 应按官方客户端的配置说明提供命令及参数。health 只绑定回环地址，并使用随机端口，避免占用课堂证书设置服务的 8080 端口。stdio 必须直接启动 Node 脚本，不经 `npm run`，以免 npm 提示污染 MCP 标准输出。不要使用包内 cloudflared 来公开课堂服务。

保持运行进程健康且 ready，再在 ChatGPT 插件页添加自定义 MCP 服务器，名称可设为“EV 教师生图互联”，连接类型选“隧道”，填写真实 ID。此专用 stdio 桥接已经在本机验证教师令牌，ChatGPT 侧无额外 OAuth；隧道必须仅关联获授权的个人组织/工作区，不向其他用户共享。由账号所有者审核访问范围并完成插件授权。

如果后续配置长期后台运行，使用官方 `runtimes connect/status` 的管理方式，先核对 runtime 的 process_running、healthy 和 ready；未配置时不登记为自动启动，不用 nohup/disown 假装后台已就绪。

## 验证真实双向连接

1. 在 ChatGPT 选择已授权的教师插件，调用 `get_image_connection_status`。它应返回 EV 项目、此教师的待处理数量和凭证到期时间，且教师页面更新为“图片工具最近已互通”。
2. 用一个实际测试学生提交申请，工具列表只能显示该教师课堂的申请。读取材料之前领取并保存 claimId；重复领取是恢复信息，不能再次生图。
3. 首次在 EV生图储存库 内建立并核实学生专属对话，再绑定实际地址；以后继续同一对话。工具本身不会创建网页对话。
4. 用 Plus 网页聊天实际生成图片，再回传规范的 PNG，确认学生自动保存。工具连通测试使用的合成图片不计作真实生成验收。

普通 Chat 的 MCP 接入不等于有一个后台程序自动监听学生申请、在指定对话生成并下载图片。页面 WebMCP 用于 Work/Codex 的当前浏览器页面，不能自行连接普通 Chat。MCP 事件自动唤醒还受 [官方事件能力](https://developers.openai.com/plugins/build/mcp-events) 限制；不得未经用户确认改变为 Work 模式或图像 API。

## 本轮结果

88 项 Node 单元/接口测试、2 项 Chrome 生图浏览器测试及生产网页构建通过。真实临时 HTTP 与 stdio MCP 客户端验证了六个工具、申请领取、材料读取、对话绑定、合成图片回传、权限隔离、连接记录、令牌轮换/过期与会话内撤销。浏览器验证了自动接收、输入保留、工具状态更新及登录失效后的材料清理。

本机当前尚无真实教师桥接凭证、Platform 隧道 ID 或 runtime key。没有创建远端隧道、完成 ChatGPT 插件授权或启动无人值守生图。Platform 的首次自动登录返回认证错误，需账户所有者恢复登录后继续配置；不得以本地测试通过代替真实接通。
