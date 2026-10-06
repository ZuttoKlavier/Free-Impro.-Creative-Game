# 隔离接入验证

2026-10-02，macOS / Chrome headless / 当前项目 Vite。实验依赖固定在本目录，生产入口未引用候选库。测试只访问临时创建的数据库与本地服务，不读取用户作品。

复现：在项目根目录运行 `npm ci --prefix experiments/library-feasibility`，然后 `node experiments/library-feasibility/run.mjs`。需已安装项目依赖和 Chrome。测试使用本地 4199 端口；结果保存到 results.json，实验构建保存到 dist。

| 候选版本 | 实测结果 | 接入结论与剩余条件 |
| --- | --- | --- |
| wavesurfer.js 8.0.1 | 合成波形加载；创建并调整选区到 0.2–0.9 秒；销毁成功 | 可试接波形 UI。Shadow DOM 需重新绑定样式；本次未验证真实麦克风、手势拖动、裁剪导出，继续保留应用的音频数据处理。 |
| tone 15.1.22 | 120 BPM、16 分位置、1 秒离线调度执行 8 次；可设置 swing；构建通过 | 调度基础可接。尚未验证 swing 的具体时间偏移、实时速度改变、完整 loop 提交边界、50 轨负载；不能直接删除现有 Sequencer 状态机。 |
| @soundtouchjs/core 2.1.1 | Stretch 处理 1 秒 440 Hz 合成立体声，tempo=0.5；输出约 1.792 秒，零交叉估计约 440.22 Hz；本机单次约 6.2 ms | 有条件可接。保留音高的初步指标通过，但尾部缓冲未排空、输出不足目标 2 秒。需补 flush/补齐/截断适配、短采样和真实敲击听感测试。此次使用低层 Stretch，不能推定完整 SoundTouch 或 AudioWorklet 管线已经验证。 |
| socket.io / socket.io-client 4.8.4 | 原生 Node HTTP 上建立 WebSocket，提交带 ID 消息并收到 ACK | 基础传输可接，不依赖迁移 Express。尚未验证 HTTPS、/api/student 路径会话鉴权、房间隔离、断线重试与幂等。现有 server/lan.js 必须显式接入 Socket.IO 并与原生请求处理共存。 |
| cropperjs 2.2.0 | 加载合成图片、设定裁剪选区、导出 128×128 canvas、销毁成功 | 可接照片裁切。v2 是自定义元素接口，不能沿用 v1 getCroppedCanvas 教程；仍需验证照片方向、触摸操作及原生拍照。 |
| dexie 4.4.6 | 打开与项目同结构的临时原生 IndexedDB v2（sounds / outbox），写读 Blob 和节奏对象成功 | 可适配现有数据库结构。并未打开实际作品库；事务回滚、200 份上限、升级与备份恢复仍需沿用现有验收。 |

六个库的浏览器入口一起通过 Vite 构建；单个合并实验 JS 约 464 KiB（磁盘统计，未压缩，含测试代码），不是实际产品增量。Socket.IO 服务端代码在 Node 运行，不进入浏览器包。

## 接入建议

1. 优先 WaveSurfer 或 Cropper 的单模块适配，保留旧实现用于对照。
2. SoundTouch 在补齐精确时长和听感验证后再替换。
3. Tone 与 Socket.IO 涉及课堂状态规则，需完整边界与断线测试后再切换。
4. Dexie 现阶段主要降低维护成本，不必为了使用库而立即迁移可用作品库。

本轮结论只适用于桌面 Chrome 和构建层面。尚未通过 WKWebView / 安卓真机验证，不代表 iOS 页面更新或白屏问题已解决。上轮 iOS 问题仍需单独排查。
