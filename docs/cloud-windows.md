# Windows 云课堂部署

目标服务器是用户已开通的阿里云杭州 Windows Server 2022，公网 IPv4 为 `47.96.236.36`。课堂计划使用 `class.empfreeimpro.xyz`，现有万小智官网继续使用原地址。2026-10-13 已完成云服务器内部后台的实际安装、构建和独立验证；DNS、公开 HTTPS 和真实手机课堂连接尚未启用。域名未备案，因此内部安装成功不表示公网课堂已经上线。

首次只读前检确认服务器为 Windows Server 2022、PowerShell 5.1；当时没有 Node.js、`C:\EMPVC`、EMPVC 服务或 80/443/3000 监听。后续私有安装使用固定源码提交 `2705870c0846e0958018180feaefef0528e9fca7`，安装任务 `t-hz06zv0yvb961hc` 成功退出（退出码 0），完整依赖安装和 Vite 生产构建均成功。

分阶段的三个脚本通过服务器 PowerShell 5.1 的 AST 语法检查（任务 `t-hz06zv0j6idoni8`，退出码 0）。Bootstrap 随后将校验清单改为保存后按文本读取；最终脚本在安装前重新解析并核对 SHA256，也通过验证。服务器能正常访问 GitHub codeload、官方发布包、Node.js 和 npm；GitHub 原始文件地址连接被重置，最终采用云助手传入经过哈希核验的脚本，没有关闭证书验证或使用非官方镜像。

独立部署验证任务 `t-hz06zv1lw1mf37k` 成功退出，确认：

- `EmpvcClassroom` 持续运行、自动启动，使用 `NT AUTHORITY\LocalService`，只监听 `127.0.0.1:3000`。
- 正确域名 Host 下，健康接口、学生首页和教师页面均返回 200。
- 管理员页面/API、MCP 和本机凭证保存接口返回 404；错误 Host 返回 421。
- 未注册 `EmpvcHttps`，未新增 EMPVC 的 80/443 入站防火墙规则。
- 运行时为 Node.js 24.21.0、Caddy 2.11.7、WinSW 2.12.0；部署记录的源码提交正确，新课堂数据库已初始化。

现有 Mac 课堂数据库已在本机 `data/cloud-migration` 创建一致性备份并通过完整性检查，未上传到服务器或 GitHub。账号、照片和录音的迁移仍需要明确授权，不能将新建的空数据库视作旧课堂数据已迁移。

## 部署前确认

杭州是中国大陆地域。2026-10-13 已在阿里云备案控制台核验：账号首页显示尚无备案信息；“查询已备案域名”对 `empfreeimpro.xyz` 返回 **未备案**。因此目前只准备、安装和验证私有后台，不开放公网网页，不启动公开 HTTPS，不创建网站入站防火墙规则。完成备案后，再核对实际业务和接入要求并确认开放操作；购买域名或已有万小智网站不表示该域名已备案。

后续公开部署的 DNS 方案只添加一条记录：主机记录 `class`，类型 `A`，值 `47.96.236.36`。当前该域名的解析记录为零，尚未添加。保留将来官网根域名、`www`、邮箱 MX/TXT 和其他用途的记录。不需要修改手机或教师电脑的 IP。不要为该课堂主机配置尚未可用的 AAAA 地址；若届时已有 `class` 的冲突记录，先核对用途，不直接覆盖。

目前不新增网站安全组规则。备案和开放操作确认后，才在阿里云安全组放行网站所需 TCP 80、443。应用的 3000 端口始终仅监听本机，不开放公网。管理通道继续沿用已有的云助手或受限管理规则，脚本不会启用 SSH、调整 RDP 或放宽管理端口。Caddy 申请和续期证书需要正常 DNS、准确系统时间和到公开证书服务的出站 HTTPS；80 用于证书验证及跳转，443 用于课堂访问。

## 文件布局与运行时

把经过验证的发布文件上传并解压到 `C:\EMPVC`。上传前排除本机 `.env`、课堂私钥、MCP 令牌、隧道 runtime-key、API key、个人截图、设备缓存和 Git 元数据。未经备份和迁移确认，不复制正在使用的 SQLite 文件。

