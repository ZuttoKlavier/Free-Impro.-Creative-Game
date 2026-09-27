# 安卓学生客户端

按学生自有平板、只能安装普通应用的条件实现。最低 Android 10（API 29），需要可用的 Android System WebView。教师电脑继续运行局域网 HTTPS 课堂服务。

当前为开发中的本地原型。2026-09-28 构建在下载 Gradle 依赖时收到 HTTP 403，尚未生成通过验证的安装包，原生测试和 Lint 尚未完成。下文是目标使用和构建流程，不能视为 APK 已交付或安全边界已通过真机验收。

2026-09-28 本次 GitHub 同步仅包含设计文档和配套说明，安卓及 HTTPS 新增源码尚未上传；以下命令需在源码同步后使用。

## 使用与边界

1. 教师先运行 `npm run setup:https`，再构建客户端；APK 内只包含这间课堂的 CA 公钥，不包含任何私钥。
2. 安装 APK，首次启动由教师填写课堂 HTTPS 地址并设置 6–12 位管理码。进入后学生只使用录音、声音库、拍照、形象和课堂功能。
3. 学生使用学生账号及六位课堂码入课。当前原生版尚未提供应用内二维码识别，不能通过系统相机或浏览器代替。
4. 更换课堂地址或管理码需先验证教师管理码。五次错误尝试后等待一分钟。忘记管理码没有后门；不要在已有作品的设备上直接清除应用数据，应先导出备份。

应用没有浏览器地址栏，不启动系统浏览器、设置、相机或通用文件选择器。只允许配置的课堂 HTTPS 来源，页面导航限制在应用首页及六位课堂码链接；资源请求限定在课堂 API 和构建文件。拦截外部 URL、`intent:`、`file:`、`content:` 页面、数据页面、新窗口、长按链接菜单和位置权限。WebView 调试关闭；SSL 校验失败始终取消，不提供忽略证书错误的入口。Service Worker 请求也使用同一来源限制。

**普通应用只能限制自己内部的功能，不能锁住整台学生自有设备。** 学生仍能按 Home、切换其他应用、打开系统设置、卸载应用或清除应用数据。管理码也不能防止设备所有者清除应用数据后重新配置。此版本不申请设备所有者权限，不声称具备全设备自助终端保护；若未来必须禁止退出和系统浏览器，需要转为学校受管设备与安卓 Lock Task 模式，见 [Android 官方专用设备说明](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode)。

## 录音、相机与文件

- 麦克风和相机仅向当前课堂页面授予明确请求的权限。照片在应用内相机画面拍摄，不打开系统相机。进入后台时请求停止录音和相机采集。
- 本地作品仍保存在应用 WebView 的 IndexedDB，按课堂网站来源区分。改变 IP/端口会切换本地存储来源；先导出，再在新来源导入。
- WAV 和 JSON 备份通过受限文件接口写入本机 `Download/FreeImpro`，分块保存，最大 250 MB。写入失败清理未完成文件，成功后才提示完成。
- 应用内文件列表只列出本应用导出的 WAV 或 JSON，不提供任意文件路径、外部链接或通用文件管理器入口。当前不开放系统相册导入；使用应用内拍照。其他应用生成的文件、旧安装导出的备份和任意外部备份导入仍需后续设计受控导入流程。
- JavaScript 文件接口只能创建与追加导出文件，不能读取任意文件、打开 URL、启动 Intent 或更改连接设置。学生身份限制同时在页面与 API 实施；服务器原有账号和课堂权限仍是数据访问的依据。

## 构建

需要 JDK 17、Android SDK Platform 35 和 Build Tools 35.0.0。Android Studio 可打开 `android/` 项目；命令行：

```sh
npm run setup:https
cd android
gradle wrapper
./gradlew assembleDebug testDebugUnitTest lintDebug
```

需要 Gradle 8.11.1 生成 Wrapper；当前构建尚未成功生成 Wrapper 文件。Windows 生成后使用 `gradlew.bat`。如果 HTTPS 端口不是默认 8443，加入 `-PclassroomPort=你的端口`。证书来自 `data/https/classroom-ca.crt`，默认地址来自该目录的 `config.json`。替换了 CA 时必须重新构建并安装应用；仅 IP 变化且保留同一 CA 时可以重新签发服务证书、在教师设置更新地址。

成功构建后，预计输出为 `android/app/build/outputs/apk/debug/app-debug.apk`，供本地测试安装使用；构建配置关闭 WebView 调试，不作为应用商店发布包。正式发布还需独立的发布签名与更新管理；签名私钥不能提交 GitHub。APK、构建缓存和本地 SDK 都已忽略。

## 验证

Java 单元测试覆盖来源、端口、相似域名、用户信息混淆、协议跳转、资源路径和配置输入。网页回归使用学生客户端标识，验证教师入口隐藏、应用内相机、流释放及分块备份。API 测试验证学生客户端不能注册、登录或复用教师账号。

这些测试不能替代 Android WebView 的实际运行。仍需真机验证：APK 安装与 CA 信任、录音与拍照、MediaStore 导出与应用内恢复、后台资源释放、离线冷启动、窗口和外部链接拦截、文件列表及不同品牌系统表现。普通应用允许的 Home／切换应用不属于“应用内跳转拦截失效”。

实现依据：[Android 网络安全配置](https://developer.android.com/privacy-and-security/security-config)、[WebView URI 校验](https://developer.android.com/privacy-and-security/risks/unsafe-uri-loading)、[WebView SSL 错误处理](https://developer.android.com/reference/android/webkit/WebViewClient)、[WebView 媒体权限](https://developer.android.com/reference/android/webkit/PermissionRequest)。
