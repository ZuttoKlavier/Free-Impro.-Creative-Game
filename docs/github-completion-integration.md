# GitHub 未完成项接入与缺陷复核

日期：2026-10-06。承接 [设计完成度核对](design-completion-audit.md)，通过 GitHub 连接器读取上游仓库、固定版本示例与许可证，再接入和测试。源码完成、自动化验证、原生编译和真机验收分别记录。

## 采用的实现

| 未完成内容 | 已核对来源与许可 | 本次处理 |
| --- | --- | --- |
| Android 应用内扫码 | [ZXing Android Embedded v4.3.0](https://github.com/journeyapps/zxing-android-embedded/tree/v4.3.0)、[ZXing Core 3.5.4](https://github.com/zxing/zxing/tree/zxing-3.5.4)，Apache-2.0 | 固定依赖并实际调用内嵌相机/QR 解码；扫描只填六位课堂码，不自动登录、不导航，不启动外部扫码应用。课堂 URL 须与配置来源相同，任意链接拒绝。APK 随附许可证及来源说明。 |
| iOS 跨安装/设备备份与照片/声音导入 | [Apple/WebKit 文件选择实现](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/forms/WKFileUploadPanel.mm)，该文件 BSD-2-Clause | 参考受限类型选择器模式，用公开 UIKit API 独立实现；JSON/WAV 导出等待系统保存完成，外部文件按类型、内容、大小和临时能力令牌导入，保留旧安装私有备份入口。没有复制 WebKit 私有 API。 |
| Android 旧备份及照片导入、管理设置、刷新兜底 | 本仓库既有受限导出、管理码及学生脚本 | 从有读授权的 `content://` 分享接收单份 JSON/照片，复制到私有缓存后确认导入；“我的”恢复受管理码保护的连接设置。页面已加载但脚本未就绪时也启用 80 dp 松手重连。 |
| 教师真实舞台旁等待区、拒绝节奏的过期保护 | [本仓库](https://github.com/ZuttoKlavier/Free-Impro.-Creative-Game)现有舞台、等待区与事务逻辑 | 复用现有组件和循环引擎；实际舞台与等待区在同一布局，全屏同步新作品。拒绝必须同时满足当前编排版本及当前待处理申请，过期返回 409，不改变已保存数据。 |
| 蓝牙备用传输 A23 | [Bless v0.3.0](https://github.com/kevincar/bless/tree/v0.3.0)、[Bleak v3.0.2](https://github.com/hbldh/bleak/tree/v3.0.2)，MIT | 在独立环境安装并调用真实 macOS GATT 服务/特征对象，测试分片、重复、校验及 50 个交错会话；实验在 [bluetooth-feasibility](../experiments/bluetooth-feasibility/README.md)。尚未接入课堂，不算完成 A23。 |

## 发现并修复的问题

- 照片选择、原生读取或浏览器解码结束前切换声音，可能把旧照片放到新声音；照片更新期间生成还可能得到“新照片配旧形象”：两端桥及编辑器核对目标/编辑版本，照片读取期间禁用生成和保存，生成回填核对照片版本；清空会使旧解码失效，迟到图片及时释放。
- 保存等待裁切编码期间，迟到的新照片会清掉旧形象，造成旧照片配空形象并误报新照片已保存：保存开始快照声音、照片版本和形象，写入前发现目标或照片变化则整次放弃，原作品保持不变；提示重新保存当前照片。
- 两份备份同时解码可能覆盖相同 ID：入口禁止重叠恢复；IndexedDB 导入事务重新查询已有 ID，以新增而非替换写入。并发任务、无效批次及超额批次不会覆盖或部分写入。
- 另一标签页删除作品后，旧页面的库缓存可能把该 ID 错当成仍存在而漏恢复：移除缓存预筛选，全部已验证作品交给最终事务按实际数据库去重；双标签页删除后恢复有浏览器回归。
- Android 在后台接收完大文件后，回前台可能看不到待确认文件：前台时派发更新，并在恢复前台补发；恢复忙碌时保留下一份文件。
- 系统保存取消可能被提示为成功，Android 的保存失败也可能与取消混淆：iOS 取消静默返回 `false`；Android 失败抛错；备份页面只在实际成功后提示完成。
- iOS 本地副本不应依赖系统文件协调服务，音频签名字节不应按整段文本解码：分别修复本地/安全作用域读取和二进制头判断。
- 原生选择器关闭后仍在读文件时可以再次选择，迟到的取消/扫码/权限回调可能影响新请求：iOS 文件任务串行并保留请求身份，Android 扫码按独立会话处理且协调媒体权限；首次连接设置被取消后仍保留可达入口。导入和导出只向有效前台页面交付。
- 快速停止后重播可能让旧启动任务复活或撤销新演奏租约：启动代际使旧任务失效，并按顺序完成旧任务清理。
- 等待区与声部区两份审批按钮可能重复提交，轮询重绘也可能重新启用按钮：两区共用处理锁，重复点击不发请求。
- 晚到的接受/激活回包可能覆盖轮询已收到的更新申请：过期回包先读取最新课堂；演奏心跳只合并演奏状态。
- Bless 默认分支示例使用 `writable`，固定发布版 0.3.0 使用 `writeable`；混用实际触发 `AttributeError`。改按固定发布版示例调用后通过，没有修改上游包。这是版本不匹配，不是该发布版无法传输的证明。

独立代码复核还检查了外链、来源、任意路径、权限、生命周期和取消流程。源码复核与自动化通过不保证不存在所有 bug。

## 验证与边界

最终验证数量和构建结果见 [完成度核对表](design-completion-audit.md)第 1 节。新增覆盖包括 50 个真实并发 HTTP 客户端的身份/容量/素材/申请隔离、真实 OfflineAudioContext 的 50 声部混合与退出、等待区全屏更新、Android 原生桥、iOS 实际 Bridge.js、原生受控文件和备份恢复竞态。

测试使用临时数据和课堂服务，不写入原课堂数据库；Python 蓝牙依赖位于独立临时环境，未加入正式应用依赖。测试安装包、构建文件、设备证书私钥和密钥不上传。

尚无 Android→Windows/macOS 真实蓝牙收发、身份/审批接入证据，仍需 Android 发送端、桌面接收端、认证清单、确认重传、重连和设备测试。TestFlight、真正离线新课堂验证、真实图像生成、手机/平板权限及跨设备迁移、15/50 台设备课堂与长时间稳定性继续待实施或验收。现有 50 客户端和 50 声部测试均在同一电脑，不能替代这些验收。

## 复现

```sh
npm test
PLAYWRIGHT_CHANNEL=chrome npm run test:browser -- --workers=2 --reporter=line
PLAYWRIGHT_CHANNEL=chrome npm run test:offline
PLAYWRIGHT_CHANNEL=chrome npm run test:https
npm run test:desktop
npm run prepare:ios
xcodebuild -project ios/FreeImproStudent.xcodeproj -scheme FreeImproStudent -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath data/ios-build CODE_SIGNING_ALLOWED=NO build
cd android
./gradlew assembleDebug testDebugUnitTest lintDebug
```

Android 需要 JDK 17/SDK，iOS 需要 Xcode；环境配置及原生专属测试见对应 [Android](android-student.md) / [iOS](ios-student.md) 文档。蓝牙实验另用自身 requirements 和 probe 命令，不在这些产品回归中。
