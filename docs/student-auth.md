# 学生登录方案与可行性验证

方案核对日期：2026-10-13；手机授权更新：2026-10-14；Apple 仅 iPhone 的收尾核对：2026-10-15。这里将“GitHub 评分”解释为 stars；stars 是社区关注度，不能替代功能验证。项目采用固定版本 `better-auth@1.7.7`，在现有 Node 24、原生 HTTP、ESM 与 SQLite 服务内接入账号密码、手机验证码和微信；Apple 登录仅提供给 iPhone 客户端。账号密码已实际验证；第三方登录完成测试替身验证，真实平台联调尚未完成。

## GitHub 方案比较

星数取自核对当天的 GitHub 仓库页面，按页面显示值记录，后续会变化。

| 方案 | Stars | 四种登录与当前项目的适配情况 |
| --- | ---: | --- |
| [Keycloak](https://github.com/keycloak/keycloak) | 37.3k | 通用 IAM 服务器，需独立部署 Java 服务；微信及手机短信需要扩展。适合企业统一身份服务，本次不引入新的服务部署。 |
| [Better Auth](https://github.com/better-auth/better-auth) | 30.3k | 原生 Node 库；官方内置微信与 Apple，提供 username 和 phone-number 插件，可复用当前 SQLite。采用本方案。 |
| [Auth.js](https://github.com/nextauthjs/next-auth) | 28.4k | 支持微信与 Apple OAuth，账号和短信需补业务实现；其 README 已推荐新项目优先采用 Better Auth。 |
| [Casdoor](https://github.com/casdoor/casdoor) | 14.6k | 支持微信、Apple、短信和密码登录，需独立部署 Go 认证服务。能力完整，但增加当前课堂服务的部署维护成本。 |
| [Supabase Auth](https://github.com/supabase/auth) | 2.6k | 提供认证服务，微信需额外接入；该认证仓库与 Supabase 平台总仓库的星数不能混用。 |

Better Auth 是本次比较中适合直接嵌入现有 Node 项目、并有官方实现覆盖四种入口的高星方案；不将它表述为全 GitHub 认证系统的绝对最高排名。Casdoor 的功能依据见其 [OAuth 提供商列表](https://casdoor.org/docs/category/oauth) 和 [SMS 提供商列表](https://casdoor.org/docs/category/sms/)。

## 集成设计

- Better Auth 负责密码散列、OAuth 状态校验、验证码及认证会话；课堂服务继续负责学生、作品、入课与教师权限。
- 认证数据使用当前 SQLite 数据库的独立前缀表，通过认证用户与课堂用户的关联保留既有学生 UUID，防止更换登录方式后丢失作品与生图申请。
- 从现有匿名学生升级为账号时，服务端保留已认证课堂会话的学生 UUID；OAuth 另使用限时、不透明的绑定意图，记录发起会话及实际完成回调的认证用户，不凭姓名或客户端提供的 UUID 接管另一名学生。退出、管理员撤销和更换密码后的迟到回调不能恢复连接。
- 账号退出时同时结束认证会话及课堂会话；教师账号与教师管理权限不由学生注册接口创建。
- iPhone 客户端提供四种入口；网页与 Android 提供密码、手机和微信。没有第三方配置时清楚提示尚未配置，不返回伪造的微信、Apple 或短信登录成功。

Better Auth 官方支持 [Node 内置 SQLite](https://better-auth.com/docs/adapters/sqlite)，以及 [原生 Node 请求处理和会话读取](https://better-auth.com/docs/integrations/express)。[数据库文档](https://better-auth.com/docs/concepts/database) 提供 `modelName` 表名配置与 `getMigrations` 程序化迁移。本仓库的 Node 最低版本为 24.15.0，满足 SQLite 驱动要求。

## 服务端配置

配置只放在服务端环境变量或服务端文件中，不打包进浏览器。可在启动课堂或云服务前设置以下变量。

| 变量 | 用途 |
| --- | --- |
| `STUDENT_AUTH_SECRET` | 稳定随机认证密钥。未配置的本地环境可在数据库中持久化生成值；云部署建议显式设置固定随机值，重启后沿用。 |
| `STUDENT_AUTH_ORIGIN` | 可选的统一认证站点来源，例如正式 HTTPS 域名。第三方回调需使用平台登记的站点。 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 微信开放平台网站应用凭据。 |
| `APPLE_CLIENT_ID` | iPhone 系统授权浏览器使用的 Apple Service ID；学生网页与 Android 不提供 Apple 登录。 |
| `APPLE_TEAM_ID` / `APPLE_KEY_ID` | Apple 开发者团队及 Sign in with Apple 密钥标识。 |
| `APPLE_PRIVATE_KEY_FILE` | 服务端 `.p8` 私钥文件的绝对路径。读取私钥生成 5 分钟有效的 ES256 client-secret JWT，认证实例在 4 分钟后更新。 |
| `ALIYUN_SMS_ACCESS_KEY_ID` / `ALIYUN_SMS_ACCESS_KEY_SECRET` | 有短信发送权限的阿里云访问凭据。 |
| `ALIYUN_SMS_SIGN_NAME` / `ALIYUN_SMS_TEMPLATE_CODE` | 审核通过的验证码短信签名和模板编号；模板使用 `code` 变量。 |

### 账号密码

启用 `emailAndPassword` 与 `username` 插件。创建测试账号和普通账号都走官方注册接口，让库写入密码散列和 credential 记录。注册中需要的内部邮箱可采用不可投递的保留域名占位地址；占位地址不用于发送邮件，也不作为第三方账号自动合并的依据。[用户名插件文档](https://better-auth.com/docs/plugins/username) 说明了注册和用户名登录接口。

测试账号应在验证开始前创建，并与教师管理账号分离。账号信息和创建方式由验证记录补充；不在仓库提交真实用户的密码或第三方凭据。

### 手机验证码

使用官方 `phoneNumber` 插件，验证码发送函数接入阿里云 `SendSms`。验证码验证后可创建账号与会话；重发间隔、有效期、错误次数及单次使用需要回归验证。未配置短信服务时不发送真实短信，也不在网页响应中暴露验证码。[插件说明](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/plugins/phone-number.mdx) 给出了 `sendOTP`、自动注册以及错误次数控制接口。

阿里云配置步骤：开通短信服务，创建有发送权限的访问凭据，申请并通过验证码短信签名、模板审核，再配置上表四项变量。使用 [SendSms 官方接口](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms)，服务地址为 `dysmsapi.aliyuncs.com`，操作为 `SendSms`，API 版本为 `2017-05-25`；模板参数是包含验证码的 JSON 字符串。HTTP 请求成功后仍须检查业务响应 `Code` 为 `OK`。

阿里云最新文档使用 [V3 签名](https://help.aliyun.com/zh/sdk/product-overview/v3-request-structure-and-signature)，并保留 [V2 RPC 签名规范](https://help.aliyun.com/zh/sdk/product-overview/rpc-mechanism)。实现必须与选定协议一致，按规则排序和编码参数，使用唯一 nonce 与 UTC 时间戳；不得混合两版签名。短信接口缺少幂等保障，超时后不无条件自动重复发送。

### 微信

使用 Better Auth 内置 `wechat` 提供商，支持微信开放平台网站扫码授权。先在 [微信开放平台](https://open.weixin.qq.com/) 注册并审核网站应用，取得 App ID / Secret，将授权回调域登记为认证站点域名；本项目回调路径为 `/api/student/auth/callback/wechat`。详情见 [Better Auth 微信文档](https://better-auth.com/docs/authentication/wechat)。

内置实现已处理微信的 `appid` 参数、GET 令牌交换、`openid` 用户资料查询及授权 URL 的 `#wechat_redirect`。微信不提供邮箱，库使用稳定且未验证的占位地址；用户身份依据提供商的稳定 ID，不能依据昵称认领账号。[实现源码](https://github.com/better-auth/better-auth/blob/main/packages/core/src/social-providers/wechat.ts) 可用于核对这些行为。

### Apple（仅 iPhone）

在 [Apple Developer](https://developer.apple.com/account/) 创建启用 Sign in with Apple 的 App ID、关联的 Service ID 与 `.p8` 密钥；登记认证站点域名和完整返回 URL `/api/student/auth/callback/apple`。配置上述 Apple 环境变量后，以 ES256 私钥签发短期 client-secret JWT，并仅在这个回调允许 `https://appleid.apple.com` 的表单 POST。[Apple 配置文档](https://better-auth.com/docs/authentication/apple) 详细说明了流程。

固定版本 1.7.7 的 Apple 授权码资料读取默认只解码 ID token；本项目增加兼容保护，调用库公开的 `verifyProviderIdToken` 验证 Apple 公钥签名、issuer、audience、有效期和本次授权 nonce。OAuth 状态与意图 Cookie 使用 HTTPS 下的 `SameSite=None; Secure; HttpOnly`，以便 Apple 跨站表单携带校验凭证；课堂会话仍为独立的 Strict Cookie。

Apple 网页授权要求有效 HTTPS 公共域名，拒绝 `localhost` 和普通 HTTP 返回地址；局域网本地页面无法单独完成真实网页授权。Apple 仅首次授权提供部分姓名、邮箱资料，后续登录应通过稳定提供商 ID 恢复既有账号。

## 验证范围与上线条件

本次没有微信、Apple 或阿里云短信的真实平台凭据。自动化测试可使用隔离数据库、独立测试账号和明确标记的提供商测试替身；替身验证代码路径，不等于真实平台授权或真实短信送达。

| 范围 | 必须验证的行为 | 真实平台要求 |
| --- | --- | --- |
| 账号密码 | 预建测试账号、注册、正确和错误密码、退出、会话恢复 | 无第三方凭据，可本地完整验证 |
| 手机 | 请求验证码、正确/错误/失效/重复验证码、发送失败、频率限制 | 阿里云凭据、审核签名及模板，真实手机号接收 |
| 微信 | 正确授权参数、state 校验、令牌和用户资料处理、重复登录身份一致 | 微信网站应用凭据、授权回调域，真人扫码 |
| Apple | ES256 client secret、授权和回调、失败输入、重复登录身份一致 | Apple 凭据、有效 HTTPS 公共站点，真人 Apple 账号 |
| 课堂与生图 | 登录升级保留学生 UUID、作品和生图申请归属；不同账号不互相访问 | 使用实际课堂流程核对 |

学生网页和 Android 在“我的 → 学生账号”中提供密码、手机和微信，页面结构不生成 Apple 按钮、说明或绑定标记；Apple 登录仅在 iPhone 客户端保留。iOS 原生桥允许主动注册、密码登录及验证码请求；离线冷启动不发账号请求。手机端使用受控系统浏览器授权回传，Android 仅接受微信。只有平台配置齐全、当前连接为固定公共 HTTPS 课堂域名且客户端具备新接口时，平台按钮才可启动；缺配置时显示原因，旧客户端提示更新。

### 手机端授权回传

iOS 使用 `ASWebAuthenticationSession`，Android 使用系统浏览器。原生层产生并私有保存随机证明，服务端按以下顺序处理：`native/start → native/open → 官方提供商回调 → freeimprostudent://auth/callback?ticket=… → native/consume`。返回链接只有一次性短期票据；证明值和会话 Cookie 不进入网页脚本或返回链接。原生层兑换成功后接收课堂与 Better Auth 双会话，保持已有学生 UUID。

服务端验证证明、来源、发起学生会话、提供商结果、时效与单次使用。绑定从原生已验证身份委派独立浏览器会话，浏览器已有账号不能替换绑定对象。取消、退出和管理员撤销会销毁待完成意图及相应浏览器会话；迟到响应和重复兑换不能重新恢复连接。客户端仅允许 `https://class.empfreeimpro.xyz/` 的固定授权启动地址，网页请求白名单没有开放任意 URL。

当前微信方式是网站扫码授权，Apple 是网页授权，尚未接入微信移动应用 SDK 或 Apple 原生 `ASAuthorization`。网站扫码在实际手机上的使用方式仍须平台凭据与真人设备验证；系统浏览器桥通过模拟检查不等于真实微信账号已登录。

按 2026-10-14 用户确认，Apple 的网页启动接口固定拒绝请求，提示使用 iPhone/iPad 客户端；即使伪装客户端 User-Agent 也不能通过。Apple 回调和账号写入必须关联有效、未取消且提供商为 Apple 的原生授权记录。服务端校验真实 Apple 授权结果和私有证明，不把客户端平台标记当成身份凭证。

## 实际验证与测试账号

在运行验证前已执行 `npm run student:auth:test-account`，创建 `student_test_a20de1e0`，随后使用同一账号再次登录成功。密码、教师测试账号和课堂码仅保存于本机权限 600 的 `data/student-auth-test/credentials.json`；独立数据库为 `data/student-auth-test/classroom.sqlite`，不写入真实课堂。再次执行脚本复用这份测试账号。

账号密码、跨设备恢复、头像/课堂/额度保留、手机验证码错误/过期/重复使用/绑定冲突、微信授权与重复登录、Apple 签名和错误 audience、管理员撤销/改密/删除及退出后的并发回调均已验证。第三方网络仅在测试中替换，生产代码没有测试成功按钮或固定验证码。

2026-10-13 初始相关接口、课堂、生图、云服务、管理员和原生回归共 **81 项通过**；另有 **14 项 Chrome 浏览器检查通过**，覆盖学生账号、姓名/课堂码、生图申请/回传和 iOS 离线登录。生产依赖 `npm audit --omit=dev` 当时未报告已知漏洞。

2026-10-14 手机授权更新后，相关账号、课堂、云服务及撤销竞态回归 **45 项通过**（含原生后端 **17 项**），iOS 原生专项 **18 项通过**，Android Java 专项 **19 项通过**。学生登录及新手机桥的 **7 项 Chrome 检查通过**；其中注册检查首次在并行编译时等待超时，单独复测通过。稳定源 iOS 18.4 类型检查、网页生产构建、离线学生页面准备及实际真机签名构建通过。

2026-10-14 首次手机授权版已由 Xcode 覆盖安装到连接的 iPhone Air（设备名「HUAWEI Mate90 Pro Max」）并成功启动，启动记录 `bd5ce2a00` / PID 6245；没有卸载应用或清理作品。该记录属于调整 Apple 平台范围前的版本，不能作为后续版本安装成功的证据。本轮没有自动操作真机完成登录授权，仍需配置平台后真人验收。同期 Android 测试包已构建、Lint 0 错误，并确认沿用旧 0.4.0 的签名；历史文件为 `data/releases/free-impro-student-0.4.0-native-auth-20261014-test.apk`，没有 Android 设备连接，未实装。

本机课堂服务已加载新版本。重启前用 SQLite 安全备份保存真实数据库，重启后核对 34 个账号、19 个课堂、18 份提交及 2 项图片任务数量和学生身份哈希未变。登录配置接口经课堂 CA 校验返回 200；密码可用，短信、微信和 Apple 仍明确显示缺配置。测试账号再次登录成功，凭证文件权限为 600。备份与检查记录仅保存在 `data/auth-release-backups/`。

### Apple 平台范围调整的最新核对

按用户要求，网页和 Android 已直接删除 Apple 页面结构，包含按钮、提示及已绑定标记，不使用 CSS 隐藏。共享页面仅在存在 iOS 原生授权能力时构造 Apple 入口；Android 原生授权实现只支持微信，已删除 Apple 专用分支。服务端网页 Apple 启动返回 403，Apple 回调仅接受有效的原生 Apple 授权意图。

此轮后端回归 **28 项通过**，Android Java 检查 **19 项通过**。**9 项浏览器检查最终全部通过**：首次 8 项通过、账号注册/退出检查等待超时，后者单独重跑成功（检查用时 1.7 秒，运行总计 4.1 秒）；覆盖网页及 Android 无 Apple 元素、iOS 保留 Apple 和真实认证库密码注册。网页生产构建与 iOS 离线页面准备通过，当前源码已由本机课堂后台服务重新加载。最新 Android 包为 `data/releases/free-impro-student-0.4.0-wechat-auth-20261014-test.apk`，与旧 0.4.0 同签名，尚未 Android 真机安装。

2026-10-15 00:30（北京时间）完成最终验收。实际本机 HTTPS 首页经课堂 CA 校验，确认提供最新 `/assets/student-F1e2kueC.js`，验证记录保存在 `data/auth-release-backups/apple-direct-ui-validation.json`。Xcode 在当前连接并解锁的物理 iPhone Air 覆盖安装、启动成功，构建错误列表为空，启动记录 `bd4f4d380` / PID 9191；完整日志为 `RunProject-Log-20261015-003031.txt`。前次资产请求因用量限制未执行、Xcode 300 秒超时只记录为中断，最终结果以上述重试为准。真实微信、Apple 授权和短信送达仍缺平台配置，构建与启动成功不扩大为真人登录验收。

浏览器验证可复现为：

```sh
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/student-auth.spec.js tests/browser/classroom-code-entry.spec.js tests/browser/student-navigation.spec.js tests/browser/image-workflow.spec.js tests/browser/ios-offline.spec.js --workers=1
```

本次手机授权专项：

```sh
node --test --test-concurrency=1 tests/student-auth.test.js tests/student-auth-races.test.js tests/student-native-auth.test.js tests/admin-student-auth.test.js tests/classroom.test.js tests/cloud.test.js
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/student-auth.spec.js tests/browser/student-native-auth.spec.js --workers=1
```

只有加入平台凭据并完成真人联调后，才能将微信、Apple 和真实短信列为端到端通过。学生生图的无人值守自动生成及远程回传仍以既有生图工作流文档的验收状态为准。
