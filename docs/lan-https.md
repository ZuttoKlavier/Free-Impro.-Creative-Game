# 局域网 HTTPS 课堂部署

教师电脑运行一个课堂服务；安卓平板和电脑连接同一 Wi-Fi，使用相同的 HTTPS 地址。设置完成后，不需要互联网也能注册本地账号、进入课堂、提交已有作品并合奏；OpenAI 生成新形象仍需要互联网。

2026-09-28 本次 GitHub 同步仅包含设计文档和配套说明，HTTPS 与安卓新增源码尚未上传；以下命令需在源码同步后使用。HTTPS 流程已在本地自动化验证，真实设备仍待验收。

不能使用外部浏览器的学生平板计划使用 [安卓学生客户端](android-student.md)。构建方案将此课堂的 CA 公钥内置于 APK，尚未产出经验证可安装的 APK；下文手动安装 CA 的步骤用于教师电脑和浏览器验收。学生客户端的目标流程是在应用内输入课堂码，不需要打开 HTTP 指引页。

## 1. 教师电脑准备

需要 Node.js 24.15+、项目依赖及 OpenSSL。macOS 可使用系统自带的 LibreSSL/OpenSSL；Windows 如已安装 [Git for Windows](https://gitforwindows.org/)，脚本会尝试其默认安装目录中的 OpenSSL。其他位置可在 `.env` 设置 `OPENSSL_BIN` 为 `openssl.exe` 的完整路径。

```sh
npm install
npm run setup:https
npm run classroom
```

`setup:https` 自动选择本机私有局域网 IPv4 地址，也可以明确指定地址（替换下面的示例）：

```sh
npm run setup:https -- 192.168.1.20
```

`classroom` 先构建，再启动生产页面和同源 API。终端显示三个入口：

- `https://电脑IP:8443/`：教师和学生共用的课堂。
- `http://电脑IP:8080/`：首次连接指引、二维码及 CA 公钥下载。
- `https://电脑IP:8443/connection`：检查课堂服务、安全上下文、录音与离线缓存接口；可手动测试麦克风权限。

请先停止此前的 `npm start` / `npm run server`，避免多个后台同时管理同一个课堂数据库。HTTPS 服务直接读取原 `data/classroom.sqlite`，无需迁移账号和课堂。支持 `.env` 中的 `FREE_IMPRO_DB`、`HTTPS_PORT`、`HTTPS_SETUP_PORT`、`HTTPS_CERT_DIR`；默认端口为 8443 和 8080，证书目录为 `data/https`。此入口自动启用 Secure 登录 Cookie 和 HTTPS 来源校验，不需要另起 API 代理。

## 2. 第一次连接平板（浏览器验收流程）

本节用于具备浏览器的测试设备；不能使用浏览器的学生设备须等待安卓客户端构建及验收完成。

1. 在教师电脑打开 HTTP 首次连接页，让平板扫码，或输入该地址。
2. 下载 `classroom-ca.crt`。与教师电脑终端显示的 SHA-256 指纹核对。
3. 在安卓设置搜索“安装证书”，选择 **CA 证书**。常见路径是「安全与隐私 → 更多安全设置 → 加密与凭据 → 安装证书 → CA 证书」。品牌和版本可能不同；学校管理的设备可能需要管理员安装。
4. 用 Chrome 打开 HTTPS 课堂地址。确保没有证书错误，再进入“设备检查”，点击“测试麦克风权限”。不要把浏览器的“仍然继续访问”当作完成证书信任。
5. 在正式课堂页面等待“已准备离线创作”。教师创建课堂后，学生扫描课堂内的二维码或输入课堂码。

安卓 CA 安装方式参考 [Google 设备证书说明](https://support.google.com/pixelphone/answer/2844832) 和 [Android 11 CA 安装变更](https://developer.android.com/work/versions/android-11)。麦克风和 Service Worker 要求安全上下文，见 [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) 与 [MDN Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)。

教师电脑也需信任这份 CA：macOS 在「钥匙串访问」导入并设置 SSL 信任；Windows 在当前用户的「受信任的根证书颁发机构」中导入。脚本不会自动更改任何设备的证书信任。

安装 CA 会让设备信任该 CA 签发的证书。只分发 `classroom-ca.crt`；`classroom-ca.key` 和 `server.key` 必须留在教师电脑。HTTP 指引端口不提供登录、API、作品或私钥下载。证书及数据库均位于已忽略的 `data/`，不能提交到 GitHub。结束长期使用后，可以在设备设置中移除这份课堂 CA。

## 3. 原有作品与地址变化

账号和课堂仍在教师电脑数据库中。学生本地作品按浏览器网站来源保存：从 `http://localhost:5173` 切到 `https://电脑IP:8443`、更换 IP 或端口，都属于新来源。切换前在旧地址“备份到本地”，在新地址导入；重新登录，并在线打开一次以准备离线缓存。新页面看不到旧作品不代表旧数据已被删除。

建议在路由器为教师电脑保留固定 DHCP 地址。换 Wi-Fi 或 IP 后：停止课堂，重新运行 `npm run setup:https`，再运行 `npm run classroom`。脚本保留原 CA，只重新签发包含新 IP 的站点证书；已信任该 CA 的设备无需重复安装，但要使用新地址并迁移本地作品。站点证书有效期 397 天，根 CA 为 10 年；续期时也使用上述步骤。不要随意删除原 CA 私钥。

## 4. 连接排查

| 现象 | 检查方式 |
| --- | --- |
| 平板打不开首次连接页 | 确认同一 Wi-Fi、终端中的 IP 正确、电脑保持唤醒；检查访客 Wi-Fi/AP 隔离和防火墙是否允许 Node 及 TCP 8080/8443 的本地网络入站 |
| 能打开 HTTP，HTTPS 报证书错误 | 确认安装的是当前课堂的 CA 证书；比较指纹、检查设备时间、IP 是否在证书内，再重新打开 Chrome |
| HTTPS 正常但不能录音 | 进入设备检查，确认安全上下文和录音接口可用，再授权 Chrome 麦克风权限 |
| 二维码指向 localhost | 使用 `npm run classroom` 的生产入口；开发入口不会自动提供 HTTPS 局域网地址 |
| 新地址看不到声音 | 在旧地址导出本地备份，在新地址导入；账号和课堂需要重新登录 |
| 断网后无法重新打开 | 先在线打开生产课堂并等候“已准备离线创作”，再进行离线测试；必须使用原地址、原浏览器 |

不需要关闭系统防火墙，不需要把任何端口映射到公网。首次连接端口可以在完成所有设备配置后通过本机防火墙限制；课堂继续使用 HTTPS 端口。

## 5. 验证边界

```sh
npm test
npm run test:https
```

可以通过 `PLAYWRIGHT_CHANNEL=chrome` 使用已安装的 Chrome（Windows PowerShell 使用 `$env:PLAYWRIGHT_CHANNEL="chrome"` 后执行命令）。

自动化使用临时 CA、临时数据库和独立端口，验证实际 TLS 证书链、Secure Cookie、HTTPS 来源检查、静态文件与私钥隔离、二维码地址、两个账号入课提交、模拟麦克风录音、Service Worker 和离线重新打开。浏览器测试只为该临时测试证书设置专用公钥许可，不安装系统根证书；因此不能替代真实设备证书安装验收。

真机仍需逐项验证：Windows/macOS 各一台教师电脑、安卓 Chrome、相机与麦克风、扫码入课、备份导入导出；断开互联网但保留共同 Wi-Fi 后传输与播放；完全断网后的冷启动与重连发送。15/50 台设备的负载与音画同步另行验收。
