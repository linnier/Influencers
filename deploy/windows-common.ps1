$ErrorActionPreference = 'Stop'
$script:BundleRoot = Split-Path -Parent $PSScriptRoot
$script:LanConfig = Join-Path $script:BundleRoot '.env.lan'
$script:LanCompose = Join-Path $script:BundleRoot 'compose.windows.yaml'
$script:CaddyImage = 'caddy:2@sha256:f2a1290d0463aad60660d4ec134943f183ee2a5f6c3eb7bf32dd984f2f020772'

function Test-PrivateIPv4([string]$Address) {
    if ($Address -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { return $false }
    $parsed = [System.Net.IPAddress]::None
    if (-not [System.Net.IPAddress]::TryParse($Address, [ref]$parsed)) { return $false }
    if ($parsed.ToString() -ne $Address) { return $false }
    $bytes = $parsed.GetAddressBytes()
    return ($bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168))
}

function Assert-LanDocker {
    if ($env:OS -ne 'Windows_NT') { throw '此启动脚本需要在 Windows 上运行。' }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw '请先安装并启动 Docker Desktop，使用 WSL 2 和 Linux 容器。' }
    $platform = & docker info --format '{{.OSType}}/{{.Architecture}}'
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop 尚未就绪，请启动 Docker Desktop 后重试。' }
    if ($platform -notmatch '^linux/(x86_64|amd64)$') { throw '此包的离线缓存适用于 Intel/AMD 64 位 Windows 的 Linux 容器。ARM 电脑需另行构建。' }
    & docker compose version
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose 插件不可用，请更新 Docker Desktop。' }
}

function Invoke-LanCompose {
    param([string[]]$DockerArguments, [switch]$Capture)
    if ($Capture) { $output = & docker compose --env-file $script:LanConfig -f $script:LanCompose @DockerArguments }
    else { & docker compose --env-file $script:LanConfig -f $script:LanCompose @DockerArguments }
    if ($LASTEXITCODE -ne 0) { throw 'Docker 操作失败，请查看上方错误；不会自动删除业务数据库。' }
    if ($Capture) { return ($output -join "`n") }
}

function Read-LanIPv4 {
    $match = Select-String -LiteralPath $script:LanConfig -Pattern '^LAN_IP=(\d+\.\d+\.\d+\.\d+)$'
    if (-not $match -or -not (Test-PrivateIPv4 $match.Matches[0].Groups[1].Value)) { throw '.env.lan 中缺少有效的局域网 IPv4。' }
    return $match.Matches[0].Groups[1].Value
}
