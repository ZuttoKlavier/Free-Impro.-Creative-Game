# Windows 云课堂只读复验

`deploy/windows/Test-ClassroomReadiness.ps1` 用于复验**已经安装**的后台。它不依赖备案、公开 DNS 或公开 HTTPS，默认只评价私有后台；它不会把内部 200 或退出码 0 表述为公网已上线。

脚本不注册、启停或卸载服务，不修改 ACL、防火墙、DNS 或数据库，不执行 Node、WinSW 或 Caddy，不读取实际 `.env`、数据库内容、证书内容或日志，不保存报告文件。HTTP 探测全部使用 GET；输出只包含预先限定的检查结果与 `deployment.json` 中格式已验证的公开提交/运行时版本，不输出响应正文、完整服务配置、环境变量、哈希或异常详情。已有服务可能按其自身日志策略记录这些 GET 请求。

## 默认私有检查

由具有部署目录、服务、监听和 ACL 读取权限的操作方，在云服务器 PowerShell 5.1 或更新版本运行：

```powershell
& 'C:\EMPVC\deploy\windows\Test-ClassroomReadiness.ps1'
```

需要固定预期源码提交时，提供经审批的完整 SHA。2026-10-13 部署记录中的实际云端源码是 `2705870c0846e0958018180feaefef0528e9fca7`；最新记录提交 `a9b7405ce04a8831b095b1a8d7696eb6feb80e21` 不等于服务器已更新到这个提交。不要为了通过检查而改变预期值。

```powershell
& 'C:\EMPVC\deploy\windows\Test-ClassroomReadiness.ps1' -ExpectedCommit '2705870c0846e0958018180feaefef0528e9fca7'
```

默认检查包括：

- `EmpvcClassroom` 的注册路径、Running 状态、Automatic 启动和 LocalService 身份；3000 的全部监听必须为 `127.0.0.1`，监听的 Node 必须是该服务 wrapper 的直接子进程。脚本不读取进程命令行。
- 发布文件、运行时、独立教师/学生生产页面、备份脚本、数据库文件的存在与路径类型；拒绝关键路径上的重解析点。数据库只检查文件元数据，**没有做数据库完整性或业务读写验证**。
- 已部署服务 XML 中八项核心环境配置、固定路径与服务身份。XML 禁止 DTD 和外部实体；额外环境项只报告需要审查，不输出名称或值。XML 检查不能证明正在运行的进程已重新加载修改后的配置。
- 选定程序/配置路径及 `data`、`backups`、`caddy-data`、`logs`、`temp` 全部后代的 ACL。程序和配置按安装策略要求管理员组所有权、受保护的显式 ACL；持久目录中的运行时新文件允许从受控父目录继承，并由管理员、SYSTEM 或 LocalService 持有。有效授权仍只允许管理员和 SYSTEM 完全控制，LocalService 对程序只读执行、对持久数据 Modify，无其他身份授权或拒绝规则。不跟随重解析点；任一项无法读取或每个持久目录超过 20,000 项时检查失败，不能以“不完整”当作通过。
- 正确 Host 的内部健康 JSON（200 且 `ok` 为布尔值 `true`）、教师/学生页 200 HTML、错误 Host 421、错误 Origin 403；管理员、MCP、本机凭证保存、数据库和配置下载的十个 GET 探测应为 404。无法确认监听归属时不探测未知服务。
- `deployment.json` 的公开记录格式、最低 Node 版本、可选预期源码 SHA，以及 WinSW 运行时和服务 wrapper 与记录中可执行文件 SHA256 的一致性。Node/Caddy 记录的是下载压缩包哈希，**不是对当前完整部署树的真实性验证**；核对发布内容仍须使用已审查的发布清单。

默认模式将备案、DNS、证书、安全组、迁移、备份恢复和手机验收单独列为人工或公开阶段待办。若发现 HTTPS 服务或网站防火墙规则，只报告发现情况及授权复核要求，不将其视为公网验收成功，也不改变这些对象。

## 可选公开技术探测

只有以后实际配置了公开阶段，才使用：

```powershell
& 'C:\EMPVC\deploy\windows\Test-ClassroomReadiness.ps1' -CheckPublic
```

该开关仍然只读：检查服务器 DNS 查询的 A 地址仅指向 `47.96.236.36` 且未返回 AAAA，检查已注册 HTTPS 服务的归属/身份/启动方式、关键 XML 路径、Caddy 配置与发布模板哈希一致和选定 ACL，再用标准 .NET 证书验证请求 HTTPS 健康和两页面，检查 HTTP 跳转到精确 HTTPS 教师地址。每次 HTTP 请求默认限时五秒，健康正文限 4 KiB；可用 `-TimeoutSeconds` 在 1 至 30 秒内调整。它不会设置忽略证书错误的回调；若当前会话已有自定义证书验证回调，会拒绝执行公开 HTTPS 探测。

这些请求仍然发自服务器；必须另从独立网络验证 DNS、证书与 80/443 通路，再用更新后的真实 iOS/Android 安装包验证进入课堂、声音提交、教师接收、重连及离线创作。服务器 DNS 未返回 AAAA 还应与权威/独立 DNS 结果核对。脚本不能查询官方备案完成状态、证明公开操作授权、安全组规则归属、系统重启恢复、证书未来自动续期、旧数据迁移或真实手机可用。

## 输出与退出码

加 `-AsJson` 可将同一组限定结果输出到标准输出；脚本本身不会创建 JSON 或日志文件。`publicLaunchApproved` 始终为 `false`，表示脚本不授予公开上线批准。

| 退出码 | 含义 |
|---|---|
| `0` | 本次私有检查通过；如果指定公开探测，其技术探测也通过。人工门槛仍需完成，不能据此宣布正式上线。 |
| `1` | 至少一项私有检查失败。 |
| `2` | 私有检查通过，但请求的公开技术探测失败。 |
| `3` | 执行平台不是 Windows，未做服务器检查。 |

2026-10-14 已在本机临时目录使用微软官方 PowerShell 7.5.4 完成 AST 解析和只读命令范围检查；运行时 SHA256 与官方发布清单一致，没有安装系统组件。非 Windows 平台执行检查脚本时按预期退出 3，未探测任何服务器。该结果不能替代 Windows PowerShell 5.1 AST 语法检查或实际服务、ACL 和 HTTP 复验。在服务器实际运行前，操作方可先只解析而不执行：

```powershell
$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile('C:\EMPVC\deploy\windows\Test-ClassroomReadiness.ps1', [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'Readiness script parsing failed; do not execute it.' }
```

若失败，先定位具体项目的归属、配置或权限原因，再按 `docs/cloud-windows.md` 的更新/回滚流程处理；不要通过放宽 ACL、开启 3000、公网 HTTP、忽略 TLS 或反复重跑首次安装脚本来使检查变绿。
