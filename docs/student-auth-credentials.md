# Apple 登录凭据接入

核对日期：2026-10-15。本项目的正式 Apple 登录凭据已在开发者门户创建，登录私钥已安全下载，四项配置已写入本机 `.env`，并通过 P-256 私钥解析与 ES256 签名自验。云端尚未配置，尚未完成真机 Apple 授权联调，不能据此认定真实登录已可用。Apple 登录入口仅在 iPhone 提供；现有实现通过系统授权浏览器连接服务端，因此使用 Services ID、网站返回地址及登录私钥。

以下是已在 Apple 门户保存的项目标识与服务端配置要求。

应用标识与签名团队已从当前 Xcode 目标核对。Team ID、Key ID 及接入状态保存在受保护的本机配置和 `data/student-auth-setup/` 记录中，不在本文公开。私钥已保存在 `data/student-auth-secrets/apple/`，目录权限为 700，私钥文件权限为 600；项目标识清单本身不能替代私钥。

| 控制台字段 / 服务端配置 | 填写内容 |
| --- | --- |
| App ID 的 Bundle ID | `org.freeimpro.student`，已启用 Primary Sign in with Apple |
| Services ID / `APPLE_CLIENT_ID` | `org.freeimpro.student.signin`，已注册并关联上述 App ID |
| Domains and Subdomains | `class.empfreeimpro.xyz`，不填协议或路径 |
| Return URLs | `https://class.empfreeimpro.xyz/api/student/auth/callback/apple` |
| `APPLE_TEAM_ID` | 当前付费团队的真实 Team ID |
| `APPLE_KEY_ID` | 下列 Sign in with Apple 密钥的真实 Key ID |
| `APPLE_PRIVATE_KEY_FILE` | 已安全保存的 `.p8` 文件绝对路径；云端须另配置服务器上的受保护路径 |

1. **团队和 App ID 已核对。** 已在 [Apple 开发者账户](https://developer.apple.com/account/) 的同一付费团队中，为 `org.freeimpro.student` 启用并保存 **Sign in with Apple → Enable as a primary App ID**。[Identifiers](https://developer.apple.com/account/resources/identifiers/list) · [官方配置说明](https://developer.apple.com/help/account/capabilities/about-sign-in-with-apple/)

2. **Services ID 已注册。** `org.freeimpro.student.signin` 已启用 Sign in with Apple，Primary App ID 已关联上述应用。[官方网站授权配置](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)

3. **域名和返回地址已保存。** Services ID 的 Website URLs 已登记 `class.empfreeimpro.xyz` 及表格中的完整 HTTPS Return URL，并完成 Save。`APPLE_CLIENT_ID` 使用已注册的 Services ID，不能用 Bundle ID 或原生 App 回跳地址替代。[官方字段说明](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)

4. **专用登录私钥已下载。** 已在 [Keys](https://developer.apple.com/account/resources/authkeys/list) 创建 `EMPVC Student Sign In`，仅启用 Sign in with Apple 并关联上述 Primary App ID。私钥已下载并安全保存，实际 Key ID 留在本机受保护记录中；Apple 私钥只能下载一次，应保留受保护的原文件。[登录密钥说明](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key/) · [下载说明](https://developer.apple.com/help/account/keys/create-a-private-key/)

5. **本机配置已写入，真实联调待完成。** `.env` 的 `APPLE_CLIENT_ID`、`APPLE_TEAM_ID`、`APPLE_KEY_ID`、`APPLE_PRIVATE_KEY_FILE` 已配置，私钥解析和签名自验通过。此结果只验证本机配置与密钥可用性，不代表云端服务已加载或 Apple 授权交换已通过。云端 `server/cloud.js` 不自动读取 `.env`，还需在实际服务环境中配置四项并部署私钥、重新加载服务，之后在 iPhone 实测授权、回到 App、退出和再次登录。服务端按需生成短期 client secret，无须手动编造或长期保存该值；私钥不要粘贴到聊天或公开日志。

这里需要的是在 Apple Developer **Keys** 中勾选了 **Sign in with Apple** 的私钥。用于给安装包签名的开发/分发证书，以及 App Store Connect 的 API Key，都不能替代这把登录密钥；即使同样带有 `.p8` 后缀，也应核对它的用途。

短信当前尚无可用的签名审核资质，本轮不申请短信签名、不开通发送服务，也不创建短信访问密钥。

2026-10-15 的真实配置隔离检查已通过 22 项：原生授权启动返回 200，授权页面跳转返回 303 并指向 Apple 官方地址，Services ID、返回地址、nonce 和 state 符合配置；取消后授权记录清除，网页 Apple 登录仍返回 403。检查使用内存数据库和本地模拟的登记域名条件，没有访问 Apple 外网、创建平台用户或触碰真实课堂数据库；它不证明公网 TLS、真实 OAuth 交换或 iPhone 授权成功。记录见 `data/student-auth-setup/apple-isolated-validation.json`。

同日云端只读检查确认：`EmpvcClassroom` 以 `LocalService` 运行，仅监听回环地址的 3000 端口；`EmpvcHttps` 尚不存在，服务器上尚无 `student-auth.js` 和 `student-native-auth.js`，实际服务环境也没有 Apple 四项配置。云端尚未部署本轮认证功能，不能仅复制本机 `.env` 宣称接入完成；`server/cloud.js` 不自动读取该文件，实际 WinSW 配置位置为 `C:\EMPVC\services\EmpvcClassroom.xml`。检查记录见 `data/student-auth-setup/apple-cloud-readiness.json`。

备案控制台目前显示备案申请初审和备案短信核验已通过，仍处于管局审核中；页面预估 7 个工作日，不是审核完成时间保证。须在备案通过并复核公开接入条件后，按受控部署流程更新完整认证代码及依赖、通过受保护的文件传输部署登录私钥、配置实际 WinSW 服务环境并重新加载服务，再启用和验证正式域名 HTTPS，最后在 iPhone 完成 Apple 授权、回到 App、退出和再次登录的真实联调。

此前对 `https://class.empfreeimpro.xyz/` 及 `/api/student/account/options` 的可信 HTTPS 只读探测均在取得响应前遇到连接重置，记录保存在 `data/student-auth-setup/public-apple-readiness.json`。该网络结果本身不构成对实际 DNS、证书或服务器故障的判断，公开回调站点仍须在最终联调时验证。
