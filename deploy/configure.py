"""Run on the target server: credentials stay on that server, never in argv/logs."""
import getpass
import os
from pathlib import Path
import re
import subprocess

CADDY = "caddy:2@sha256:f2a1290d0463aad60660d4ec134943f183ee2a5f6c3eb7bf32dd984f2f020772"
root = Path(__file__).resolve().parents[1]
target = root / ".env.production"
if target.exists():
    raise SystemExit(".env.production 已存在；为避免覆盖访问凭据，请在服务器上自行审阅和修改。")
template = root / "deploy/Caddyfile"
if not template.is_file() or "{$ADMIN_PASSWORD_HASH}" not in template.read_text():
    raise SystemExit("Caddy 模板缺失或已修改，请先检查部署文件。")
# This template contains placeholders only, not credentials. The constrained
# root proxy must be able to read it without DAC bypass capabilities.
template.chmod(0o644)
domain = input("网站域名（例如 creators.example.com，不含协议）：").strip().lower()
labels = domain.split(".")
if len(domain) > 253 or len(labels) < 2 or all(label.isdigit() for label in labels) or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels):
    raise SystemExit("请使用已指向服务器的有效域名。")
username = input("管理员用户名 [admin]：").strip() or "admin"
if not re.fullmatch(r"[A-Za-z0-9_.-]{1,32}", username):
    raise SystemExit("用户名只能包含字母、数字、点、下划线和短横线。")
password = getpass.getpass("管理员密码（至少 12 位，输入不显示）：")
if len(password) < 12 or len(password.encode()) > 72 or "\n" in password or "\r" in password:
    raise SystemExit("密码须至少 12 个字符且不超过 72 字节，不包含换行。")
if getpass.getpass("再次输入密码：") != password:
    raise SystemExit("两次密码不一致。")
result = subprocess.run(["docker", "run", "--rm", "-i", CADDY, "caddy", "hash-password", "--algorithm", "bcrypt", "--bcrypt-cost", "14"], input=password + "\n", text=True, capture_output=True)
password = ""
match = re.search(r"\$2[aby]\$14\$[./A-Za-z0-9]{53}", result.stdout)
if result.returncode or not match:
    raise SystemExit("密码哈希生成失败，请检查 Docker 和镜像访问；未保存任何凭据。")
contents = f"SITE_DOMAIN={domain}\nADMIN_USERNAME={username}\nADMIN_PASSWORD_HASH='{match.group()}'\n"
descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, "w") as handle:
    handle.write(contents)
print("已保存服务器本地配置（权限 600）；仅保存密码哈希，未保存明文密码。")
