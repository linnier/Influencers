# 2.4.17 空工作流表读取修复

[下载累计升级包](itea-creator-hub-upgrade-2.4.17.zip) · [Render部署及邮箱设置](../docs/lark-mail-launch.md)


## 2.4.17 空工作流表读取修复

兼容 Lark 成功响应在 total=0 或 has_more=false 时省略／置空 items 的格式，按零条记录读取。空白占位行不当作业务记录。非空、仍有下一页或结构错误的响应继续报错，保留分页完整性检查。新增表创建、空表读取、部分字段补齐、已有分页和报名审核交互均有离线回归测试；真实 Lark 的结果以部署后验证为准。

更新：Render → Manual Deploy → Deploy latest commit，等待 Live 后刷新页面并点“重新读取”。工作流表已存在时会直接进入邀约界面，无需重复建表。/api/connection 中 build 应为 2.4.17。此修补不修改达人、合作、Post 或已保存工作流记录。

SHA256: 0595725f5039df85b100ee855c365d37b5f637047cfde25ca5cf2d5b632e1d45
