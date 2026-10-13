param([string]$CertificatePath, [string]$ExpectedSha256)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw '此证书安装脚本需要 Windows。' }
if (-not $CertificatePath) { $CertificatePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'lan-certificate/root.crt' }
if (-not (Test-Path -LiteralPath $CertificatePath)) { throw '请先启动系统，或从管理电脑私密复制 root.crt。' }
$digest = (Get-FileHash -LiteralPath $CertificatePath -Algorithm SHA256).Hash
if ($ExpectedSha256 -and $digest -ine $ExpectedSha256) { throw '证书指纹不匹配，拒绝安装。' }
$cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2($CertificatePath)
if ($cert.HasPrivateKey -or $cert.Subject -notlike '*Caddy Local Authority*' -or $cert.NotAfter -le (Get-Date)) { throw '不是预期的有效 Caddy 公共根证书，拒绝安装。' }
Write-Host ('将为当前 Windows 账户信任本系统的根证书，SHA256：{0}' -f $digest)
Import-Certificate -FilePath $CertificatePath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
Write-Host '已安装到当前账户的受信任根证书存储。请重新打开 Edge 或 Chrome，再登录系统。'
