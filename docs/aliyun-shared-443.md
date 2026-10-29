# 阿里云共用 HTTPS 443：达人系统独立路径

版本 2.6.35 支持 `APP_BASE_PATH=/creators`，公开地址可配置为
`https://47.86.198.65/creators`。该 IP 的现有证书必须有效，且原有 443 服务可从公网访问。
不需要增加 8443 安全组规则。原门户首页、`/workbench/`、`/mile-art/`、
`/finance/`、`/feedback/` 等路径不作替换。

## 应用配置

- Node 24；既有 Lark、TEAM_PASSWORD 环境变量保持一致。
- `APP_BASE_PATH=/creators`
- `PUBLIC_BASE_URL=https://47.86.198.65/creators`
- `DISABLE_AUTOMATIC_REMINDERS=true`：迁移测试中禁用自动催促，避免两台服务同时执行。
- `HOST=0.0.0.0`，`PORT=3000`，容器只绑定 `127.0.0.1:8796:3000`。
- 继续使用原有 `/var/lib/itea-creator:/data` 数据挂载，不能同时启动两个容器读写此目录。
- 新版本直接启动 `node server.mjs`；不再使用临时 `server-migration.mjs`。
- HTTPS Cookie 从 PUBLIC_BASE_URL 自动启用。挂载路径有独立 Cookie 名称和路径。
- 代理必须保留 `/creators/` 前缀，不能使用会剥除前缀的 proxy_pass 尾斜杠形式。
- 内部健康检查为 `http://127.0.0.1:8796/creators/health`。

先保存旧容器作为回退；停掉旧测试容器，再以新配置启动并验证健康检查。
只有应用检查通过后，才修改 Nginx。

## 接入现有 Nginx

在仓库的 `itea-creator-hub` 目录运行：

```sh
python3 deploy/prepare-shared-nginx.py
```

默认目标为 `/etc/nginx/sites-enabled/itea-new-store-pmo`。工具会解析 server 块，
仅在该文件监听 443 的 server 块中新增 include，并创建
`/etc/nginx/itea-creator-location.conf`。该 include 只处理 `/creators` 和
`/creators/`，原有配置内容保留。主配置符号链接会解析到实际文件，不删除原链接。

工具先检查原配置，将其备份到 `/root/itea-nginx-backups/`；修改后再次运行
`nginx -t`。校验失败时恢复原配置。它不会自动重载，也不整理已有重复 server_name
或 sites-enabled 下的旧备份文件。

检查通过后由操作者执行：

```sh
systemctl reload nginx
curl --fail --max-time 10 --resolve 47.86.198.65:443:127.0.0.1 https://47.86.198.65/creators/health
```

再在外网验证新入口和原门户入口均可访问。不要使用 `curl -k` 跳过证书检查。

## 正式切换仍需完成

1. 实测外网登录、项目数据、公开表单加载和审核流程。
2. 核实 IP 证书的自动续期任务、HTTP 验证路径及续期后 Nginx reload hook。
   IP 证书有效期短，不能仅凭当前证书有效就认为续期已配置成功。
3. 在 Lark 开放平台配置新 OAuth 回调地址
   `https://47.86.198.65/creators/auth/lark-mail/callback`，确认平台是否接受该 IP 地址。
   新连接和邮箱授权不能仅凭本地 URL 生成测试视为可用。
4. Render 原链接继续保留，已发送给达人的旧链接不自动失效；不要在两台站点并行审核写入或并行发信。
5. 完成切换后再决定在哪一台启用自动催促。不要同时启用。
6. 8443 测试配置可以待新入口验证完成后单独移除，不影响其他站点。

## 回退

保留的旧容器用于回退（一次只运行一个）。Nginx 若需撤回，只移除工具新增的
include 行或恢复它打印的备份路径，先检查 `nginx -t` 再 reload；不要删除或覆盖其他
管理员后来修改的配置。Lark 数据、现有官网及其他容器不在回退操作范围内。
