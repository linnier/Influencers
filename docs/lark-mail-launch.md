# 2.4.18：共享邮箱邀约、报名审核与人工发券登记

正式网站：https://itea-creator-manager.onrender.com

发件邮箱固定为 `collab@itea.sg`。该地址是团队共享邮箱时，使用有权限访问它的个人 Lark 账号授权。网站会核对可访问邮箱列表，识别类型为 PUBLIC_MAILBOX 的目标邮箱；草稿、发送、投递查询都明确指定该共享邮箱。不会把其他个人邮箱当作替代发件人。

## 部署新版

Render → itea-creator-manager → **Manual Deploy → Deploy latest commit**，等待 Live。登录网站后可在 `/api/connection` 核对 build 为 `2.4.18`。GitHub 推送不会自动部署，之前的邀约匹配和导入操作应完成后再部署。

沿用现有 TEAM_PASSWORD、LARK_APP_ID、LARK_APP_SECRET 及 LARK_SOURCE_URL／LARK_BASE_TOKEN。Render 自动提供 RENDER_EXTERNAL_URL；自定义域名时可设置 PUBLIC_BASE_URL 为该固定 HTTPS 地址，不带末尾斜杠。

## Lark 应用权限及回调

在与 Render LARK_APP_ID 对应的原应用中配置，保留已有 Base 权限。邮件使用用户身份授权：

| 权限 | 用途 |
| --- | --- |
| `mail:user_mailbox:readonly` | 获取主邮箱及有权访问的共享邮箱列表 |
| `mail:user_mailbox.message:modify` | 创建邀约草稿 |
| `mail:user_mailbox.message:send` | 用户确认后发送邀约 |
| `mail:user_mailbox.message:readonly` | 查询投递状态 |
| `offline_access` | 持续访问已授权数据，用于自动续期 |

需要时完成管理员审批，并发布应用新版本。若权限已经配置，2.4.18 无需新增邮件权限。

“安全设置 → 重定向 URL”添加：

```
https://itea-creator-manager.onrender.com/auth/lark-mail/callback
```

首次启用工作流需原 Base 的表、字段创建及记录读取、新增、编辑权限，包括 `base:table:create` 和 `base:field:create`。原 Base 内另建“协作工作流”表，原五张业务表保留。2.4.16 已修复初始字段请求格式，2.4.17 已兼容成功的空列表省略 items，以及空白占位行；重复启用只补缺失字段。

## 授权共享邮箱

1. 确认你的个人 Lark 账号已加入 `collab@itea.sg` 共享邮箱，并能以该地址发信；由公司邮箱管理员管理成员和权限。
2. 在正式网站登录，进入项目 → **邀约与报名**。首次点击“启用邀约与报名”；工作流表已有时直接进入筛选界面。
3. 点击 **连接 Lark 邮箱**，使用上述个人账号登录 Lark。授权页显示个人姓名是正常的，不需要把共享邮箱当作独立 Lark 账号登录。
4. 核对权限并点击 Authorize，在同一个浏览器中回到网站。重新进入邀约与报名，应显示 **共享邮箱已授权**，发件人为 `collab@itea.sg`。

独立账号的主邮箱恰为 collab@itea.sg 时也继续支持。若当前个人账号的可访问列表没有这个共享邮箱，网站拒绝保存新授权；已有有效授权保留。群组邮件地址不作为共享邮箱接受。实际发信仍受 Lark 对共享邮箱的发信权限和自动化设置约束，接口拒绝时不会改用个人邮箱重发。

授权链接目前有效期10分钟。配置权限、回调地址或更换浏览器后，回网站重新点“连接 Lark 邮箱”，使用新链接完成授权。不会仅因授权成功就发送邮件。

不要在聊天、GitHub 或 Render 中填写邮箱登录密码；邮箱授权在 Lark 页面完成。App Secret 只保存在服务器环境变量中。

## 业务流程

- **筛选邀约**：平台、最低／最高粉丝数、名称／itea账号／邮箱／标签／地区；缺邮箱不可选择。每次最多100人，同一项目同一达人只建一份邀约。
- **确认发送**：设置项目币种金额、券数、截止日和模板，逐人预览实际收件人及正文后确认。每位达人单独收信、获得专属报名链接。“已提交邮箱”表示已被服务接收，投递状态可查询。
- **公开报名**：可以创建可转发的公开报名链接，接收新达人资料。公开报名中的填写邮箱不代表邮箱所有权已经验证，审核人需核对归属。
- **报名审核**：专属邀约关联原达人；公开报名按 itea账号、邮箱、平台账号精确匹配，冲突由审核人确认。确认合作后创建或关联达人、账号及合作记录，不自动生成Post。
- **领券身份**：itea账号即领券账号；WhatsApp／微信单独保存为联系方式。
- **名单与发券**：已确认合作按达人一行汇总各平台导出CSV，可用Excel打开。发券仍在公司原系统人工操作，网站只登记实际张数和日期，不调用发券系统。
- **费用**：历史Post发券和人工台账合计计入券数及SGD券费，每张S$3。一次发放只在一处记录；人工台账不再写回多个平台Post，不分摊到Post效果指标。已设置约定数量时不能超过剩余券数。
- **中断核查**：发送中／结果未知时先在共享邮箱核查草稿及已发送记录，系统不自动重发。审核保存中时保留原内容重试；人工登记在同一窗口重试沿用原批次。多人或两端操作时先刷新核对。

首次只对一个你能查收的测试达人邮箱预览并确认发送，收到后填写报名、核对匹配、审核确认。开发测试使用模拟Lark接口；真实邮箱授权、送达及Base写入以部署后试用为准，助手没有向任何实际达人发送邮件。

## 存储及免费服务

Render 免费版阻止SMTP端口25／465／587，邮件通过HTTPS API发送。实例闲置可能休眠，首次打开网站或报名表可能需等约一分钟。

邀约、报名、人工发券和加密授权保存在Lark，不依赖Render临时文件。授权使用LARK_APP_SECRET派生密钥加密，修改App Secret后需重新授权。API不向浏览器返回邮箱令牌。请勿手动编辑工作流JSON。团队共享登录允许有网站密码的同事确认邀约和审核，目前没有额外管理角色。

验证：`npm run check`、`npm run test:invites`、`npm run test:mail`、`npm run test:lark`、`npm run test:render`。交互测试需要安装开发依赖。

接口依据：[Lark官方邮箱接口定义](https://github.com/larksuite/cli/blob/main/internal/registry/catalog/services/mail.json)、[共享邮箱发送参数说明](https://github.com/larksuite/cli/blob/main/skills/lark-mail/references/lark-mail-send.md)、[Render免费限制](https://render.com/docs/free)。
