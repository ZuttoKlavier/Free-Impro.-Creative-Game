# 公网候选发布配置

更新日期：2026-10-22。统一课堂版本已上线，35 项公网检查通过，iOS `2026102101` 已可通过外部 TestFlight 测试分发，见 [发布记录](classroom-release-2026-10-22.md)。下文保留首次候选的配置要求及独立验收项；其中 2026-10-13 的旧云缺少认证模块属于历史状态。源码、锁定依赖、生产网页和手机客户端仍须作为配套版本核验。

## 最小课堂范围

教师账号登录、创建课堂，学生用姓名和六位课堂码进入，提交音频并由教师接收的基础流程继续保留。这个范围不需要 OpenAI API key、短信、微信或 Apple 凭据。新学生账号密码注册、登录可以独立于这三种第三方服务使用。第三方入口缺少配置时应提示不可用，不得返回伪造成功。

2026-10-22 已发布版本包含新的学生认证及身份恢复代码；第三方凭据和真实授权必须另外核验。仅更新网页或安装包不能让仍运行旧版的其他服务获得这些接口。旧数据和设备本地作品的迁移另见 [身份迁移和备份边界](cloud-windows.md#更新备份与账号迁移)，不得按姓名自动合并学生。

## 云课堂服务的显式变量

`server/cloud.js` 不加载 `.env`。`.env.example` 是配置项说明，不能代替 Windows 服务环境。现有 `deploy/windows/EmpvcClassroom.xml` 显式提供下列值，更新时应核对实际注册的服务配置，而不只检查仓库模板。

| 变量 | 生产值或要求 |
| --- | --- |
| `NODE_ENV` | `production` |
| `PUBLIC_ORIGIN` | `https://class.empfreeimpro.xyz`，精确来源，不含路径、端口、尾斜杠或 IP |
| `CLOUD_BIND` | `127.0.0.1`，保留同机反向代理边界 |
| `CLOUD_PORT` | `3000`，不开放为公网课堂端口 |
| `FREE_IMPRO_DB` | `C:\EMPVC\data\classroom.sqlite`；初始化、备份、维护和图片桥接必须核对同一数据库 |
| `DIST_DIRECTORY` | `C:\EMPVC\dist`，对应同一候选的完整生产构建 |
| `TEMP` / `TMP` | `C:\EMPVC\temp`，运行身份可写 |
| `STUDENT_AUTH_SECRET` | 新认证建议显式配置稳定随机值，至少 32 字符；仅保存在受保护的服务端配置，重启和更新后沿用 |
| `STUDENT_AUTH_ORIGIN` | 新认证建议显式设为 `https://class.empfreeimpro.xyz`，与 `PUBLIC_ORIGIN` 一致 |

没有设置 `STUDENT_AUTH_SECRET` 时，程序会在同一 SQLite 中持久化生成随机值；设置过短值会使初始化失败。认证密钥变化会影响既有认证会话和加密的 OAuth 凭据，不能将轮换当作普通重启。`STUDENT_AUTH_ORIGIN` 不匹配会令账号接口返回 421，即使普通健康接口仍返回 200。

服务使用 `LocalService`。程序、配置和网页只授予读取执行，`data`、`backups`、`caddy-data`、`logs`、`temp` 授予必要修改权限；不要改为 Everyone 可访问。服务端秘密不得进入 `VITE_` 变量、网页包、提交、命令行参数或公开日志。新认证表包含会话、验证码和提供商凭据，备份仍应按受保护课堂数据处理。

`EmpvcHttps` 的 `CLASSROOM_DOMAIN` 必须与上述来源一致；证书及 ACME 账户状态保留在受保护的 `C:\EMPVC\caddy-data`。真实 DNS、备案、公开证书、80/443 通路和开放授权仍是公开启用阶段的独立前置，内部构建和回环验证不代替它们。

## 可选短信登录

仅在计划提供真实手机验证码登录时准备以下四项：

| 变量 | 要求 |
| --- | --- |
| `ALIYUN_SMS_ACCESS_KEY_ID` | 有短信发送权限的受限身份 |
| `ALIYUN_SMS_ACCESS_KEY_SECRET` | 与上述身份配对的服务端秘密 |
| `ALIYUN_SMS_SIGN_NAME` | 已审核通过的验证码短信签名 |
| `ALIYUN_SMS_TEMPLATE_CODE` | 已审核通过的模板编号，模板参数使用 `code` |

先开通短信服务并完成签名和模板审核，确认额度、发送权限和服务端出站 HTTPS 可访问 `dysmsapi.aliyuncs.com`。当前发送实现仅支持中国大陆手机号。HTTP 成功还需业务响应 `Code` 为 `OK`；超时后不自动重复发送。

当前验证码为六位、五分钟有效、最多三次错误尝试；每号码一分钟最多请求一次，来源 IP 十五分钟最多请求十次。来源来自真实 socket，程序不信任转发头；同机 Caddy 代理后多个学生可能共享回环来源，因此整班并发限流需在实际代理环境复验。限流状态在内存中，重启会重置；不能将单手机号测试当作整班容量验收。

没有四项完整配置时，短信入口返回不可用并提示使用账号密码。合成短信发送器可验证 OTP 路径，但不证明真实短信送达；上线声明须以真实手机号接收及正确、错误、过期、重复、发送失败和频率限制检查为依据。

## 可选微信和 Apple 登录

真实公网回调路径由 `server/student-auth.js` 的 `/api/student/auth` 基路径决定：

| 提供商 | 凭据和平台前置 | 登记的完整回调 URL |
| --- | --- | --- |
| 微信 | `WECHAT_APP_ID`、`WECHAT_APP_SECRET`；微信开放平台网站应用审核、授权回调域登记 | `https://class.empfreeimpro.xyz/api/student/auth/callback/wechat` |
| Apple | `APPLE_CLIENT_ID`、`APPLE_TEAM_ID`、`APPLE_KEY_ID`、`APPLE_PRIVATE_KEY_FILE`；启用 Sign in with Apple 的 App ID、关联 Service ID、域名及返回 URL 登记 | `https://class.empfreeimpro.xyz/api/student/auth/callback/apple` |

`APPLE_PRIVATE_KEY_FILE` 必须指向服务端受保护的 `.p8` 绝对路径，并允许运行身份读取；不复制私人密钥到发布源码或网页。代码使用 ES256 签发五分钟 client secret，真实平台联调需确认服务器时间准确。只设置部分变量不启用提供商。

Apple 的跨站 POST 例外只接受精确 Apple 回调路径及 `https://appleid.apple.com` 来源，仍必须通过 OAuth state 和短期绑定意图检查。不能放宽为任意路径或任意 Origin。微信和 Apple 网页登录需要登记的公网 HTTPS；localhost、LAN 或 IP 页面不能替代真实平台回调。

当前原生学生容器已实现受控系统浏览器授权和回调私有证明交换；实际平台凭据、公开回调和真机授权仍须联调。浏览器 OAuth 成功不能计为原生授权成功。基础手机联网与账号密码测试不需要先启用 OAuth。

## 候选的本地验证和后续云端复验

候选应在不含实际 `.env`、课堂数据库、教师令牌、私钥或设备作品的独立快照验证。测试数据库使用内存或临时文件，平台请求使用明确的测试替身，不发送真实短信或创建外部账号。

最小验证覆盖学生认证及注销竞争、管理员与认证记录的重置/撤销一致性、SQLite 浏览的凭据屏蔽、身份恢复、云路由与媒体提交、加密迁移封装和在线 SQLite 备份。高级浏览的实际 Python 子进程测试如果因依赖缺失跳过，必须单列为未验收；不能将跳过计作通过。

公开启用前还应在实际云服务和真实手机检查：

1. 正确域名 Host 下学生页、教师页、静态资源和 `/api/health` 可用；错误 Host 返回 421，异源业务 POST 返回 403。
2. 教师、学生使用独立 Secure、HttpOnly Cookie；同域名 HTTPS 下登录、刷新、重连、注销均符合权限。不依靠伪造转发头获得权限。
3. 保留姓名和课堂码入课；学生 WAV/图片提交后，所属教师读取原素材，其他教师和学生无法越权读取或管理。
4. 新账号密码登录与游客升级保持原学生 UUID、课堂、作品和图片申请归属；旧域名 Cookie 不自动迁移。
5. 课堂域名拒绝 `/admin.html`、`/api/admin/*`、`/mcp/*` 和本机图片令牌保存接口；独立 `ADMIN_ORIGIN` 仅提供需要管理员认证的管理路由，不提供学生、教师或 MCP 路由。
6. 正确 TLS 证书、真机录音/相机权限、媒体播放、离线缓存和断网恢复通过；这些结果不由 Node 回环测试代替。
7. 服务重启后业务数据和认证密钥仍在；一致性备份可在隔离路径恢复，再确认身份、外键及音频图片字节。

`/api/health` 只返回 `{ "ok": true }`，不检查登录、认证迁移、Python、磁盘、旧数据迁移、短信、第三方授权或手机能力。候选通过本地验证表示具备待发布基础，只有云端与真机复验完成后才能记录对应范围上线。