使用预构建发布包时，准备以下结构；Windows x64 运行时从各项目官方渠道取得并核对版本、来源与校验和，私有安装脚本本身不下载它们：

```text
C:\EMPVC\
  package.json
  package-lock.json
  server\cloud.js                 以及它引用的其他 server 文件
  scripts\cloud-backup.js          用于后续备份
  dist\index.html                 已构建的学生网页
  dist\teacher.html               已构建的教师网页
  dist\assets\...
  deploy\windows\Install-Classroom.ps1
  deploy\windows\Enable-ClassroomHttps.ps1
  deploy\windows\EmpvcClassroom.xml
  deploy\windows\EmpvcHttps.xml
  deploy\windows\Caddyfile.windows
  runtime\node\node.exe           Node.js >= 24.15.0，保留同目录 npm.cmd/npm 文件
  runtime\caddy\caddy.exe          官方 Caddy Windows x64
  runtime\winsw\WinSW-x64.exe      官方 WinSW 2.x，不使用 3.x XML 格式
```

另一种准备方式是经过审查的 `Bootstrap-Classroom.ps1`：指定完整不可变 GitHub 提交 SHA 和已核验的 WinSW SHA256，从官方来源下载源码及运行时，在全新的随机 `Stage\release` 目录中核验 Node SHA256、Caddy SHA512、WinSW SHA256，执行锁定依赖且忽略安装钩子的 `npm ci --ignore-scripts`，再运行已审查项目的 Vite 构建命令。**禁止以管理员身份执行第三方依赖的安装钩子。** 下载、校验、依赖准备和构建全部成功才把 release 移到 `C:\EMPVC`，随后调用只启动本机后台的私有安装阶段。固定复制清单含 `public`、`server`、`scripts` 和管理员数据库工具的 `requirements`，不复制本机秘密或历史数据库；下载失败不自动重用旧目录。发布记录写入 `deployment.json`，便于核对版本和哈希。此过程只准备公开运行时与源代码，不迁移现有学生数据库。

已核验的官方 WinSW 2.12.0 Windows x64 SHA256 为：

```text
05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da
```

该值用于 `Bootstrap-Classroom.ps1` 的 `-WinSwSha256` 参数；不可把下载后未经比对的自算值当作预期值。Node 与 Caddy 的官方校验值及具体版本由该次准备记录保留，不因换源码提交就重复下载已确认完成的运行时。

构建必须在完整开发依赖仍存在的准备阶段完成，不能用 `npm ci --omit=dev` 安装后的运行环境直接运行依赖 Vite 的构建。私有安装阶段再执行 `npm ci --omit=dev --ignore-scripts`，仅保留锁定的运行依赖。不配置 OpenAI API key，也不启用付费图像生成 API。Plus 网页生图互联需要单独迁移与授权，云部署不会自动连接现有教师电脑的私人隧道。管理员业务控制台随 Node 程序部署；可选高级数据库浏览仍需单独准备 Python 环境和安装依赖，不因复制其源文件就自动启用。

## 第一阶段：只安装私有后台

在服务器的管理员 PowerShell 或以管理员权限执行的阿里云云助手 PowerShell 任务中运行：

```powershell
& 'C:\EMPVC\deploy\windows\Install-Classroom.ps1' -ClassroomDomain 'class.empfreeimpro.xyz'
```

脚本只接受这个已确定的课堂域名。它检查发布文件、Node 与 WinSW、3000 端口冲突以及同名服务，准备目录、安装运行依赖，并只注册、启动 `EmpvcClassroom`。该服务随系统启动，失败后等待十秒重启。Node 使用 `server/cloud.js`，显式配置未来公开来源、`127.0.0.1:3000`、`dist` 和 `data\classroom.sqlite`，不会读取本机开发 `.env`。即使尚未配置 DNS，本机仍可发送正确的域名 Host 进行健康检查。此阶段不注册或启动 `EmpvcHttps`，不创建任何入站防火墙规则，不申请公开证书，也不提供可供真实手机联网的公网入口。

