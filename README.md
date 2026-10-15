# Influencers

itea 创作者管理网站，当前源码版本 **2.4.13**。支持小红书、Instagram、TikTok，业务数据通过 Lark Base 保存。

- [完整网站源码](itea-creator-hub)
- [2.4.13 累计升级包](releases/itea-creator-hub-upgrade-2.4.13.zip)
- [安装与升级说明](releases/README.md)

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

2.4.13修复详情沿用旧平台筛选的问题：进入项目默认全部平台，并明确显示项目人数、筛选人数及范围；筛选后可一键查看项目全部数据。修复仅影响展示，不修改Lark业务记录。

单笔合作仅1条选中笔记时自动记合作费和发券数，隐藏无意义的选择框；多条笔记保留记账选择。`npm run test:bulk-ui`验证单条及多条混合导入。

2.4.13 将服务器整次20项拒绝改为服务器自动分组顺序写入，先校验全部字段与关联，保留版本冲突、2500项上限与失败停止保护。兼容仍打开的旧导入页，保留匹配草稿与发券汇总功能。当前页仍有匹配时不要刷新，按升级说明先重启后台，在原页继续导入，成功后再刷新。
