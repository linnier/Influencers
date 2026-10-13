# 星桥 · 达人管理系统

**自己在 Windows 电脑使用：下载 ZIP、完整解压、双击 `start-personal.cmd` 即可。** 首次联网准备完成后自动打开系统；不需要 Docker、虚拟机或云服务器。使用与导入名单步骤见 [个人版说明](deploy/PERSONAL.md)。

中文达人管理后台初版，采用 Next.js App Router、React、TypeScript 和 SQLite。提供单人管理功能，暂不包含应用内登录、团队权限或平台数据抓取。服务器部署可使用统一的 HTTPS 与密码访问保护。

服务器部署配置、HTTPS 与密码访问方案见 [部署说明](deploy/README.md)。公网访问保护由 Caddy 统一提供；应用自身仍为单人工作空间。尚未创建目标服务器或验证公网域名。

只在 Windows 局域网使用，请参阅 [Windows 操作说明](deploy/WINDOWS.md)，无需购买服务器或域名。

## 在线预览（无需本机安装）

打开 [GitHub 云端启动入口](https://codespaces.new/linnier/Influencers?ref=codex%2Fwindows-lan-delivery)，登录能访问仓库的 GitHub 账号，确认分支为 `codex/windows-lan-delivery`，点击 **Create codespace**。账号需要具备可用的 Codespaces 权限和配额。

云端会安装 Node.js 24 和依赖并启动应用。等待完成后，在 **Ports（端口）** 面板找到 `3000`，点击浏览器图标。保持端口可见性为 **Private**；此时 GitHub 登录保护预览访问。

预览使用独立的 `.preview/influencers.sqlite`，不包含上传的 Excel 或 564 份真实名单。可以点击界面左下角 **体验演示数据** 查看功能。Codespace 停止时链接不可用；删除 Codespace 会丢失该预览的数据。该入口是创建云环境的链接，并非已经运行的系统网址。

## 已实现功能

- 工作概览：达人数量、粉丝数之和（未去重）、执行项目数、计划预算、平台分布和到期跟进。
- 达人资源库：新增、编辑、详情、删除；按名称、账号、领域、城市或联系方式搜索，按平台和状态筛选。
- 合作项目：品牌、预算、日期、状态、说明及多达人关联；编辑与删除。
- 跟进记录：沟通方式、日期、内容、下次跟进日期；时间线、搜索和删除。待办提醒采用每位达人的最新记录（按跟进日期、创建时间排序），不发送通知。
- 导出当前筛选结果为 UTF-8 CSV，兼容中文并处理电子表格公式字符。
- 演示数据仅可手动载入空数据库，不会覆盖现有档案。

## 启动

需要 Node.js **24.x**（使用内置 `node:sqlite`）与 npm。无需外部数据库或 API 凭据。

```bash
cd /workspace/Influencers
export npm_config_cache=/workspace/.cache/npm
export NEXT_TELEMETRY_DISABLED=1
npm ci
npm run dev
```

开发服务默认监听 `127.0.0.1:3000`。生产模式：

```bash
npm run build
npm run start
```

应用目前没有身份认证，默认只监听回环地址；公网或多人使用前应添加登录、权限控制并配置部署与备份。

## 数据保存与备份

默认数据库为 `data/influencers.sqlite`，首次访问接口时自动建立空数据库。该目录已忽略，不应提交业务数据和联系方式。所有接口均读写服务器 SQLite，浏览器刷新及服务重启不会清空记录。

可在进程环境中设置 `INFLUENCERS_DB_PATH`，或复制 `.env.example` 为 `.env.local` 并使用仓库之外的绝对路径；相对路径以启动目录为基准。**不要**使用 `:memory:` 保存真实数据。更改路径会切换数据库，不会自动迁移旧数据。

SQLite 使用 WAL 模式。备份时先停止应用，再复制数据库及存在的 `-wal`、`-shm` 文件；或使用 SQLite 官方在线备份工具。重建依赖和应用不会删除 `data/`，但云实例删除或还原旧快照可能影响数据，正式业务需要独立备份。

删除达人时会同时删除其跟进记录和项目关联，项目本身保留。删除项目不会删除达人。删除操作需要在界面确认，不能撤销。

## 验证

```bash
npm run build
npm run typecheck
npm test
```

`npm test` 包含 CSV 测试和生产 HTTP 集成测试（须先构建），使用临时独立数据库并自动启动/停止测试服务。覆盖字段校验、跨站写入拒绝、CRUD、项目关联、服务重启持久化、级联删除和演示数据保护；不会写入正式数据库。

可选浏览器验证需要 Python Playwright 与 Chromium（此云环境已提供）：

```bash
python3 tests/browser_smoke.py
```

浏览器测试同样使用临时数据库，覆盖达人、项目、跟进、提醒、CSV 下载、删除和手机布局。默认 Chromium 路径 `/usr/bin/chromium`，可用 `CHROMIUM_PATH` 覆盖；截图写入 `/tmp/influencers-desktop.png` 与 `/tmp/influencers-mobile.png`。

## 目录

```text
src/app/              页面、样式和 HTTP API
src/components/       管理界面、弹窗和图标
src/lib/              数据库、业务校验、数据类型与 CSV
tests/                集成测试与浏览器验证
data/                 本地数据库（已忽略）
```

报价和预算单位为人民币元；粉丝数与互动率均为手动录入。概览预算不是实际支出，粉丝数量不是去重覆盖人数。界面当天日期按北京时间计算。