服务使用免密码的内置 `NT AUTHORITY\LocalService`，而非管理员或 LocalSystem。安装会重设整个 `C:\EMPVC` 的文件权限：管理员及 SYSTEM 可管理；LocalService 对程序、配置和发布页面只有读取执行权限，对 `data`、`backups`、`caddy-data`、`logs`、`temp` 才有修改权限，普通 Users/Everyone 不获访问权限。此目录应只包含本项目部署文件。后续启用的 HTTPS 服务也采用 LocalService，这不是两服务之间的强隔离；同机其他 LocalService 程序也可能具有相同权限，需要更强隔离时另行配置服务 SID 或专用账户，不能随意把权限改成 Everyone。

脚本不覆盖已有数据库或证书内容。SQLite 会在首次启动时初始化、按已有程序逻辑补齐表结构；已有数据库上线前仍需备份。未来 ACME 证书和账户状态固定保存在 `C:\EMPVC\caddy-data`，不要把此目录当临时文件清理。

## 第二阶段：备案后单独启用公开 HTTPS

**现在不要执行此阶段。** 管理员需要先验证域名备案已完成，配置正确的 A 记录，并获得开放公开服务的明确确认。两个开关只是操作方对已完成事项的确认，不会办理备案，也不会替代官方备案查询。满足条件后，在管理员 PowerShell 执行：

```powershell
& 'C:\EMPVC\deploy\windows\Enable-ClassroomHttps.ps1' -ClassroomDomain 'class.empfreeimpro.xyz' -ConfirmIcpCompleted -ConfirmPublicExposure
```

不传两个确认开关时，脚本立即退出，不变更目录、服务或防火墙。启用时检查已有后台服务属于本部署、使用 LocalService 且运行正常；域名 A 记录只指向 `47.96.236.36`，80/443 未被占用；运行时及配置正常。通过本机域名 Host 健康检查和 Caddy 配置检查后，才注册 `EmpvcHttps`、为 Caddy 程序新增 TCP 80/443 入站规则并启动。阿里云安全组规则需在同一授权阶段单独配置，不由脚本操作。两个脚本都不会重启或覆盖已有同名服务，也不会改 SSH/RDP。

Caddy 的管理接口关闭，公开请求全部交给 Node 的有限页面/API 路由，不提供目录浏览或数据库下载。自动证书签发和续期所用状态持久保存在受保护目录中。首次启用还需验证证书和真实手机，不能只看到服务启动就宣布公开部署完成。

## 验证与排错

私有阶段只应看到后台服务，HTTPS 服务尚不存在：

```powershell
Get-Service -Name EmpvcClassroom
```

第二阶段真正启用后，再查看两服务：

```powershell
Get-Service -Name EmpvcClassroom,EmpvcHttps
```

后台日志在 `C:\EMPVC\logs\app`，第二阶段的 HTTPS 日志在 `C:\EMPVC\logs\https`，按大小轮换。不要添加 `caddy --environ`，不要输出所有环境变量、令牌或学生个人信息到云助手日志。私有安装消息只说明后台本机健康检查通过；公开启用消息也只说明启动请求通过，证书可能仍在签发，不能据此认定手机可用。

备案完成、公开阶段启用且 DNS 生效后，才从服务器之外验证以下入口，必须正常验证证书，不能忽略证书错误：

```text
https://class.empfreeimpro.xyz/api/health
https://class.empfreeimpro.xyz/teacher.html
http://class.empfreeimpro.xyz/teacher.html   应跳转到 HTTPS
```

随后用教师账号建立课堂，再用更新后的真实学生安装包连接 `https://class.empfreeimpro.xyz/`，验证进入、提交声音、教师接收和再次连接。iOS/Android 旧安装包可能仍只信任内置 LAN CA，域名 HTTPS 上线并不自动更新这些包。iOS 策略会规范化主机名大小写及默认 `:443`，确保原生请求的 Origin 与服务端一致；此行为已通过实际 Swift 编译测试，尚未发布新手机安装包。确认手机断网时仍可录音、保存和编创，加入课堂才联网。

