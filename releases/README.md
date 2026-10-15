# 2.4.18 团队共享邮箱授权

[下载累计升级包](itea-creator-hub-upgrade-2.4.18.zip) · [Render部署及共享邮箱设置](../docs/lark-mail-launch.md)


## 2.4.18 团队共享邮箱

允许有权使用 collab@itea.sg 共享邮箱的个人Lark账号授权。通过 accessible_mailboxes 精确核对目标公共邮箱；草稿、发送、投递查询均明确使用该邮箱，From 固定为 collab@itea.sg。无成员权限或返回邮件群组时拒绝新授权；不会改用个人邮箱发信。原主邮箱直接授权继续支持，现有邮件权限、offline_access 和回调地址可沿用。界面显示“共享邮箱已授权”。

更新后在网站重新点击连接邮箱，使用自己的Lark账号完成授权。详见 [邮箱设置说明](../docs/lark-mail-launch.md)。`npm run test:mail`验证共享邮箱边界及主邮箱兼容；邮件接口测试为模拟，不代表已向达人发信。

SHA256: e012d80f0d6cab8b2005e2555fbe9c6ff9b44b7e4f382d748a7699e5e8e2dc58
