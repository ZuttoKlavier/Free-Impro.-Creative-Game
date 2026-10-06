# 安卓学生客户端

按学生自有平板、只能安装普通应用的条件实现。最低 Android 10（API 29），需要可用的 Android System WebView。教师电脑继续运行局域网 HTTPS 课堂服务。

2026-10-06 已生成 0.4.0 测试 APK，位于 `data/releases/free-impro-student-0.4.0-test.apk`，并提供同名 `.sha256` 文件。当前源码编译、13 项学生原生单元测试、Lint 零错误和 APK 测试签名检查通过；首次设置取消的设备回归 APK 也已编译。安装包仅含课堂 CA 公钥，不含私钥。目前没有连接安卓真机或模拟器；实际安装、相机/麦克风、系统分享回调和文件迁移尚未通过设备验收，不作为正式发布版本。

0.3.0（2026-09-30）及更早的本地 APK 是历史测试包，不能作为当前扫码、分享导入、管理入口和脚本失效兜底的构建证据。2026-10-06 的网页侧原生桥由课堂服务器发布，APK 和课堂服务均须使用当前源码。

2026-09-30，v0.9 相关安卓及 HTTPS 源码已同步到 GitHub。测试 APK、课堂证书和本地数据不上传，需要按本文步骤在目标课堂环境中构建。

## 使用与边界

1. 教师先运行 `npm run setup:https`，再构建客户端；APK 内只包含这间课堂的 CA 公钥，不包含任何私钥。
2. 安装 APK，首次启动由教师填写课堂 HTTPS 地址并设置 6–12 位管理码。进入后学生只使用录音、声音库、拍照、形象和课堂功能。
3. 学生填写姓名及六位课堂码入课，无需密码。“我的”中的“扫描课堂码”实际调用应用内相机与 ZXing QR 解码；仅填写课堂码，姓名确认后由学生连接，不自动入课。纯六位码或当前配置来源的课堂二维码有效，其他来源、协议、路径或额外参数均拒绝。
4. “我的”中的“连接设置”先验证教师管理码；五次错误尝试后等待一分钟。页面无法加载、脚本未就绪或首次设置取消时，底部恢复入口可以重新打开教师设置，正常页面不显示这组原生按钮。已有管理码仍须验证；忘记管理码没有后门。迁移前先主动导出，切勿用清除应用数据或卸载代替备份。
5. 主页面连接失败会保留错误提示，恢复 Wi-Fi 后下拉至少 80 dp 并松手，可重试原课堂地址；不再显示顶部“重新连接”按钮。成功载入但学生脚本在约 10 秒内未就绪时，也启用同一原生重连兜底；多指、横向或未达到松手阈值的手势不会重连。首次配置未完成时，下拉打开配置而不加载课堂。证书错误不能通过重试跳过校验。

应用没有浏览器地址栏，不启动系统浏览器、设置、相机或通用文件选择器。只允许配置的课堂 HTTPS 来源，页面导航限制在应用首页及六位课堂码链接；资源请求限定在课堂 API 和构建文件。拦截外部 URL、`intent:`、`file:`、`content:` 页面、数据页面、新窗口、长按链接菜单和位置权限。WebView 调试关闭；SSL 校验失败始终取消，不提供忽略证书错误的入口。Service Worker 请求也使用同一来源限制。

**普通应用只能限制自己内部的功能，不能锁住整台学生自有设备。** 学生仍能按 Home、切换其他应用、打开系统设置、卸载应用或清除应用数据。管理码也不能防止设备所有者清除应用数据后重新配置。此版本不申请设备所有者权限，不声称具备全设备自助终端保护；若未来必须禁止退出和系统浏览器，需要转为学校受管设备与安卓 Lock Task 模式，见 [Android 官方专用设备说明](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode)。

## 录音、相机与文件