证书失败先检查 DNS、备案/平台拦截情况、安全组和本机防火墙、80/443 占用、时间及 Caddy 错误日志。3000 不应添加公网规则。不能通过忽略 TLS 校验、换成 HTTP 或开放全部端口来掩盖失败。

首次安装和公开启用脚本遇到已有服务会明确退出，不停止其他服务也不自动覆盖运行中的安装。私有安装失败可能留下后台服务；公开启用失败可能留下 HTTPS 服务或其防火墙规则。先检查服务状态和日志，再由管理员使用同目录 wrapper 停止、卸载对应服务，确认归属后处理其专用规则，最后重新执行。不要盲目连续重跑脚本，也不要删除 `data` 或 `caddy-data`。

## 更新、备份与账号迁移

更新前保留旧发布文件，使用 `scripts/cloud-backup.js` 生成一致的 SQLite 备份，不直接复制正在运行的 `.sqlite` 来代替在线备份，也不要只复制主文件而遗漏 WAL 中的变化。手动验证备份：

```powershell
$env:FREE_IMPRO_DB = 'C:\EMPVC\data\classroom.sqlite'
$env:BACKUP_DIRECTORY = 'C:\EMPVC\backups'
& 'C:\EMPVC\runtime\node\node.exe' 'C:\EMPVC\scripts\cloud-backup.js'
```

可在 Windows 任务计划程序添加每日调用，使用 LocalService 或具有明确数据库读取、备份写入权限的受限身份。操作程序填写 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`，参数填写以下完整文本：

```text
-NoProfile -NonInteractive -Command "$env:FREE_IMPRO_DB='C:\EMPVC\data\classroom.sqlite';$env:BACKUP_DIRECTORY='C:\EMPVC\backups';& 'C:\EMPVC\runtime\node\node.exe' 'C:\EMPVC\scripts\cloud-backup.js';exit $LASTEXITCODE"
```

此安装脚本不创建计划任务。验证任务的实际退出结果和备份文件，再做一次隔离数据库的恢复检查。另行保留受保护的离机备份和 `caddy-data`，备份里可能包含学生照片和声音，不公开上传。

更新由管理员执行：先确认已有服务的可执行路径属于 `C:\EMPVC\services`；如果已经获准启用 HTTPS，先停止 HTTPS，再停止课堂；保留数据库、备份及 ACME 状态，更新程序和 `dist`、安装锁定的运行依赖，核对新文件 ACL，再启动课堂并重新通过域名 Host 健康检查；仅当公开阶段原本已获准且已启用，才重新启动 HTTPS。默认禁止重复安装，因此更新不以重跑首次安装脚本代替。需要改变服务 XML 注册属性时，按 WinSW 2.x 文档处理，不直接对 Node 使用 `sc create`。

从 LAN 地址换到公开域名后，浏览器和原生应用的旧 cookie 不会自动随域名迁移。现有学生只凭姓名和课堂码重新连接，可能得到新的内部账号；**不能按姓名自动合并重名学生**。固定角色、注册资格和课堂历史必须采用经验证的身份迁移流程。教师账号只有迁移了相应数据库才能继续使用原账号。iOS 本地声音来源应保持原 `localOrigin`；Android 当前网页来源变化会切换本地存储，需在旧地址备份后导入新地址。切换地址前不要卸载应用或清空数据。

## 官方参考

- [Caddy Windows WinSW 安装方式](https://caddyserver.com/docs/running#using-winsw)
- [WinSW 2.x XML 配置](https://winsw.github.io/v2/doc/xmlConfigFile/)
- [WinSW 2.x 日志轮换](https://winsw.github.io/v2/doc/loggingAndErrorReporting/)
- [Caddy 存储目录和数据持久化](https://caddyserver.com/docs/conventions#data-directory)
- [Windows LocalService 身份](https://learn.microsoft.com/en-us/windows/win32/services/localservice-account)

私有后台的实际服务注册、账户、启动、监听和页面验证已完成；公开证书签发、账号迁移、新安装包发布与真实手机课堂互通仍待完成。
