# 2026-10-20 iOS 固定课堂地址更新

本页保留较早 `0.3.0 (2026102001)` 本地归档的历史结果。后续最新构建为 `2026102003`：北京时间约 14:58 已在 App Store Connect 外部组 MUST 显示“正在测试”，群组 3 位测试员且有该构建“已安装”记录；旧 `1901` 也仍“正在测试”。详见 [TestFlight 发布记录](testflight-2026-10-19.md)及`output/release-followup-2026-10-20/testflight-2003-testing.png`。下文“未上传/未安装”仅描述 `2001` 当时的状态，不能代替新构建状态；`2003` 的作品保留和完整课堂验收也不能由安装记录推定通过。

用户已确认 iPhone 连接成功，要求将课堂地址固定并隐藏学生连接设置。本次处理 iPhone / iPad 学生 App。

原生 `ClassroomConnection.configure()` 固定使用 `https://class.empfreeimpro.xyz/`，不再接受可修改地址，旧 `classroom` 偏好不能覆盖实际目标。学生页面按钮、原生地址弹窗及相关管理码流程已移除；普通 iOS 资源准备命令也固定生成公开地址。一般网络失败提示改为检查网络连接，证书失败提示检查日期与网络，不再要求与教师使用同一 Wi-Fi。

本地页面仍使用原来的 `localOrigin` 保存作品；缺少该偏好的旧安装先从原课堂地址恢复存储来源。不会清空作品、修改已有来源或自动入课。公开域名仍使用系统证书链与主机名校验。Android 的源站存储机制不同，本次未修改其原生地址或连接设置。

验证结果：

- 24 项 Node 检查通过，含实际编译 Swift 的固定目标、旧来源保留、错误文案、Cookie 隔离、OAuth 及证书域边界检查。
- 4 项 iOS 离线浏览器回归通过，含连接设置按钮不存在、录音保存及重开、主动入课和提交、连接失败后继续创作、隔离测试服务的账号流程。
- Xcode 完整构建、真机 Release 归档及 `codesign --verify --deep --strict` 通过。
- 归档版本 `0.3.0`，构建号 `2026102001`，原 Bundle ID `org.freeimpro.student`；内置公开地址正确，页面与最新生成资源一致，隐私清单存在，未包含私钥或环境文件。

归档：`output/fixed-classroom-2026-10-20/FreeImproStudent.xcarchive`。检查记录：`output/fixed-classroom-2026-10-20/verification.json`，构建日志位于同目录 `archive.log`。

此构建尚未安装到用户手机或上传 TestFlight；设备交互工具未找到可用的物理设备。旧 App 需要覆盖更新后才会生效，不要卸载或清空数据。实际覆盖升级后的作品数量、内容和入课仍需真机验收。现有公网服务仍为原有基础课堂版本，以上隔离测试不代表新版账号密码、Apple、微信或短信认证已部署。

文内 `output/` 路径为本地发布证据，不随 GitHub 源码提交；公开版本范围以本文记录及 [源码哈希清单](releases/2026-10-22-source-manifest.json)为准。