- 麦克风和相机仅向当前课堂页面授予明确请求的权限。照片在应用内相机画面拍摄，不打开系统相机。真正离开应用可见界面时停止采集并取消待定授权；系统权限弹窗不会被当作离开应用。迟到的授权结果不能重新启动后台录音或拍照。
- 扫码取消或退后台时停止相机；每次扫码使用独立会话，旧相机、解码或取消回调不能完成或关闭下一次扫码。扫码与网页录音/拍照共用原生权限互斥；即使取消了扫码，也等待该次系统权限结果后才接受下一次权限请求。
- 本地作品仍保存在应用 WebView 的 IndexedDB，按课堂网站来源区分。改变 IP/端口会切换本地存储来源；先导出，再在新来源导入。
- WAV 和 JSON 备份通过受限文件接口写入本机 `Download/FreeImpro`，分块保存，最大 250 MB。导出要求应用可见且课堂页面已就绪；导航、页面失败或改来源时清理未完成导出，页面失败还取消扫码和待定媒体授权。写入失败或前端中断会清理未完成文件，成功发布文件后才提示完成。系统云备份和设备迁移已显式排除应用数据，作品备份由学生主动导出到本地。
- 应用内文件列表只列出本应用导出的 WAV 或 JSON，不提供任意文件路径、外部链接或通用文件管理器入口。旧安装或其他设备的 JSON 备份可先保存在本地，再由用户从系统文件分享至“声音课堂 · 学生”；照片也可从文件或相册分享入站。本应用不启动这些外部应用，不调用通用文件选择器。
- 入站分享仅接收一份有读授权的 `content://` 文件，拒绝 `file:`、HTTP 链接与任意路径；按 MIME、文件名、内容和实际读取大小检查，备份最多 250 MB，JPG/PNG/WebP 最多 10 MB、4000 万像素。文件先复制到私有临时缓存，再凭能力令牌分块交给网页，取消或完成后清理副本。后台复制完成时，恢复前台补发待确认提示。
- JSON 在“我的”确认后进入现有备份校验及合并流程；已有 ID 跳过，无效或超额批次不会部分写入。已有恢复进行中时保留下一份待确认文件。照片须先选择声音并进入“制作形象”，确认后使用现有裁切、保存流程；读取期间改变所选声音会中止，照片不自动绑定或上传。
- 导出接口不能读取任意文件、打开 URL 或启动 Intent；新增学生桥只提供受管理码保护的设置、课堂码扫描和已分享文件的令牌读取，不提供通用浏览器或任意路径访问。学生身份限制同时在页面与 API 实施；服务器原有账号和课堂权限仍是数据访问的依据。

## 构建

需要 JDK 17、Android SDK Platform 35 和 Build Tools 35.0.0。Android Studio 可打开 `android/` 项目；命令行：

```sh
npm run setup:https
cd android
./gradlew assembleDebug assembleDebugAndroidTest testDebugUnitTest lintDebug
```

项目已包含 Gradle 8.11.1 Wrapper，并固定官方发行包的 SHA-256，无需另装全局 Gradle；Windows 使用 `gradlew.bat`。如果 HTTPS 端口不是默认 8443，加入 `-PclassroomPort=你的端口`。证书来自 `data/https/classroom-ca.crt`，默认地址来自该目录的 `config.json`。替换了 CA 时必须重新构建并安装应用；仅 IP 变化且保留同一 CA 时可重新签发服务证书，再验证管理码后修改应用内课堂地址。

