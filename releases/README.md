# 2.4.14 网站内登录页

[下载累计升级包](itea-creator-hub-upgrade-2.4.14.zip)

itea创作者管理 2.4.14 网站内登录页

账号仍为team，密码沿用TEAM_PASSWORD。新增正式网站内登录页面、密码显示切换、错误提示和退出登录。成功登录使用12小时有效的HttpOnly会话；Render HTTPS下使用Secure Cookie。同一密码下会话可跨免费实例重启，修改密码后原会话失效。保留原API客户端的显式Basic凭据兼容，新浏览器访问网站不再出现Basic登录弹窗。

Render更新：先完成当前导入或保存匹配草稿，再打开itea-creator-manager服务，选择Manual Deploy → Deploy latest commit。等待Live后打开 https://itea-creator-manager.onrender.com/login 。账号team，密码为已有TEAM_PASSWORD，不需要改Lark配置。没有Render操作授权的聊天助手不能代你点击部署。

Windows内网更新：在网站后台Ctrl+C停止，解压本包进入含install-update.mjs内层目录，运行node install-update.mjs，填原itea-creator-hub文件夹路径。升级后回原目录运行node setup-local.mjs，再在网站内登录。不删除.runtime、配置或业务记录。备份路径由安装程序显示，可停止网站后运行备份目录的node restore.mjs回滚。

本版保留此前项目管理、Post数据、达人效果、分币种费用、发券数量汇总、账号关联和服务器自动分批修复。

另有“邀约与报名、名单与人工发券”交互设计预览，固定演示发件人为collab@itea.sg；该部分仍为虚构数据原型，未接通Lark邮箱、公开报名服务或实际发券记录接口，不随本升级包启用。确认设计后另行实现。

已通过登录/退出/跨站请求/会话篡改/过期/密码变更/错误限次、Render启动、已有业务保存及模拟Lark回归测试；真实云端登录由重新部署后验证。

SHA256: 788d887f546bedd133434e4e8a64b9380036d4b3d2fe69a46e323cb758785a45
