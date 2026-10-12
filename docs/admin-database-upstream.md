# 管理员数据库浏览工具

管理员页面的高级数据库浏览集成 [coleifer/sqlite-web](https://github.com/coleifer/sqlite-web)。当前固定版本为 **0.8.2**，对应 [上游提交 8b227d9fa30e21bd77efcbab67bc2ae2c0bccd9e](https://github.com/coleifer/sqlite-web/commit/8b227d9fa30e21bd77efcbab67bc2ae2c0bccd9e)，发布时间 2026-09-27。Python 包来自 [官方 PyPI 发行版](https://pypi.org/project/sqlite-web/0.8.2/)。

## 安装和接入

在项目目录运行 `node scripts/install-admin-database.js`。需要 Python 3 和能访问 PyPI 的网络；独立环境写入被 Git 忽略的 `data/admin/venv`。安装失败时不会修改课堂数据库。课堂服务按需启动浏览子进程，因此未安装工具时仍能使用教师、学生和普通管理员页面。

`server/admin-database.js` 导出 `createAdminDatabase({ dbPath, pythonPath? })`，返回 `proxy(req, res)` 和 `close()`。`dbPath` 必须来自服务端配置；相对路径按课堂服务当前目录解析。内存数据库仍可使用普通管理员业务页面，高级浏览返回不可用提示。调用方必须先验证独立管理员会话和精确来源，再代理 `/api/admin/database`。子进程仅在 `127.0.0.1` 的随机端口监听；URL 前缀始终指向经过认证的课堂服务。代理不传递登录 Cookie 或 Authorization，并取消浏览工具的 Set-Cookie。

## 数据边界

高级浏览读取当前课堂 SQLite 数据库，支持表结构、分页内容、只读 SQL 和 JSON/CSV 列导出。教师、学生、课堂和其他业务数据的更改由中文管理员页面及业务 API 处理。上游程序不经修改；项目包装器额外应用以下约束：

- SQLite 连接使用 `mode=ro` 和 `query_only`；数据库文件必须已存在。
- SQLite authorizer 将教师/管理员密码及盐、登录会话令牌、图片令牌摘要和图片申请领取凭据的列读取替换为 NULL。表达式、查询和导出同样受保护。
- 禁止写入、修改结构、ATTACH/DETACH、扩展加载、文件读写函数及会写入状态的 PRAGMA。禁止上传/加载其他数据库。
- 原始数据库下载关闭，避免绕过秘密字段遮蔽。数据库备份应通过单独受保护的业务功能进行。
- 单次查询约 2 秒上限；代理限制查询请求 1 MiB、结果 8 MiB、并发请求 16 个和网络等待时间。子进程随父进程关闭。

普通业务数据仍可被已登录的管理员查看和导出，这是后台权限的一部分。凭据不作为可编辑的普通业务字段。

上游 [README](https://github.com/coleifer/sqlite-web/blob/8b227d9fa30e21bd77efcbab67bc2ae2c0bccd9e/README.md)、[应用源码](https://github.com/coleifer/sqlite-web/blob/8b227d9fa30e21bd77efcbab67bc2ae2c0bccd9e/sqlite_web/sqlite_web.py) 和 [依赖清单](https://github.com/coleifer/sqlite-web/blob/8b227d9fa30e21bd77efcbab67bc2ae2c0bccd9e/pyproject.toml) 是本次接入依据。Node 备选 sqlite-gui-node 依赖另外的原生 sqlite3 驱动，与项目现有 `node:sqlite` 连接接口不同，因此选择 sqlite-web 独立进程。

## 上游许可证归因

sqlite-web 使用 MIT 许可证。以下文字来自 [上游 LICENSE](https://github.com/coleifer/sqlite-web/blob/8b227d9fa30e21bd77efcbab67bc2ae2c0bccd9e/LICENSE)，保留版权和许可声明：

```text
Copyright (c) 2010 Charles Leifer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
