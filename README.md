# Free Impro · 学生端基础版

本阶段实现声音采集和本地声音库，面向安卓平板浏览器。没有服务器上传，未接入账号、课堂、蓝牙或角色生成；这些属于完整产品后续阶段。完整需求见 [designdocument.md](designdocument.md)。

## 本地启动

需要 Node.js 20.19+ 或 22.12+。

```sh
npm install
npm run dev
```

电脑打开 http://localhost:5173。点击“试试示例声音”可以体验三个合成敲击的自动切分；示例不会自动保存。

录音使用浏览器 MediaRecorder，必须在 HTTPS 或本机 localhost 下运行并授权麦克风。安卓通过普通局域网 HTTP 地址打开时通常无法录音，需要配置受设备信任的 HTTPS；未将开发服务器部署到公网。HTTPS 部署方案和安卓真机验证需后续完成。

## 已实现

- 最长 15 秒录音，自动停止并释放麦克风；切换到后台也结束录音。
- 自动识别多个声音起点，逐片试听；灵敏度重切分和手动选片。
- 波形支持鼠标和触摸拖动框选、拖动选区整体移动、拖动两端裁切，与下方精调滑块同步；保存采样最长 1 秒。切点应用 3 ms 淡入淡出减少爆音。
- 音频导入（浏览器支持的格式，最大 25 MB）；超过 15 秒只处理前 15 秒并提示。
- 基于 IndexedDB 的本地声音库，最多 200 份；命名、试听、重命名、删除、导出 WAV。
- JSON 整库本地备份与合并导入；相同 ID 跳过，新增作品超额或备份无效时不部分写入。
- 平板和窄屏布局；麦克风拒绝、存储失败、无明显声音、无效备份均有提示。

自动切分使用短时能量和能量突增检测；环境噪声、连贯人声可能需要手动裁切。原始录音仅保留在当前页面内存，保存的采样进入本地库。当前阶段每份作品是声音素材，后续加入形象绑定。

## 数据和离线边界

作品保存在当前浏览器、当前网站来源下。清除网站数据、使用另一浏览器或更换端口不会自动共享作品，请使用备份导出与导入。达到 200 份时不自动删除旧声音。

页面已经加载后，声音采集、处理和保存不需要互联网；本阶段尚未加入应用安装和离线页面缓存，不承诺关闭页面后无服务器也能重新打开。图像、账号、Wi-Fi 课堂连接和蓝牙均未实现。

## 验证

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

也可使用本机已安装的 Chrome：`PLAYWRIGHT_CHANNEL=chrome npm run test:browser`。本次已通过 5 项单元测试和 4 项本机 Chrome 浏览器测试，以及生产构建；尚未进行安卓真机测试。

单元测试涵盖独立敲击、尾音重叠、静音、裁切限制、WAV 和 200 份原子容量限制。浏览器测试涵盖切分至备份恢复流程、刷新后持久化、15 秒 MediaRecorder 自动停止、权限拒绝和响应式布局。浏览器录音测试使用合成麦克风，不替代安卓真实设备录音测试。

技术参考：[MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)、[MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)。
