# 安卓学生客户端

按学生自有平板、只能安装普通应用的条件实现。最低 Android 10（API 29），需要可用的 Android System WebView。教师电脑继续运行局域网 HTTPS 课堂服务。

2026-09-30 已在本地生成 0.3.0 测试 APK，编译、原生单元测试、Lint 错误检查及 APK 签名校验通过。本地测试包位于 `data/releases/free-impro-student-0.3.0-test.apk`。手机和平板均可使用；配合本轮课堂服务支持学生节奏编创、保存及教师审批同步。安装包仅含课堂 CA 公钥，不含私钥。目前没有连接安卓测试设备；实际安装、相机/麦克风、文件恢复与应用内边界尚未通过真机验收，不作为正式发布版本。

2026-09-30，v0.9 相关安卓及 HTTPS 源码已同步到 GitHub。测试 APK、课堂证书和本地数据不上传，需要按本文步骤在目标课堂环境中构建。

## 使用与边界

1. 教师先运行 `npm run setup:https`，再构建客户端；APK 内只包含这间课堂的 CA 公钥，不包含任何私钥。
2. 安装 APK，首次启动由教师填写课堂 HTTPS 地址并设置 6–12 位管理码。进入后学生只使用录音、声音库、拍照、形象和课堂功能。
3. 学生填写姓名及六位课堂码入课，无需密码。当前原生版尚未提供应用内二维码识别，不能通过系统相机或浏览器代替。
4. 更换课堂地址或管理码按要求需先验证教师管理码；五次错误尝试后等待一分钟。2026-10-06 核对发现当前源码移除顶部按钮后未补回设置入口，首次配置后暂无法从现界面修改地址或管理码，属于待修复缺口。忘记管理码没有后门；不要在已有作品的设备上直接清除应用数据，跨安装备份恢复尚未完成。
5. 主页面连接失败会保留错误提示，恢复 Wi-Fi 后下拉至少 80 dp 并松手，可重试原课堂地址；不再显示顶部“重新连接”按钮。页面载入成功但脚本不可用时的原生重连兜底尚未补齐。证书错误不能通过重试跳过校验。

应用没有浏览器地址栏，不启动系统浏览器、设置、相机或通用文件选择器。只允许配置的课堂 HTTPS 来源，页面导航限制在应用首页及六位课堂码链接；资源请求限定在课堂 API 和构建文件。拦截外部 URL、`intent:`、`file:`、`content:` 页面、数据页面、新窗口、长按链接菜单和位置权限。WebView 调试关闭；SSL 校验失败始终取消，不提供忽略证书错误的入口。Service Worker 请求也使用同一来源限制。

**普通应用只能限制自己内部的功能，不能锁住整台学生自有设备。** 学生仍能按 Home、切换其他应用、打开系统设置、卸载应用或清除应用数据。管理码也不能防止设备所有者清除应用数据后重新配置。此版本不申请设备所有者权限，不声称具备全设备自助终端保护；若未来必须禁止退出和系统浏览器，需要转为学校受管设备与安卓 Lock Task 模式，见 [Android 官方专用设备说明](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode)。

## 录音、相机与文件

- 麦克风和相机仅向当前课堂页面授予明确请求的权限。照片在应用内相机画面拍摄，不打开系统相机。真正离开应用可见界面时停止采集并取消待定授权；系统权限弹窗不会被当作离开应用。迟到的授权结果不能重新启动后台录音或拍照。
- 本地作品仍保存在应用 WebView 的 IndexedDB，按课堂网站来源区分。改变 IP/端口会切换本地存储来源；先导出，再在新来源导入。
- WAV 和 JSON 备份通过受限文件接口写入本机 `Download/FreeImpro`，分块保存，最大 250 MB。写入失败或前端中断会清理未完成文件，成功发布文件后才提示完成。系统云备份和设备迁移已显式排除应用数据，作品备份由学生主动导出到本地。
- 应用内文件列表只列出本应用导出的 WAV 或 JSON，不提供任意文件路径、外部链接或通用文件管理器入口。当前不开放系统相册导入；使用应用内拍照。其他应用生成的文件、旧安装导出的备份和任意外部备份导入仍需后续设计受控导入流程。
- JavaScript 文件接口只能创建与追加导出文件，不能读取任意文件、打开 URL、启动 Intent 或更改连接设置。学生身份限制同时在页面与 API 实施；服务器原有账号和课堂权限仍是数据访问的依据。

## 构建

需要 JDK 17、Android SDK Platform 35 和 Build Tools 35.0.0。Android Studio 可打开 `android/` 项目；命令行：

```sh
npm run setup:https
cd android
./gradlew assembleDebug testDebugUnitTest lintDebug
```