默认使用 Maven Central 和 Google Maven。若 Maven Central 返回 HTTP 403，可显式使用 [GCS Maven Central 镜像](https://maven-central.storage.googleapis.com/index.html)（镜像维护方说明它不是 Google 正式支持的产品）：

```sh
./gradlew --max-workers=2 -Djava.net.preferIPv4Stack=true -PmavenCentralUrl=https://maven-central.storage-download.googleapis.com/maven2/ assembleDebug assembleDebugAndroidTest testDebugUnitTest lintDebug
```

本地本轮构建通过该参数完成，未更改系统代理、证书信任或全局 Gradle 配置；网络恢复正常时可省略参数。

构建输出为 `android/app/build/outputs/apk/debug/app-debug.apk`，本轮已生成并复制为 0.4.0 本地测试包。包名 `org.freeimpro.student`、versionCode 4、最低 API 29、目标 API 35，测试签名校验通过（APK Signature Scheme v2）。构建配置关闭 WebView 调试；这是本地测试签名，不作为应用商店发布包。正式发布还需独立的发布签名与更新管理；签名私钥不能提交 GitHub。APK、构建缓存和本地 SDK 都已忽略。

## 测试安装与连接

1. 教师电脑与安卓平板连接同一 Wi-Fi。教师先结束开发课堂服务，运行 `npm run setup:https`，再运行 `npm run classroom`；保留原有 CA，不要删除 `data/https`。
2. 将测试 APK 通过 USB 或本地文件传输复制到 Android 10 及以上平板，由设备所有者按系统提示安装。此步骤不需要打开网页；测试包不是应用商店版本。
3. 首次打开“声音课堂 · 学生”，由教师核对终端显示的 HTTPS 地址并设置管理码。APK 必须与该课堂使用相同 CA；证书不匹配时不能忽略错误。
4. 教师在电脑创建课堂；学生在应用内填写姓名及六位课堂码连接，无需注册密码。
5. 依次验证：首次配置取消后可恢复、管理码验证、首次麦克风授权、录音与切片保存、首次相机授权、课堂扫码、照片裁切绑定、作品提交、教师接收、备份导出及应用内恢复；再验证扫码/录音权限等待时按 Home、重复取消后再扫码、恢复连接，以及外部链接和新窗口被拦截。
6. 用可牺牲数据的测试设备验证旧安装和跨设备迁移：先导出并独立保留 JSON，分享入站后确认合并；验证无效 JSON、重复 ID、超额文件和备份恢复忙碌时的保留。照片分享后先选作品，读完前切换作品应拒绝；大文件在后台复制完成后应在回前台显示。未保留备份的实际学生设备不要卸载。

应用内选择列表仍只列本应用可读的导出文件，旧安装和外部备份使用受控分享入站。系统文件提供者和不同品牌的分享授权行为尚未设备实测，源码实现和自动化不能替代这项迁移验收。

## 验证

2026-10-06，13 项学生 Java 单元测试均通过：5 项来源/路径/配置测试，8 项二维码、手势、导入边界、旧扫码回调、权限互斥和导出来源守卫测试。二维码回归实际使用固定版本 ZXing Core 生成像素，再交给 Android Embedded 的 `DefaultDecoderFactory`/`Decoder` 解码，覆盖纯码、课堂 URL、外部来源和非 QR 格式；不是模拟扫码成功的桥测试。

另有首次配置取消的 Android 设备回归 `FirstSetupInstrumentation`，测试取消后底部恢复入口可见、空白页不受信任、重新打开教师初始设置。该回归 APK 已编译，但没有连接设备，尚未运行；已有教师管理配置时跳过，测试不会清空现有设置。在全新测试安装的安卓设备连接后运行：

```sh
cd android
./gradlew connectedDebugAndroidTest
```

网页回归使用学生客户端标识，覆盖连接设置、扫码只填码、确认备份、忙碌保留、错误数据、照片裁切及目标变化、Android 导出失败与原生取消。API 测试验证学生客户端不能注册、登录或复用教师账号。全项目最新测试数量见 [设计完成度核对](design-completion-audit.md)，不沿用 0.3.0 的历史数量。

当前学生安卓 Lint 为零错误、7 条提示（同步设置写入 3 条、JavaScript 1 条、触摸无障碍 2 条、界面字符串 1 条）；这些提示不等同于边界已通过实机验证。构建日志位于 `data/releases/android-student-0.4.0-validation.log`，签名检查输出位于 `data/releases/android-student-0.4.0-signature.log`，Java 测试 XML 与 Lint 报告位于 `android/app/build/`；均为本地证据，不上传构建缓存。

这些测试不能替代 Android WebView 的实际运行。仍需真机验证：APK 安装与 CA 信任、首次配置取消、管理码界面、扫码相机预览/权限/取消/后台释放、录音与拍照、MediaStore 导出与应用内恢复、分享授权与跨安装/设备迁移、大文件内存和后台复制、JS 失效下拉兜底、离线冷启动、窗口和外部链接拦截、文件列表及不同品牌系统表现。普通应用允许的 Home／切换应用不属于“应用内跳转拦截失效”。

扫码依赖通过 GitHub 连接器核对固定标签源码与公开 API：[ZXing Android Embedded v4.3.0](https://github.com/journeyapps/zxing-android-embedded/tree/v4.3.0)、[ZXing Core 3.5.4](https://github.com/zxing/zxing/tree/zxing-3.5.4)，均为 Apache-2.0。APK 内 `assets/open-source/` 随附完整许可证和上游来源说明；应用使用内嵌相机视图，没有使用启动外部扫码应用的 IntentIntegrator 模式。

实现依据：[Android 网络安全配置](https://developer.android.com/privacy-and-security/security-config)、[WebView URI 校验](https://developer.android.com/privacy-and-security/risks/unsafe-uri-loading)、[WebView SSL 错误处理](https://developer.android.com/reference/android/webkit/WebViewClient)、[WebView 媒体权限](https://developer.android.com/reference/android/webkit/PermissionRequest)、[Android 备份规则](https://developer.android.com/identity/data/autobackup)。

## 0.2.0 双端分离兼容更新

学生应用使用 `/api/student/` 与专用 `/student-sw.js`，离线预缓存不再请求教师页面。保留原包名和测试签名，可覆盖安装；请先备份作品，勿卸载后重装。教师使用独立包 `org.freeimpro.teacher`，不在学生应用内切换角色，详见 [教师客户端](teacher-clients.md)。
