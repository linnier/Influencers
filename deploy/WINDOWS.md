# Windows 局域网使用

不需要购买服务器、域名或设置外网访问。选一台常开 Windows 电脑运行系统，其他电脑连接同一局域网，通过该电脑的私有 IPv4 和 8443 端口访问。电脑关机、睡眠或 Docker Desktop 退出时，服务不可用。

## 准备

推荐 Windows 11、Intel/AMD 64 位 CPU、至少 8 GB 内存。安装 [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)，按安装器要求启用 WSL 2 和虚拟化，重启后打开 Docker Desktop，使用 **Linux containers**。旧版 Windows 请先核对 Docker 官方系统要求。

首次下载安装器和官方容器镜像需要联网；系统运行时不需要外网域名或公网服务器。GitHub 源码 ZIP 首次构建也需要联网下载 npm 依赖；私密部署包包含经过锁文件校验的 Linux amd64 npm 缓存，会自动使用离线缓存构建。当前启动脚本适用于 Intel/AMD 64 位 Windows。

GitHub 下载方式：在仓库页面切换到交付分支，点击 **Code → Download ZIP**，完整解压后进入含有 `windows-start.cmd` 的文件夹。源码 ZIP 不包含名单、数据库或账号密码，第一次启动创建空数据库。云工作区已导入的 564 份名单并不会自动同步到你的 Windows 电脑。

把 ZIP 完整解压到本机 NTFS 用户目录，例如 `C:\Users\你的用户名\Influencers`。不要在 ZIP 中直接双击脚本，也不要放在公开共享文件夹或 OneDrive 等多人共享目录；私密部署包内含 564 份达人数据和联系方式。

## 第一次启动

1. 确认 Docker Desktop 已启动并就绪，然后双击 `windows-start.cmd`。
2. 从脚本列出的网卡中选择 **Wi-Fi 或以太网** 的内网 IPv4，例如你电脑实际使用的 `192.168.x.x`。不要选择 Docker、WSL 或 VPN 虚拟网卡。可以用 `ipconfig` 核对；不确定时先看当前连接的网卡。
3. 输入管理员用户名和至少 12 位的密码。密码输入不显示，脚本只保存 bcrypt 哈希；不需要把密码发给助手。
4. 等待镜像下载、构建与服务启动。私密部署包首次只把初始数据库恢复到空目标；源码版首次创建空库。再启动都会保留当前库，不重复导入或覆盖。
5. 双击 `windows-trust.cmd`，为**当前 Windows 登录账户**信任系统生成的本地根证书，然后重新打开 Edge/Chrome。它不是公网 CA；只在你管理的设备上信任它。
6. 管理电脑可先使用 `https://localhost:8443` 登录。私密部署包应有 564 份达人档案；源码版尚未导入名单，可先新增档案验证功能。脚本还会显示实际内网地址；需完成下一节的网络配置后，其他电脑才能访问。

这些启动器只对包内 `windows-*.ps1` 清除下载标记，并为当前 PowerShell 进程使用 RemoteSigned；不改变全局执行策略。建议先查看脚本内容。Windows 系统安全提示由你确认，不应关闭签名或 TLS 校验来解决错误。

## 允许同一局域网的其他电脑访问

将当前可信家庭/办公网络设置为 Windows **专用网络**（不要把陌生 Wi-Fi 改为专用）。然后在解压目录打开 **管理员 Windows PowerShell**，运行：

```powershell
Unblock-File .\deploy\windows-firewall.ps1
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\deploy\windows-firewall.ps1
```

Docker 默认仅绑定本机回环地址。此管理员脚本让 Windows 把选定私有 IPv4 的 8443 转发到本机 Docker，并只允许**专用网络、本地子网**访问。不绑定公网 IPv4 或 IPv6，不开放 3000，也不在路由器中配置端口转发或公网隧道。Windows IP Helper 服务须能运行。

其他 Windows 电脑不需要安装 Docker，但需要信任同一个根证书：

1. 从管理电脑私密复制 `lan-certificate\root.crt`。只复制公共 `root.crt`，不要复制任何私钥、`.env.lan` 或 Docker 证书卷。
2. 在管理电脑和访问电脑分别运行 `Get-FileHash .\root.crt -Algorithm SHA256`（使用各自实际路径），通过可信方式核对指纹一致。
3. 双击该证书，选择安装到**当前用户 → 受信任的根证书颁发机构**。也可运行 `Import-Certificate -FilePath .\root.crt -CertStoreLocation Cert:\CurrentUser\Root`。
4. 重新打开 Edge/Chrome，访问管理电脑打印的 HTTPS 内网地址，输入管理密码。

不要忽略证书警告后输入密码。若提示证书不可信，先确认访问 IP 正确、指纹一致，并已在当前浏览器用户对应的 Windows 账户安装证书。手机等其他设备需按各自系统的证书信任方式配置，当前脚本只针对 Windows。

## 日常使用与备份

- 后续启动：打开 Docker Desktop，再双击 `windows-start.cmd`。首次创建的 Compose 项目名为 `influencers-lan`，不要改变项目名。
- 停止：双击 `windows-stop.cmd`。数据库与证书卷保留。
- 备份：服务运行时双击 `windows-backup.cmd`，将备份写入包目录 `backups\`。备份已检查数据库完整性和记录数；再复制到另一块私有磁盘，不能只依赖本机 Docker 数据卷。
- 不执行 `docker compose down -v`，不删除 Docker Desktop 数据或重置到出厂状态；这些操作可能删除业务数据库与根证书。
- 建议在路由器为管理电脑保留固定 DHCP 地址。IP 改变后只更新 `.env.lan` 的 `LAN_IP` 行并重新启动，还需审阅并更新旧防火墙规则和 Windows 端口映射；网络脚本不会自动覆盖旧规则。不要改动密码哈希或删除业务卷。
- 若以后增加或修改档案，重新启动不会还原到 564 份初始数据。安装包的数据库只是初始快照，备份才保存后续业务变化。

Windows 配置只存本机 `.env.lan`，权限限制为当前用户、SYSTEM 和管理员；不上传到 Git。密码访问统一由 Caddy 保护，应用端口不直接发布；尚不是多用户角色权限系统。

## 验证范围

Linux 容器中的局域网 Compose 配置已验证 HTTPS、认证、静态资源、数据副本恢复、重启持久化和备份。PowerShell 脚本经过语法与可移植逻辑检查；当前云执行环境不是 Windows，无法替你安装 Docker Desktop、配置真实 Windows 防火墙、导入你的证书或验证实际局域网连通性。只有你在管理电脑完成上述步骤后，内网地址才会可用。