项目已包含 Gradle 8.11.1 Wrapper，并固定官方发行包的 SHA-256，无需另装全局 Gradle；Windows 使用 `gradlew.bat`。如果 HTTPS 端口不是默认 8443，加入 `-PclassroomPort=你的端口`。证书来自 `data/https/classroom-ca.crt`，默认地址来自该目录的 `config.json`。替换了 CA 时必须重新构建并安装应用；仅 IP 变化且保留同一 CA 时可重新签发服务证书，但现版本教师设置入口缺失，应用内地址更新仍待修复，不能按已完成能力使用。

默认使用 Maven Central 和 Google Maven。若 Maven Central 返回 HTTP 403，可显式使用 [GCS Maven Central 镜像](https://maven-central.storage.googleapis.com/index.html)（镜像维护方说明它不是 Google 正式支持的产品）：

```sh
./gradlew --max-workers=2 -Djava.net.preferIPv4Stack=true -PmavenCentralUrl=https://maven-central.storage-download.googleapis.com/maven2/ assembleDebug testDebugUnitTest lintDebug
```

本地本轮构建通过该参数完成，未更改系统代理、证书信任或全局 Gradle 配置；网络恢复正常时可省略参数。

构建输出为 `android/app/build/outputs/apk/debug/app-debug.apk`，本轮已生成，供本地测试安装使用；构建配置关闭 WebView 调试，不作为应用商店发布包。正式发布还需独立的发布签名与更新管理；签名私钥不能提交 GitHub。APK、构建缓存和本地 SDK 都已忽略。

## 测试安装与连接

1. 教师电脑与安卓平板连接同一 Wi-Fi。教师先结束开发课堂服务，运行 `npm run setup:https`，再运行 `npm run classroom`；保留原有 CA，不要删除 `data/https`。
2. 将测试 APK 通过 USB 或本地文件传输复制到 Android 10 及以上平板，由设备所有者按系统提示安装。此步骤不需要打开网页；测试包不是应用商店版本。
3. 首次打开“声音课堂 · 学生”，由教师核对终端显示的 HTTPS 地址并设置管理码。APK 必须与该课堂使用相同 CA；证书不匹配时不能忽略错误。
4. 教师在电脑创建课堂；学生在应用内填写姓名及六位课堂码连接，无需注册密码。
5. 依次验证：首次麦克风授权、录音与切片保存、首次相机授权、照片绑定、作品提交、教师接收、备份导出及应用内恢复；再验证权限等待时按 Home、恢复连接，以及外部链接和新窗口被拦截。

当前文件选择仅能恢复本应用安装期间导出的文件。卸载重装、旧安装或其他设备的备份受控导入尚未完成，测试时不要靠清除应用数据或卸载来验证恢复，以免失去已有作品。

## 验证

5 项 Java 单元测试覆盖来源、端口、相似域名、用户信息混淆、协议跳转、资源路径、配置输入和设备语言独立性。网页回归使用学生客户端标识，验证教师入口隐藏、应用内相机、授权迟到与流释放、分块备份及失败清理。API 测试验证学生客户端不能注册、登录或复用教师账号。

本轮通过 48 项单元/接口、29 项浏览器、1 项 HTTPS、1 项离线、1 项桌面集成及 8 项原生测试（学生 5 项、教师 3 项）。Lint 为零错误，仍保留同步设置写入、JavaScript 和界面字符串等提示；这些提示不等同于边界已通过实机验证。

这些测试不能替代 Android WebView 的实际运行。仍需真机验证：APK 安装与 CA 信任、录音与拍照、MediaStore 导出与应用内恢复、后台资源释放、离线冷启动、窗口和外部链接拦截、文件列表及不同品牌系统表现。普通应用允许的 Home／切换应用不属于“应用内跳转拦截失效”。

实现依据：[Android 网络安全配置](https://developer.android.com/privacy-and-security/security-config)、[WebView URI 校验](https://developer.android.com/privacy-and-security/risks/unsafe-uri-loading)、[WebView SSL 错误处理](https://developer.android.com/reference/android/webkit/WebViewClient)、[WebView 媒体权限](https://developer.android.com/reference/android/webkit/PermissionRequest)、[Android 备份规则](https://developer.android.com/identity/data/autobackup)。

## 0.2.0 双端分离兼容更新

学生应用使用 `/api/student/` 与专用 `/student-sw.js`，离线预缓存不再请求教师页面。保留原包名和测试签名，可覆盖安装；请先备份作品，勿卸载后重装。教师使用独立包 `org.freeimpro.teacher`，不在学生应用内切换角色，详见 [教师客户端](teacher-clients.md)。
