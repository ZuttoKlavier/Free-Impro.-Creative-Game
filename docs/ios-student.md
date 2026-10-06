# iPhone 学生客户端

当前提供 iOS 18.4+ 的原生 WKWebView 工程，版本 0.3.0。2026-10-06 已通过 Xcode 的 iPhone arm64 和 iOS Simulator 未签名源码构建；尚未完成真机发布签名、上传 TestFlight 或本轮真机验收。未签名的 `.app` 不能直接安装。

## 准备与构建

先依照 `lan-https.md` 准备课堂 HTTPS 服务，再执行：

```sh
npm run prepare:ios
xcodebuild -project ios/FreeImproStudent.xcodeproj -scheme FreeImproStudent -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath data/ios-build CODE_SIGNING_ALLOWED=NO build
```

准备脚本打包独立学生页面、脚本、样式、白灰启动 Logo、应用图标、课堂 CA 公钥及默认课堂地址，不包含教师页面或 CA 私钥。更换界面源码或课堂 CA 后须重新执行准备脚本再构建。课堂 HTTPS 服务只在主动入课时需要运行。

## 应用范围

首次安装及重新打开均离线启动：白底音符 Logo 后进入「我的声音库」。录音、切片、裁剪、试听、节奏编创、拍照草稿与本地备份无需登录、管理码、教师电脑或网络。打开「我的」、下拉刷新、网络恢复和回到前台均不自动入课。

只有在「我的」填写姓名和 6 位课堂码、点击「连接课堂」后才连接教师服务。入课后可提交声音、节奏和使用联网形象生成，失败可返回声音库继续离线创作。退出连接立即停止课堂请求；应用重新打开不自动恢复联网。教师地址位于受管理码保护的「连接设置」中，修改地址不改变本地声音库。

模拟器默认的课堂目标为 `https://localhost:8443/`；只在测试入课时运行 `npm run classroom`。界面使用 WebKit 的本地模拟响应加载，网址仅作为兼容旧作品的固定存储来源，实际不会请求该网址；脚本和样式已内嵌，不下载外部资源，也不注册 Service Worker。课堂请求由原生接口执行，限制为学生 API、配置来源及有效 HTTPS 证书。Debug 模拟器构建使用独立的模拟器钥匙串权限文件，不用于真机发布签名。

支持声音采集、作品库、节奏编创和课堂提交。iOS 仅为学生应用，教师使用独立 `/teacher.html` 网页。教师管理码保护课堂地址设置；拦截网页网络加载、外部网页、新窗口和通用网页文件上传。仅作品备份、声音和照片入口可打开限定类型的系统文件选择器，不导航到选中文件或启动其他应用。相机、麦克风和局域网权限由系统询问。

普通应用不能禁止 Home、系统设置或应用切换。退到后台停止录音、相机和媒体播放；真实设备上的权限、相机、文件恢复和离线冷启动仍需验收。

## 受控文件导入与导出

2026-10-06 接入前，WAV 和 JSON 仅保存于应用私有目录，导入仅能选择本应用导出的文件，没有跨安装迁移入口。这是历史限制；当前已支持通过公开 UIKit 文件选择器，将 JSON 备份和 WAV 保存到自己选择的文件位置。系统保存完成后才报告成功；取消不会弹出失败或成功提示。应用内仍保留已生成的备份副本和旧私有备份导入入口。

导入可选择一份 JSON 声音库备份、声音文件或照片。声音类型限定为 WAV、MP3、M4A、AAC、AIFF、FLAC、OGG，照片限定为 JPEG、PNG、WebP。文件会先复制到应用私有临时目录，再检查类型、内容和大小；JSON 备份最多 250 MB、声音最多 25 MB、照片最多 10 MB 且不超过 4000 万像素。声音签名检查后仍需由页面实际解码，不能把支持选择某种扩展名当作所有编码均已验收。

网页只收到随机临时令牌，不收到外部路径；读取结束、失败或取消后释放令牌。文件复制、JSON/ImageIO 校验、分块读写和导出暂存均在同一后台串行队列执行，界面及结果回复回到主线程。页面重载或网页进程终止会使旧选择失效，并清理导入令牌、未完成导出和暂存副本；普通后台切换不会清掉系统选择器中的有效选择。连续点击不会开启重叠读取，照片选择或读取期间切换声音会放弃旧目标的照片。

