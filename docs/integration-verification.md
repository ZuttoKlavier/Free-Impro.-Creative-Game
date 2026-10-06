# 开源组件接入与运行核对

日期：2026-10-03。依据产品设计和本轮明确选择的 OpenAI GPT Image 2。以下记录实际接入范围；候选库的隔离验证不代表整套产品已经验证。

## 已接入

| 模块 | 固定版本与来源 | 实际替换范围 |
| --- | --- | --- |
| 波形 | `wavesurfer.js@8.0.1`，[官方仓库](https://github.com/katspaugh/wavesurfer.js/tree/v8.0.1)，BSD-3-Clause | WaveSurfer 和 Regions 替换自绘波形、选区显示。保留应用的双向拖选、整体移动、两端裁切、触控命中范围及最长 1 秒限制。录音、自动切片和 WAV 导出继续使用原实现。 |
| 本地作品与队列 | `dexie@4.4.6`，[官方仓库](https://github.com/dexie/Dexie.js)，Apache-2.0 | 替换手写 IndexedDB 读写事务。动态打开原生 v2 数据库，保留库名、作品 ID、声音和图片 Blob、节奏及待发送队列；200 份容量和批量保存保持原子性。 |
| 物品动漫化 | `openai@7.27.0`，[官方 SDK](https://github.com/openai/openai-node)，Apache-2.0 | 使用 `images.edit` 和 `toFile` 替换手写 multipart 请求。默认模型 `gpt-image-2`，上传裁切主体，统一动漫画风，1024×1024、中等质量、透明 PNG。关闭自动重试，保留取消、超时、限额和服务器鉴权。 |

依赖固定在 package.json 与锁文件；波形和存储随前端一起打包，课堂无需访问 CDN。模型调用与密钥只在服务器运行。生成 PNG 经过格式、尺寸和完整性校验，客户端缩小至 256×256 后与声音保存。

参数依据 [OpenAI 官方图像提示说明](https://developers.openai.com/api/docs/guides/image-prompting)。GPT Image 2 的透明背景处于预览支持阶段；使用 PNG，省略 `input_fidelity`。本机没有配置真实 API 密钥，因此已验证 SDK 请求与模拟图片绑定流程，尚未验收真实生成效果和费用。

## 保留的实现

Tone、SoundTouch、Cropper 和 Socket.IO 的试验代码位于 `experiments/library-feasibility/`，尚未接管正式模块。SoundTouch 试验输出尾部长度尚不满足精确时长；其他隔离试验未覆盖完整课堂边界、审批和断线队列。现有完整 loop 加入规则、同步播放、保持音高处理和裁切交互继续保留。

## iOS 重连问题

本轮确认课堂服务未运行，证书未过期、安装包 CA 与服务端一致；还发现缓存 HTML 完成导航早于模块创建界面，导致声音库已显示但顶部误报加载失败。

应用现在等待界面准备，忽略主动取消导航产生的错误，分别提示服务不可达、地址、网络和证书失败；显示当前地址与错误码。回到应用后会重试失败连接，网页不可用时可下拉重连。始终校验证书，不跳过 HTTPS 信任检查。模拟器继续使用原 `https://localhost:8443/`，不改变本地作品来源。

macOS 后台运行：先 `npm run build`，再 `npm run classroom:background`。服务在当前电脑登录期间由 launchd 运行，关闭终端仍可连接；注销或重启电脑后需再次启动。检查用 `npm run classroom:status`，停止用 `npm run classroom:stop`，日志位于 `data/classroom-service.log`。更新网页或密钥后停止并重新启动服务；后台服务与前台 `npm run classroom` 不应同时运行。

## 验证范围

最终结果：55 项单元/接口、42 项界面、离线冷启动、HTTPS 双端课堂和教师桌面集成共 100 项检查通过；网页生产构建、安卓双端 APK/原生测试/Lint 错误检查、iOS 签名模拟器构建通过。模拟器冷启动恢复声音库，原有作品保留。测试使用隔离课堂数据；Android Lint 仍有建议项。

已新增旧数据库保留、并发容量、批量回滚、GPT Image 2 请求、取消、损坏输出和禁止自动重试测试。原有界面测试更新为声音图标二级页面及姓名＋课堂码连接流程。

真机 Android/iOS、TestFlight、蓝牙和真实 15/50 人课堂尚待验收。模拟器成功运行不等同于 TestFlight 发布或真实跨设备验收。
