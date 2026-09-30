# 教师独立客户端

更新：2026-09-30。教师端有独立网页、安卓 APK 和 Windows/macOS 桌面应用。学生端没有教师角色切换入口；教师端没有录音、声音库或照片编辑页面。两端连接同一课堂数据库，原有账号和课堂保留，拆分后需要重新登录。教师、学生可以在同一浏览器同时登录，退出一端不会退出另一端。

## 网页入口

开发服务执行 `npm start` 后：

- 教师：<http://localhost:5173/teacher.html>
- 学生：<http://localhost:5173/>

通过地址访问，不要直接双击 `teacher.html`。手机和平板上的 localhost 指它们自己，不能用作教师电脑地址。

正式课堂先停止开发服务，再执行：

```sh
npm run setup:https
npm run classroom
```

教师网页是终端显示的 `https://电脑IP:8443/teacher.html`，学生网页是 `https://电脑IP:8443/`。浏览器信任证书和首次部署步骤见 [HTTPS 部署](lan-https.md)。课堂二维码始终指向学生入口。

## 本地测试安装包

文件位于项目 `data/releases/`，未上传 GitHub：

| 平台 | 文件 | 使用方式 |
| --- | --- | --- |
| 安卓教师 Android 10+ | `free-impro-teacher-0.1.0-test.apk` | 安装后打开“声音课堂 · 教师” |
| Mac Apple Silicon | `free-impro-teacher-macos-arm64-0.1.0.zip` | 解压后打开 Free Impro Teacher.app |
| Mac Intel | `free-impro-teacher-macos-x64-0.1.0.zip` | 解压后打开 Free Impro Teacher.app |
| Windows x64 | `free-impro-teacher-windows-x64-0.1.0.zip` | 完整解压文件夹，运行 Free Impro Teacher.exe，保留旁边全部文件 |
| 安卓学生兼容更新 | `free-impro-student-0.2.0-test.apk` | 先备份，再覆盖安装原学生应用，勿卸载清除作品 |

每个包附有 `.sha256` 校验文件。教师安卓包名 `org.freeimpro.teacher`，可与学生包同时安装，应用数据独立。

这些是测试包：安卓尚非正式发布签名，桌面尚未完成正式签名及 macOS 公证。若系统拒绝打开，请保留提示交由开发者处理，正式分发需完成签名流程。

## 连接和课堂使用

1. 在教师电脑启动上述 HTTPS 服务，并让客户端连接同一局域网。**安装教师应用不会自动运行课堂后台**；电脑仍需 Node.js 与项目服务环境。
2. 打开应用，核对并填写教师电脑的 HTTPS 地址。应用自动进入教师页面。当前包内置打包时的课堂 CA 公钥，不包含私钥。
3. 注册或登录教师账号，创建课堂，设置人数与背景；学生在学生应用中登录并输入课堂码。
4. 收到作品后，在等待区选择伙伴、编辑节奏，再点击播放。完整 loop 边界加入/修改、即时退出和持续循环的规则保持不变。
5. 教师安卓应用退到后台时停止演奏；返回后由教师手动播放。桌面应用可从菜单进入连接设置，切换连接会结束当前演奏。

原生应用只允许配置的 HTTPS 课堂来源和教师页面，不提供外部网页、新窗口或通用浏览功能。桌面远程页面不具备 Node.js 权限，也不能调用连接设置接口。学生自有设备的普通应用不能禁止 Home 或系统任务切换。

仅更换 IP 时，保留 `data/https` 中的 CA，重新执行证书配置并修改客户端地址；更换 CA 后需要重新构建安装包。证书错误不能忽略。数据库、私钥和配置密钥不可随包分发。

首次打开教师原生应用需要课堂服务可达，原生教师端不提供离线冷启动页面。已经载入的声音可在短暂断连时继续演奏，状态在重连后同步。学生 0.2.0 使用专用离线缓存，首次在线准备后可离线创作；首次登录或加入新课堂仍需服务。

## 重新构建

先配置 HTTPS 证书，再构建应用。安卓使用 JDK 17、SDK 35 和项目 Gradle Wrapper：

```sh
cd android
./gradlew :teacher:assembleDebug :teacher:testDebugUnitTest :teacher:lintDebug
```

输出 `android/teacher/build/outputs/apk/debug/teacher-debug.apk`。依赖镜像和 SDK 说明见 [安卓学生客户端](android-student.md)。

在项目根目录构建桌面版：

```sh
npm install
node node_modules/electron/install.js
npm run teacher:desktop
npm run package:teacher:mac
node scripts/teacher-desktop.js package darwin x64
npm run package:teacher:windows
```

输出在 `data/releases/desktop/`。Windows 必须分发整个输出目录；Mac 分发完整 .app。临时打包目录只复制桌面代码、课堂 CA 公钥和默认地址，不复制服务数据库或私钥。

## 已验证与待验收

本轮通过 48 项单元/接口测试、29 项浏览器测试、HTTPS 与离线流程、桌面集成流程及 8 项 Java 测试。双端 APK 编译、签名校验及 Lint 错误检查通过。macOS Apple Silicon 实际打包应用完成登录和创建课堂测试；桌面配置隔离及外部窗口阻止有自动化覆盖。

尚需安卓、Windows、Intel Mac 真机运行，正式发布签名与公证，以及 15/50 台设备课堂负载验收。蓝牙、真实 OpenAI 图像生成、安卓受控外部备份导入和应用内扫码仍未完成或验收，不能把安装包构建成功视为这些要求已经达成。
