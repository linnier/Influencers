#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-common.ps1')
$lanIp = Read-LanIPv4
$address = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -eq $lanIp } | Select-Object -First 1
if (-not $address) { throw '配置的内网 IP 不在本机，请先检查 .env.lan。' }
$profile = Get-NetConnectionProfile -InterfaceIndex $address.InterfaceIndex
if ($profile.NetworkCategory -ne 'Private') { throw '请先把当前可信网络设置为专用网络；本脚本不自动改变网络信任类型。' }
$ruleName = 'Influencers-LAN-8443'
if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) { throw '已有同名防火墙规则，请先审阅现有规则，不自动覆盖。' }
if (Get-NetTCPConnection -LocalAddress $lanIp -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue) { throw '此内网地址的 8443 端口已被占用，不自动覆盖。' }
$mapping = & netsh interface portproxy show v4tov4
if ($LASTEXITCODE -ne 0) { throw '无法检查已有的本机端口映射。' }
if (($mapping -join "`n") -match ('(?m)^\s*' + [regex]::Escape($lanIp) + '\s+8443\s+')) { throw '已有该地址的端口映射，请先审阅，不自动覆盖。' }
Start-Service -Name iphlpsvc
& netsh interface portproxy add v4tov4 "listenaddress=$lanIp" listenport=8443 connectaddress=127.0.0.1 connectport=8443
if ($LASTEXITCODE -ne 0) { throw '内网端口映射失败，未添加防火墙规则。' }
try {
    New-NetFirewallRule -Name $ruleName -DisplayName 'Influencers LAN HTTPS' -Direction Inbound -Protocol TCP -LocalAddress $lanIp -LocalPort 8443 -Action Allow -Profile Private -RemoteAddress LocalSubnet | Out-Null
} catch {
    & netsh interface portproxy delete v4tov4 "listenaddress=$lanIp" listenport=8443 | Out-Null
    throw '防火墙配置失败，已撤销本脚本新建的映射。'
}
Write-Host '仅允许私有网络的本地子网访问 8443；不开放公网配置。'
