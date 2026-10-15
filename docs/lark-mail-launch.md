# 2.4.16：上线达人邀约、报名审核与人工发券登记

正式网址：https://itea-creator-manager.onrender.com

代码更新后仍需在 Render 手动部署，再由 `collab@itea.sg` 完成一次 Lark 邮箱用户授权。上传 GitHub 本身不会部署，也不会发送任何邀约。

## 1. 部署新版

1. Render → `itea-creator-manager` → **Manual Deploy → Deploy latest commit**。
2. 等待 **Live**，打开网站，用原 `team` 账号密码登录。
3. 已有 `LARK_APP_ID`、`LARK_APP_SECRET`、`LARK_SOURCE_URL`、`TEAM_PASSWORD` 保持原配置。本版自动使用 Render 提供的 `RENDER_EXTERNAL_URL` 作为正式网址；使用自定义域名时另设 `PUBLIC_BASE_URL` 为该 HTTPS 域名，不带结尾斜杠。
4. 在网站打开 `/api/connection`，确认 `build` 是 **2.4.16**。该接口仅说明配置齐全，真实读取以项目页面为准。

## 2. 给原 Lark 应用添加权限

在原应用的开发者后台操作，沿用连接达人库的同一 App ID，无需创建第二个应用。

“权限管理”中添加以下 **用户身份** 邮件权限，并按公司审批要求发布新版本：

| 权限标识 | 用途 |
| --- | --- |
| `mail:user_mailbox:readonly` | 验证授权邮箱确实是 collab@itea.sg |
| `mail:user_mailbox.message:modify` | 创建邀约邮件草稿 |
| `mail:user_mailbox.message:send` | 用户确认后发送草稿 |
| `mail:user_mailbox.message:readonly` | 查询投递状态 |

原应用的 Base 读写权限继续保留。启用新工作流还需创建表及字段的权限 `base:table:create`、`base:field:create`，以及现有记录读取、新增和编辑权限。若新版权限需企业管理员批准，先完成批准和应用发布。应用可用范围应包含 collab 邮箱对应的 Lark 用户和操作人员。

在“安全设置”的 **重定向 URL** 中添加以下完整地址，字符必须一致：

```
https://itea-creator-manager.onrender.com/auth/lark-mail/callback
```

授权过程中还会申请 `offline_access`，用于续期用户授权。它是 OAuth 授权范围；如果 Lark 没有返回刷新令牌，网站会显示“到期需重新授权”，届时重新连接邮箱。

## 3. 在网站授权邮箱

1. 项目列表 → 进入项目 → **邀约与报名**。
2. 首次点 **启用邀约与报名**，在原 Base 中补建独立的“协作工作流”表，以及此前缺失的导入字段。原有五张业务表及记录保留。
3. 点 **连接 Lark 邮箱**，在 Lark 页面登录 **collab@itea.sg** 对应的独立账号并同意授权。
4. 授权后回到网站，再进入“邀约与报名”，应显示 **Lark 邮箱已授权**。如果误用其他账号，网站会拒绝保存授权。

不要在 Render 填邮箱登录密码，不需要 SMTP 授权码，也不要把 App Secret、密码、授权地址中的 code/token 发到聊天或提交 GitHub。

## 4. 第一次试用

先使用一个你能收信的测试达人邮箱，在网站预览实际收件人、标题和全文，确认后只发送这一封。收到后填写报名表，回网站刷新“报名审核”，核对匹配结果后确认合作。真实邮件是否送达、真实 Lark 写入是否成功，以这次试用为准；开发验证使用模拟接口，未替你向任何达人发送邮件。

- **筛选邀约**：平台、最低／最高粉丝数、名称／itea账号／邮箱／标签／地区；缺邮箱不可选择。每次最多100人，同一项目同一达人只建一份邀约。
- **邮件确认**：每位达人独立一封、专属报名链接、设置金额、币种、券数、截止日；“已提交邮箱”不是已送达，可查询投递状态。
- **结果未知**：网络中断或部署重启可能使发送结果未知；系统不自动重发。先在 Lark 邮箱核查实际草稿及已发送记录，避免重复联系。
- **公开报名**：可用“创建公开报名链接”收集未在库中的达人。该链接可转发给申请者；收到报名后仍需人工审核，不按昵称相似自动合并。
- **审核匹配**：专属邀约绑定原达人；公开报名按 itea账号、邮箱、平台账号精确匹配并显示建议，冲突由审核人选择。确认后创建或关联达人、平台账号及合作记录，不生成Post。
- **领券身份**：itea账号就是领券账号；WhatsApp／微信单独保存在联系方式中。
- **名单与发券**：已确认合作按达人一行导出 CSV，可在 Excel 打开。券由公司原系统人工发放，网站只登记实际张数和日期，不调用发券系统。
- **费用口径**：人工台账和历史Post发券汇总到项目券数及SGD费用，人工台账不再写回各平台Post，也不分摊到Post效果指标。同一笔发放只在一个地方记录，避免重复。已约定券数时登记不可超过剩余数量。
- **中断恢复**：已保存邀约可到“邀约记录”继续确认发送；审核显示“审核保存中”时保留原审核内容重试。人工登记同一次窗口内重试沿用批次，不重复记账。跨实例或多人同时操作仍应先刷新核对。

## 部署说明

Render 免费服务阻止常用 SMTP 端口 25、465、587，本版通过 HTTPS Lark Mail API 发送。免费服务闲置后休眠，第一次打开网站或报名表可能需等待约一分钟。

业务工作流和加密后的邮箱令牌保存在 Lark Base，不依赖免费实例的临时文件；加密密钥由 LARK_APP_SECRET 派生，修改 App Secret 后需重新授权邮箱。Base 内工作流“数据”字段属于程序管理的 JSON，请不要手动编辑。只有网站服务器会解密令牌，API 不向浏览器返回令牌或加密授权记录。

授权基于团队共享登录，能登录的同事可以确认邀约、审核和登记发券。目前不区分管理角色，不是 Lark 身份免登录。

验证：`npm run check`、`npm test`、`npm run test:lark`、`npm run test:creator`、`npm run test:login`、`npm run test:render`、`npm run test:invites`。安装开发依赖后运行交互测试；Render 构建仅需生产依赖。

参考：[Render 免费限制](https://render.com/docs/free)、[Lark Mail SDK 接口定义](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/mail/v1/resource.go)。

## 2.4.16 建表修复

修复首次点击“启用邀约与报名”时的 `1254001`：Lark 要求指定默认视图名称时必须同时提供初始字段，本版随建表请求提交“工作流ID”和“数据”两个文本字段。已有同名表只补缺失字段，不重复建表。请求格式错误会明确提示参数问题，不再一律提示权限不足。此修补不发送邮件，也不修改原有达人、合作或 Post 记录。

更新方式：Render → Manual Deploy → Deploy latest commit，等待 Live 后刷新网站，再点“启用邀约与报名”。可在 `/api/connection` 核对 build 为 `2.4.16`。如果后续出现新的权限错误，再按具体错误开通对应权限。