作品相关目录尝试排除系统备份；卸载仍会删除应用内数据。需跨安装恢复时，应将备份保存到本应用私有目录之外的位置，之后通过 JSON 入口导入。该迁移路径已通过临时目录中的原生文件测试，实际“外部保存 → 卸载 → 重装 → 恢复”仍待 iPhone 真机验收。

选择器模式参考 [Apple/WebKit 公开实现](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/forms/WKFileUploadPanel.mm)，已核对该文件的 BSD 两条款许可。本工程用公开 UIKit API 独立实现，未复制 WebKit 私有 API 或源码。

## TestFlight 后续步骤

在 Xcode 打开工程，在 Signing & Capabilities 中选择拥有 Apple Developer Program 资格的 Team，并确认 Bundle Identifier 可用。完成签名、真机测试和发布资料后，创建 Release Archive，通过 Organizer 上传 App Store Connect，再配置 TestFlight 测试人员。

2026-10-03 的历史记录：当时本机已安装 iOS 27 模拟器运行时，已通过签名模拟器构建，并在 iPhone 18 Pro 模拟器打开白灰学生界面、验证冷启动连接和旧作品保留。真机发布签名、开发者账号、应用记录、隐私申报及上传尚未完成；当前工程不等同于 TestFlight 安装包。

macOS 可用 `npm run classroom:background` 将已构建的 HTTPS 课堂独立运行；终端关闭后仍可连接。注销或重启电脑后需要再次启动。连接修复、状态/停止命令、证书核对与日志位置见 [接入与运行核对](integration-verification.md)。

## 2026-10-05 历史核对

已通过签名模拟器编译；关闭教师服务后，分别验证旧应用升级和无旧缓存的首次安装，确认白灰 Logo、本地声音库显示及原有作品保留。在独立内存测试课堂中，模拟器的原生接口通过 HTTPS 证书校验、姓名与课堂码入课、课堂状态加载和退出测试；入课前没有请求网页或课堂 API。

3 项打包页面测试通过：离线录音与保存、重新打开保留作品、打开「我的」及恢复网络均无请求、主动入课与声音提交/媒体读取走原生接口、连接失败继续创作、退出后停止请求。相关的 6 项课堂码、教师网页独立登录、形象编辑和 iOS 录音界面回归也通过。浏览器测试使用模拟原生桥，不替代 iPhone 真机权限、局域网、相机和 TestFlight 验收。

恢复教师后台时同时修复服务状态检查的变量遮蔽问题，避免未运行时误报已连接或阻止后台启动。已实际核对“未连接 → 启动 → HTTPS 可连接且证书验证通过”，并恢复原课堂数据库的后台服务。

## 2026-10-06 文件接入核对

执行真实 `ios/Bridge.js` 的 12 项专属测试全部通过，覆盖 JSON/声音/照片完整分块读取、令牌释放、静默取消、截断和超限拒绝、未知文件入口拦截、导出等待与取消、切换声音时放弃旧照片、重复选择不抢跑及取消后再次导入。测试模拟 DOM 和原生消息回复，不代表已实际操作 iPhone 系统文件窗口。

编译并执行真实 `ios/LocalFiles.swift` 的 Swift 文件检查，通过外部备份字节迁移、旧私有备份、路径/链接/目录/类型/大小拒绝、二进制音频头、实际 PNG、中文文件名和大写扩展名、导出暂存、后台队列顺序、主线程回复及重载清理检查。三个旧导入令牌清理后可以重新导入，已保存的持久备份保持可读。该检查在 macOS 临时目录执行，不替代真机文件提供器和音频解码验收。

复现专属检查：

```sh
node --test tests/ios-files-bridge.test.js
xcrun swiftc -module-cache-path /private/tmp/empvc-ios-file-modules ios/LocalFiles.swift tests/ios-files/LocalFilesTests.swift -o /private/tmp/empvc-ios-files-test
/private/tmp/empvc-ios-files-test
```

本轮在重新执行 `npm run prepare:ios`、将当前前端打入离线页面后，iPhone arm64 和通用 iOS Simulator 的 Debug 未签名源码构建均返回 `BUILD SUCCEEDED`。生成页面和构建产物不作为 GitHub 源码提交。模拟器构建可在前述命令中改用 `-sdk iphonesimulator -destination 'generic/platform=iOS Simulator'`，并使用单独的构建目录。

仍待验收：实际系统窗口保存/取消及文件提供器权限、保存到本应用之外后的卸载重装与跨设备恢复、接近 250 MB 备份的内存和时间、不同音频编码的真实解码、真机后台与相机/麦克风权限，以及发布签名和 TestFlight。源码构建与专属检查通过不能代替这些验收。
