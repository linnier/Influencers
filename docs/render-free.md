# Render 免费试部署

部署当前2.4.16网站到独立Render Free服务，继续连接原Lark Base。内网服务可继续运行；未完成的原导入页不要刷新、关闭或搬到新网址。先在云端核对读取结果，完成试用后再修改Lark应用入口。

## 注册和创建

1. [注册Render](https://dashboard.render.com/register)，可以用GitHub账号登录。
2. [打开本仓库的部署入口](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Flinnier%2FInfluencers)。如提示连接GitHub，仅授权本仓库即可。
3. 核对只创建一个Web Service，方案为 **Free**、区域为 **Singapore**。仓库根目录的render.yaml已设置 `rootDir: itea-creator-hub`、Node24、Lark模式、端口监听及健康检查。不创建额外数据库或磁盘。
4. 在Render提示的环境变量表单中填写下表，只在Render保存这些值。
5. 点击创建部署，等待状态变为 **Live**。Render分配的实际HTTPS网址显示在服务页面；以该网址为准，不预先猜测网址。

## 需要填写的4项

| 变量 | 填写内容 |
| --- | --- |
| TEAM_PASSWORD | 网站团队登录密码，至少16位；可以沿用内网密码。用户名固定为team。 |
| LARK_APP_ID | 现有Lark应用的App ID。 |
| LARK_APP_SECRET | 同一个Lark应用的App Secret。 |
| LARK_SOURCE_URL | 现有达人库所在Lark多维表格的完整HTTPS链接，支持 `/base/…` 或 `/wiki/…`。不要填内网网站网址或开发者后台网址。 |

App ID和Secret可在Lark开发者后台“凭证与基础信息”查看。原网站的 `.runtime/local-config.json` 也保存了已有配置，可在自己电脑上查看并复制对应值，但不要上传该文件、发送截图或提交到GitHub。

如果你只有原始Base token而没有完整链接，使用下面的手动部署方式，将变量改为 `LARK_BASE_TOKEN`。如果wiki解析权限不足，在Render Environment删除LARK_SOURCE_URL并设置正确的LARK_BASE_TOKEN后重新部署。负责人字段是Lark人员类型时，需同时复制已有LARK_MEMBER_MAP配置；文本负责人不需要。

## 部署后的检查

1. 打开Render给出的HTTPS网址，用team和设置的密码登录。
2. 打开该网址下的 `/api/connection`，应显示 `mode: lark`、`configured: true`、`build: 2.4.16`。这只代表配置齐全，不代表真实Base读取已经通过。
3. 返回首页，确认能读取现有项目。进入十五周年庆，在全部平台、全部负责人筛选下核对人数和Post，先不新增或修改真实数据。
4. 让一位外网同事打开同一HTTPS网址并登录，核对能看到相同数据。
5. 读取验证通过后，将Lark开发者后台网页应用的桌面端、移动端主页改为该HTTPS网址，保存并发布版本。保留已使用的浏览器打开配置。网站目前仍为团队密码登录，尚未接入Lark身份免登录。

云端和内网读取同一个Base，修改会同步影响同一份数据。试用期间避免两端同时进行导入或修改。

## 后续更新

本配置关闭GitHub推送自动部署，避免推送补丁时打断导入。需要更新时先完成正在进行的操作，再在Render服务页面选择 Manual Deploy → Deploy latest commit。部署时不要同时跑导入。

## 免费限制

闲置15分钟会休眠，再次打开约需1分钟；每月免费小时和流量等额度受Render当期规则限制。免费实例本机文件在重启或重新部署后不保留，因此业务数据必须使用原Lark Base，密码和Lark密钥使用Render环境变量。不能把Windows的.runtime目录当作云端永久存储。正式长期使用再评估付费实例。

## 部署入口无法使用时

Render → New → Web Service，选择 `linnier/Influencers`，填写：

| 设置 | 值 |
| --- | --- |
| Branch | main |
| Root Directory | itea-creator-hub |
| Runtime | Node |
| Region | Singapore |
| Instance | Free |
| Build Command | npm install --omit=dev && npm run check |
| Start Command | npm start |
| Health Check Path | /health |
| Auto-Deploy | Off |

环境变量设置 `HOST=0.0.0.0`、`DATA_BACKEND=lark`、`NODE_VERSION=24.19.0`、`DATA_DIR=/tmp/itea-runtime`，再填写TEAM_PASSWORD、LARK_APP_ID、LARK_APP_SECRET，以及LARK_SOURCE_URL或LARK_BASE_TOKEN其中之一。无需手动设置PORT，Render会提供。

部署失败时提供隐藏所有密钥后的构建或运行错误；不要分享Environment值或完整本机配置文件。

[Render官方部署入口说明](https://render.com/docs/deploy-to-render) · [免费版限制](https://render.com/docs/free)

## Lark 邮箱邀约与报名

2.4.16新增正式工作流，按 [邮箱上线说明](lark-mail-launch.md) 配置邮件用户权限和回调地址，再在项目的“邀约与报名”中启用并授权 collab@itea.sg。不能使用应用 tenant_access_token 代替邮箱用户授权。Render 免费实例不支持常用 SMTP 端口，本版使用 HTTPS Mail API。

## 2.4.16 建表修复

修复首次点击“启用邀约与报名”时的 `1254001`：Lark 要求指定默认视图名称时必须同时提供初始字段，本版随建表请求提交“工作流ID”和“数据”两个文本字段。已有同名表只补缺失字段，不重复建表。请求格式错误会明确提示参数问题，不再一律提示权限不足。此修补不发送邮件，也不修改原有达人、合作或 Post 记录。

更新方式：Render → Manual Deploy → Deploy latest commit，等待 Live 后刷新网站，再点“启用邀约与报名”。可在 `/api/connection` 核对 build 为 `2.4.16`。如果后续出现新的权限错误，再按具体错误开通对应权限。

