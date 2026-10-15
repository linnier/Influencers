# Influencers

itea 创作者管理网站，当前源码版本 **2.4.14**。支持小红书、Instagram、TikTok，业务数据通过 Lark Base 保存。

- [完整网站源码](itea-creator-hub)
- [2.4.14 累计升级包](releases/itea-creator-hub-upgrade-2.4.14.zip)
- [安装与升级说明](releases/README.md)

## Render 免费试部署

[打开免费部署入口](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Flinnier%2FInfluencers) · [逐步部署说明](docs/render-free.md)

根目录 render.yaml 预设一个新加坡Free Web Service，运行本仓库2.4.13源码，继续使用原Lark Base。首次需要在Render填写团队密码、Lark App ID、App Secret和Base/wiki完整链接。密钥只在Render设置，不提交到仓库。当前配置关闭代码推送自动部署，后续在Render手动部署最新版，避免打断导入。

Render已部署为 https://itea-creator-manager.onrender.com ，代码更新后需手动Deploy latest commit。当前内网导入页仍有匹配时，保持原页，不刷新、不迁移到新网址。云端先验证读取，再修改Lark应用入口。

项目列表 → 进入项目 → 合作管理 / Post数据 / 达人效果 / 项目总览。报名与合作状态筛选放在合作管理中，已有Post的达人显示在达人效果中。

包含达人效率卡、阅读/互动/合作价格汇总、CPM/CPE与排序、达人资料绑定已有账号、按达人合并合作平台、Post 录入与编辑、互动量自动合计、Excel 多平台导入、分币种费用及券包统计。

Node.js 24 下进入 `itea-creator-hub` 运行 `node setup-local.mjs`。首次向导在本机设置 Lark 配置和团队密码，配置保存在 `.runtime`；这些配置和业务数据不在仓库中。

运行源码检查和离线测试：

```sh
cd itea-creator-hub
npm install
npm run check
npm test
npm run test:lark
npm run test:bulk
npm run test:multi
npm run test:release
npm run test:update
npm run test:workflow
npm run test:creator
```

测试使用虚构数据和模拟 Lark。已验证本地交互、批量关联、数据保留与安装回滚；真实 Lark 保存和 Windows 显示需在安装后验证。

2.4.10修复详情沿用旧平台筛选的问题：进入项目默认全部平台，并明确显示项目人数、筛选人数及范围；筛选后可一键查看项目全部数据。修复仅影响展示，不修改Lark业务记录。

单笔合作仅1条选中笔记时自动记合作费和发券数，隐藏无意义的选择框；多条笔记保留记账选择。`npm run test:bulk-ui`验证单条及多条混合导入。

2.4.13 将服务器整次20项拒绝改为服务器自动分组顺序写入，先校验全部字段与关联，保留版本冲突、2500项上限与失败停止保护。兼容仍打开的旧导入页，保留匹配草稿与发券汇总功能。当前页仍有匹配时不要刷新，按升级说明先重启后台，在原页继续导入，成功后再刷新。


2.4.14增加网站内账号密码登录及退出，账号team与原TEAM_PASSWORD保持一致。访问/login查看新页面。`npm run test:login`验证会话及登录流程。

[交互原型HTML](previews/itea-workflow.html)：登录、项目内达人筛选、collab@itea.sg邀约预览、报名匹配审核、导出名单及人工发券登记。此原型使用虚构数据，不会真实发送邮件或修改Lark，尚未接入生产业务接口。
