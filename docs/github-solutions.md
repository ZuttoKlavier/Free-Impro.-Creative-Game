# 产品需求与 GitHub 方案对照

核对日期：2026-10-06。以下表格保留 10 月 3 日初始候选评价。WaveSurfer、Dexie 与官方 OpenAI SDK 已接入，实际版本、替换范围及运行核对见 [开源组件接入记录](integration-verification.md)。本轮新增 ZXing 应用内扫码和受控原生文件流程，并实际调用 Bless/Bleak 做隔离可行性实验，详见 [未完成项接入与缺陷复核](github-completion-integration.md)；蓝牙仍未接入课堂，其余候选没有因此被采用。

| 需求 | 对应方案 | 结合当前代码的结论 |
| --- | --- | --- |
| 15 秒录音、波形、拖动裁剪 | [WaveSurfer.js](https://github.com/katspaugh/wavesurfer.js)，Record / Regions，BSD-3-Clause | 优先试接波形与选区。仍需保留长按释放、0.5 秒过滤、1 秒采样上限及麦克风后台释放规则；不负责自动识别敲击或导出裁剪后的 WAV。 |
| 多次敲击自动切片 | [Essentia.js](https://github.com/MTG/essentia.js)，AGPL-3.0 | 音频分析候选，需进一步验证起音检测接口、噪声下准确度及许可证适配；暂保留 src/audio.js 的能量检测。其 README 明示部分算法与兼容性仍需验证，不能直接当成熟切片成品。 |
| 循环、速度、Swing、多声部调度 | [Tone.js](https://github.com/Tonejs/Tone.js)，MIT | 优先验证 Transport 替代 src/sequencer.js 部分调度。完整 loop 边界加入、教师审批、即时退出仍由本项目实现；保留现有圆点和水滴 UI。 |
| 拉长声音但保持音高 | [SoundTouchJS](https://github.com/cutterbl/SoundTouchJS) | 优先与 src/time-stretch.js 做试听对比。当前 README 标注 MPL-2.0，旧版许可和 API 不同，必须核对选定版本。无法保证任意拉伸完全不改变音色；短敲击需听感验收。 |
| 照片主体裁切 | [Cropper.js](https://github.com/fengyuanchen/cropperjs)，MIT | 可复用触控裁剪交互；不会自动分割主体，也不会生成动漫图。先保留已有拍照权限和作品绑定。 |
| 动漫形象生成 | 现有 server/images.js 的 OpenAI 图像服务适配器 | 按已选服务继续；不把裁剪库或动画播放器误作生成模型。本次未重新验证模型配置与真实生成效果。 |
| 角色统一动作 | [lottie-web](https://github.com/airbnb/lottie-web)，MIT | 适合播放预制矢量动画，不会把每张生成图片自动变成可动角色。现阶段统一缩放/摆动可继续 CSS 实现。 |
| 教师学生状态同步 | [Socket.IO](https://github.com/socketio/socket.io)，MIT | 可替代 src/classroom.js 的 8 秒轮询。只传状态和通知；音频继续由教师本地 Web Audio 调度，不能把网络消息到达时间当节拍。需保留请求去重、断线队列和版本冲突保护。 |
| 本地 200 份声音与备份 | [Dexie.js](https://github.com/dexie/Dexie.js)，Apache-2.0 | IndexedDB 管理候选。已有本地库工作正常，后续数据库升级时引入更合适；不更改现有作品 ID 和备份格式。 |
| 姓名＋课堂码，无密码入课 | [express-session](https://github.com/expressjs/session) 的服务端会话模式 | 参考身份建立后轮换会话；当前是原生 Node HTTP + SQLite，暂不为此整体迁移 Express。重名编号与课堂成员规则仍需业务代码。 |
| Android / iOS 安装包 | [Capacitor](https://github.com/ionic-team/capacitor) | 成熟跨平台容器候选，但项目已有原生 Android / WKWebView 及受限文件接口，不立即重写。横屏门禁、权限、禁止外链仍要单独实现和测试。 |
| 蓝牙备用传输 | [Nordic Android BLE Library](https://github.com/nordicsemi/Android-BLE-Library)、[Capacitor BLE](https://github.com/capacitor-community/bluetooth-le) | 只可作为部分能力参考。后者仅 BLE central、不支持 classic/peripheral，无法独立满足手机到教师电脑传文件。需要另行设计接收端、分片、校验、重试并验证 Windows/macOS/iOS；暂不能承诺完整可用。 |

## 优先顺序

1. WaveSurfer：先验证长按录音结束后的波形选区，确保不丢现有裁剪体验。
2. SoundTouchJS：用杯子敲击、拍手、人声，对比 1×/2×/4× 时长的音高、瞬态及手机耗时，再决定替换。
3. Tone.js：回归完整 loop 边界、Swing、BPM 实时调整和 50 轨播放，验证通过才接管调度。
4. Socket.IO：先改通知，保留已有 HTTP 提交与 SQLite 数据，再验证断线恢复和 15/50 人课堂。

WaveSurfer、Dexie 与官方 OpenAI SDK 已安装固定版本，其余候选保留在隔离试验中。正式前端接入使用本地打包，不依赖课堂现场访问 CDN。

## 本次代码检查

- 新增姓名与课堂码入课，重名使用内部“姓名#0000”递增编号；页面显示 name。
- 使用现有会话恢复同一设备身份，不通过相同姓名接管其他设备身份；清除会话或退出后重新填写姓名会创建新身份。
- 修复入课轮换会话时旧 token 未撤销、限流记录未清理的问题。
- 验证无密码入课、重名隔离、刷新保留、课堂容量、教师端拒绝学生入课接口；兼容旧教师账号与课堂提交测试。
- 未完成全仓库安全审计、真实设备蓝牙测试或所有候选库接入。
