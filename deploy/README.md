# 服务器部署

这套配置面向单台 Linux 服务器，使用 Docker Compose、Caddy HTTPS 和密码访问。应用容器以非 root 用户运行，SQLite 保存在独立卷中；重建应用不会删除数据。仅代理开放 80/443，应用 3000 和 Caddy 管理接口均不对外开放。

登录采用浏览器原生用户名/密码提示，不是团队权限系统。所有页面、接口和静态文件都经过代理认证；不能绕开 Compose，单独把应用端口发布到公网。

## 1. 准备服务器和域名

- 建议 Ubuntu 24.04，2 核 CPU、至少 2 GB 内存、40 GB 磁盘，安装官方 Docker Engine 和 Compose 插件。
- 服务器开通和费用需由你在云服务商账户中确认；当前尚未创建或付费购买任何服务器。
- 将网站域名的 A 记录指向公网 IPv4。有 AAAA 记录时，须确认 IPv6 也能到达本机，否则移除错误 AAAA 记录。
- 云安全组允许 80/443 入站；SSH 22 尽量只允许管理者 IP，不开放 3000、2019 或 Docker API。
- 安装 Docker 请使用 [官方 Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/)，保持仓库签名和 TLS 校验。加入 docker 组相当于授予服务器管理权限。

IP 和 SSH 用户名可以发给助手；密码、私钥和登录密码仅通过云平台安全方式或服务器终端配置，不在聊天中发送。首次 SSH 连接核对云平台提供的主机指纹，不跳过主机密钥验证。

## 2. 上传部署包

部署包包含应用源代码和 `initial-data/influencers.sqlite` 的一致性备份。数据库包含达人联系方式，须通过 SSH/SCP 私密上传，不放入公开存储桶或 Git。

本机可用以下命令重新生成私有部署包（Python 标准库，无额外依赖）：

```bash
python3 scripts/package-deployment.py --output /tmp/influencers-server.tar.gz
```

将文件上传并解压到服务器，例如 `/opt/influencers-release`；保持包内 `Influencers` 目录不变。服务器上进入该目录：

```bash
cd /opt/influencers-release/Influencers
```

也可直接上传仓库源代码，但必须另外导出并传输 SQLite 一致性备份。不要直接复制正在写入的 SQLite 主文件而忽略 WAL。

## 3. 在服务器安全设置访问凭据

```bash
python3 deploy/configure.py
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production build app
bash deploy/restore-data.sh "$PWD/initial-data/influencers.sqlite"
docker compose --env-file .env.production up -d
```

配置脚本会询问域名、用户名及至少 12 位的密码。明文密码只经本机标准输入传给 Caddy，既不放入进程参数，也不保存到文件；`.env.production` 仅保存 bcrypt 哈希，权限为 600。脚本拒绝覆盖已有配置。不要展示 `.env.production` 或运行会打印配置内容的 `docker compose config`，验证时使用 `config --quiet`。

部署包内可包含已通过 TLS 与锁文件完整性校验的公共 npm 缓存。如果构建容器无法解析 npm 域名，可使用 `docker compose --env-file .env.production build --build-arg NPM_OFFLINE=true app`；离线安装仍校验锁文件中的完整性值，不关闭签名、校验和或 TLS。当前云环境中的完整容器构建使用了这一模式。缓存针对当前 Linux amd64 平台；其他 CPU 架构需要在相应平台重新下载依赖。只有 Git 源码时不包含生成缓存，在线构建需能访问 npm 官方仓库。

恢复脚本仅写入空目标，目标数据库已经存在时拒绝覆盖；应用运行时也拒绝恢复。它验证数据库完整性、外键和记录数。当前准备的初始数据库应包含 **564** 份达人档案。不要在升级时重复恢复初始数据，也不要使用 `docker compose down -v`，否则会删除业务卷和证书卷。

Caddy 会为已指向服务器的域名申请可信证书，并把 HTTP 重定向至 HTTPS。公网域名和 80/443 可达之前，证书申请无法完成。不要在 HTTP 中输入管理员密码。

## 4. 验证上线

```bash
docker compose --env-file .env.production ps
curl --fail --silent --show-error --user admin https://你的域名/api/health
```

`--user admin` 会在本地终端提示输入密码，不在命令行中拼接密码。健康接口应返回 `{"status":"ok"}`。无凭据访问页面或 `/api/workspace` 应返回 **401**。在浏览器打开 HTTPS 域名，输入配置的用户名和密码，确认达人总数 564、平台筛选、详情和修改操作正常，再投入使用。

本地容器验证使用独立卷、测试密码和受信任的本地 CA，不等于公网域名证书或服务器连通性已验证。当前没有目标服务器，尚未上线，也没有可访问的公网地址。

有 Docker 和本地镜像时，可运行 `python3 tests/deployment_smoke.py`；测试镜像名默认 `influencers-app:deployment-test`，可用 `INFLUENCERS_TEST_IMAGE` 指定。该测试验证 HTTPS、密码访问、静态资源保护、真实数据副本恢复、重启持久化、备份与拒绝覆盖，仅清理随机命名的测试卷，不操作生产卷。

## 备份与升级

运行中的数据库使用 SQLite 官方在线备份接口：

```bash
bash deploy/backup.sh
```

脚本检查完整性与记录数，把备份复制到服务器的 `backups/`，文件权限为 600；它不会清空、覆盖或删除业务库。请把备份再复制到独立的私有存储，并设置定时备份。只保存在同一服务器上无法防止服务器损坏或删除。

升级先备份，再上传新源代码、构建并启动：

```bash
bash deploy/backup.sh
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d
```

保留现有 `.env.production`、Compose 项目名 `influencers` 和持久化卷。不要执行初始化恢复。恢复历史备份属于替换业务数据的操作，须先停服务并另行备份当前库；提供的恢复工具默认拒绝覆盖，避免误删已有数据。

数据库未写入 Docker 镜像。镜像基于已校验的官方 Node 24、Caddy 2 镜像摘要，并使用锁文件安装依赖；升级镜像版本需重新构建并验证。
