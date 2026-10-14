# Influencers

itea 创作者管理网站，当前源码版本 **2.4.7**。支持小红书、Instagram、TikTok，业务数据通过 Lark Base 保存。

- [完整网站源码](itea-creator-hub)
- [2.4.7 累计升级包](releases/itea-creator-hub-upgrade-2.4.7.zip)
- [安装与升级说明](releases/README.md)

包含达人资料绑定已有账号、按达人合并合作平台、Post 录入与编辑、互动量自动合计、Excel 多平台导入、分币种费用及券包统计。

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
```

测试使用虚构数据和模拟 Lark。已验证本地交互、批量关联、数据保留与安装回滚；真实 Lark 保存和 Windows 显示需在安装后验证。
