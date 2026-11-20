# Google Drive 独立加密备份

Lark 继续负责在线读取和存储。此功能将系统资料定期导出到个人 Google Drive 专用文件夹，不切换数据库，不改变原页面或账号权限。只有管理员能连接、配置、启动或断开备份。

## 第一次连接（当前网站无需域名）

1. 部署新代码后，用独立管理员登录，打开 **系统管理 → 数据备份 · Google Drive**。点击 **初始化密钥并下载副本**，将密钥文件保存在密码管理器或独立离线介质，避免与云端备份放在一起。已有密钥时此按钮只下载原副本，不轮换密钥。
2. 用你要存备份的个人 Google 账号打开 [Google Personal mode 创建入口](https://console.cloud.google.com/auth/overview/personal)，创建一个个人使用项目，客户端类型选择 **Desktop app / 桌面应用**，下载客户端 JSON。创建和授权使用同一个 Google 账号。启用该项目的 [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)。
3. 在网站备份区域下载 **Windows 本机授权工具**，保留默认文件名 `itea-google-drive-authorize.ps1`，放在“下载”文件夹。在 Windows 命令提示符运行：

   ```cmd
   powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\Downloads\itea-google-drive-authorize.ps1"
   ```

   若下载目录不同，把路径改成实际位置。工具弹出文件选择框，选择刚从 Google 下载的桌面客户端 JSON；随后浏览器跳转 Google 官方授权页面。回调仅监听本机 `127.0.0.1` 随机端口，有 state 和 PKCE 校验，5 分钟超时。无需购买域名，也不向公网开放电脑端口。Google 密码只在 Google 官方页面输入。
4. 授权完成后，工具让你保存临时连接文件 `itea-google-drive-connection.json`。在网站的 **连接文件** 一栏选择这个文件。网站验证连接并创建 **itea 系统备份** 专用文件夹，连接成功后删除电脑上的临时连接文件。它包含持久授权凭据，不要发到聊天、邮件或代码仓库。
5. 先点击 **立即备份**，等待出现“成功”，再勾选 **每天自动备份** 并保存。默认新加坡时间 **03:00**，保留最近 **30 个有成功备份的日期**，另保留最近 **12 个有成功备份的月份** 的各一个最新版本。可在页面调整。

授权完成后，日常备份由服务器执行，电脑可以关机。网站服务器必须持续运行且能连接 Lark 和 Google API；Google Drive 可用空间不足或授权撤销会导致备份失败。断开按钮只停止本机使用授权并移除本机凭据，不删除云端已有备份；如需完全撤销 Google 侧授权，可在 Google 账号的第三方应用连接中撤销。

Google 当前官方说明支持 Personal mode：只允许创建者自己的账号授权，不受 Testing 模式 7 天授权有效期限制。[官方配置说明](https://support.google.com/cloud/answer/15544987?hl=en)。如果你的控制台仅有 External，请按 Google 官方流程配置正式使用状态；不要把 Testing 模式当作长期无人值守备份，Testing 授权通常 7 天到期。Google 授权仍可能因撤销或账号策略失效。

## 备份内容和限制

- 五类业务数据：达人、平台账号、项目、合作、Post。保留逻辑 ID、关联、字段映射、原始 Lark 字段和原记录 ID。
- 完整协作工作流：邀约、报名、回填、券发放、设置、账号与权限、管理记录和回收站；加密邮箱授权记录按原密文包含。
- 本地产品图片文件，以及 SQLite 模式下的业务修订和审计。
- 加密包包含 `snapshot.json`、各类 CSV 和产品图片；CSV 对公式开头内容加前缀，避免直接打开时执行。恢复应采用 JSON 原值。
- **不包含**服务器环境变量、Google 连接凭据、备份加密密钥、应用源代码或整个服务器镜像。部署配置和 Lark App Secret 等应独立保管。更换原 Lark App Secret 后，旧邮箱授权需要重新连接。
- AES-256-GCM 加密，密钥独立于 Google Drive 保存；上传前本机验证解密及各成员 SHA-256，上传后比对云端大小和 MD5。确认前不标记成功；读取失败不会生成空库备份。
- Lark 是分表分页导出，没有跨表事务。程序检查本站导出期间是否发生写入，发生变化则失败并重试；其他人直接在 Lark 上编辑无法靠本站写入计数隔离。需要严格一致快照时，应在停止双方编辑的时段导出。
- 本版上限：每张 Lark 表 10,000 条、产品图片合计 64MB、未压缩备份包 128MB。超过上限会明确失败；不会截断当作完整备份。云端备份列表超过 5,000 个文件时停止清理并提示。
- 只清理当前实例专用文件夹内带匹配标记的备份，移入 Google Drive 回收站，不永久删除其他文件。Drive 回收站的占用和保留规则由 Google 管理。
- 每天成功后不重复定时备份；失败最多自动尝试 3 次，相邻至少 1 小时。服务重启会将未确认任务记为“未完成”；不会谎报成功。手动任务与定时任务互斥。
- 打开网站不扫描备份资料；管理员状态查询只读本地状态。备份的 Lark 读取仍受现有并发和超时保护约束；夜间执行能减少和业务操作争用。

## 离线校验与恢复准备

从 Google Drive 下载 `.iteabackup` 文件，在安装 Node.js 24 的独立电脑或临时目录，使用同版本源码执行：

```sh
node tools/verify-backup.mjs --key-file /安全位置/itea-backup-key-编号.json /下载位置/备份.iteabackup
```

验证并解密到一个**尚不存在**的新目录：

```sh
node tools/verify-backup.mjs --key-file /安全位置/itea-backup-key-编号.json /下载位置/备份.iteabackup /临时位置/恢复核对
```

工具只校验和提取，不访问 Lark、不修改线上数据库。核对 JSON 记录数、逻辑 ID、关联和图片，再在测试环境恢复演练。Lark 的记录 ID 跨 Base 不通用，恢复到新 Base 需重建平台关联，不能将原始记录 ID 直接作为新 Base 的关联 ID。**本版本没有一键覆盖线上数据功能。** 丢失备份密钥后无法解密；请在第一次备份成功后立即测试离线校验。

## 部署与密钥保管

现有持久数据挂载（例如 `/var/lib/itea-creator:/data`）必须保留。`DATA_DIR/backups/` 保存设置、任务结果、密钥及加密 Google 凭据；不保留明文业务导出文件。备份目录 0700、文件 0600。

默认管理员初始化密钥并下载离线副本即可，无需重新配置容器。若部署系统已有密钥管理，可预先配置 `BACKUP_ENCRYPTION_KEY`（32 字节 Base64），或 `BACKUP_ENCRYPTION_KEY_FILE` 指向密钥文件。优先级：环境变量 → 指定文件 → `DATA_DIR/backups/encryption.key`。不要随意更换；不同密钥不能解密旧包或旧 Google 凭据。

不要同时部署两个启用备份调度的容器到同一数据目录；现有部署本就要求单实例。代码发布不等于已连接或已启用备份，必须完成上述授权、首份成功备份和离线验证。
