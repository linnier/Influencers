$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw '请在 Windows 10/11 上双击 start-personal.cmd。' }
$bundle = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $bundle
$state = Join-Path $bundle '.personal'
[void](New-Item -ItemType Directory -Path $state -Force)
$architecture = $env:PROCESSOR_ARCHITEW6432
if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITECTURE }
switch ($architecture) {
    'AMD64' { $nodePlatform = 'win-x64'; $expectedHash = '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73' }
    'ARM64' { $nodePlatform = 'win-arm64'; $expectedHash = '8502f4a50b458d4cc38ed8f2001556c2cd239d464920f74017926ccb1e1c157f' }
    default { throw '个人版需要 64 位 Windows 10/11。' }
}
$nodeVersion = 'v24.19.0'
$runtime = Join-Path $state "runtime/node-$nodeVersion-$nodePlatform"
$node = Join-Path $runtime 'node.exe'
if (-not (Test-Path -LiteralPath $node)) {
    Write-Host '首次启动：正在下载官方运行环境，无需管理员权限或虚拟机。'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $archive = Join-Path $state "node-$nodeVersion-$nodePlatform.zip"
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-$nodePlatform.zip" -OutFile $archive
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $expectedHash) {
        Remove-Item -LiteralPath $archive -Force
        throw '运行环境校验失败，已停止安装，请勿关闭校验。'
    }
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $state 'runtime') -Force
    Remove-Item -LiteralPath $archive -Force
}
$actualVersion = & $node --version
if ($LASTEXITCODE -ne 0 -or $actualVersion -ne $nodeVersion) { throw '运行环境异常，请保留本窗口并反馈错误。' }
$env:PATH = "$runtime;$env:PATH"
$env:npm_config_cache = Join-Path $state 'npm-cache'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:NODE_ENV = 'production'
if (-not $env:LOCALAPPDATA) { throw '无法找到 Windows 用户数据目录。' }
$dataDirectory = Join-Path $env:LOCALAPPDATA 'StarBridge/data'
[void](New-Item -ItemType Directory -Path $dataDirectory -Force)
$env:INFLUENCERS_DB_PATH = Join-Path $dataDirectory 'influencers.sqlite'
$address = 'http://127.0.0.1:3077'
function Test-PersonalServer {
    try {
        $health = Invoke-RestMethod -Uri "$address/api/health" -TimeoutSec 2
        $page = Invoke-WebRequest -UseBasicParsing -Uri $address -TimeoutSec 2
        return $health.status -eq 'ok' -and $page.Content.Contains('星桥')
    } catch { return $false }
}
if (Test-PersonalServer) { Start-Process $address; Write-Host '系统已在运行，已打开浏览器。'; exit 0 }
if (Get-NetTCPConnection -State Listen -LocalPort 3077 -ErrorAction SilentlyContinue) { throw '本机 3077 端口被其他程序占用。请保留报错窗口并反馈。' }

$installStamp = Join-Path $state 'installed.txt'
$lockHash = $nodeVersion + '-' + (Get-FileHash -LiteralPath (Join-Path $bundle 'package-lock.json') -Algorithm SHA256).Hash
if (-not (Test-Path -LiteralPath $installStamp) -or (Get-Content -LiteralPath $installStamp -Raw).Trim() -ne $lockHash -or -not (Test-Path -LiteralPath (Join-Path $bundle 'node_modules/next'))) {
    Write-Host '正在准备系统组件，首次启动需要联网，请等待…'
    $env:NODE_ENV = 'development'
    & (Join-Path $runtime 'npm.cmd') ci --include=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw '组件下载失败，请检查网络后重新双击启动，不需要重装 Windows 或 Docker。' }
    $env:NODE_ENV = 'production'
    Set-Content -LiteralPath $installStamp -Value $lockHash -Encoding ASCII
}
$fingerprint = @($lockHash)
foreach ($file in @('next.config.mjs','tsconfig.json')) { $fingerprint += (Get-FileHash -LiteralPath (Join-Path $bundle $file) -Algorithm SHA256).Hash }
Get-ChildItem -LiteralPath (Join-Path $bundle 'src') -File -Recurse | Sort-Object FullName | ForEach-Object {
    $fingerprint += $_.FullName.Substring($bundle.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
}
$buildKey = $fingerprint -join "`n"
$buildStamp = Join-Path $state 'built.txt'
if (-not (Test-Path -LiteralPath $buildStamp) -or (Get-Content -LiteralPath $buildStamp -Raw).Trim() -ne $buildKey.Trim() -or -not (Test-Path -LiteralPath (Join-Path $bundle '.next/BUILD_ID'))) {
    Write-Host '正在准备页面，完成后会自动打开系统…'
    & (Join-Path $runtime 'npm.cmd') run build
    if ($LASTEXITCODE -ne 0) { throw '系统构建失败，请把本窗口的错误截图发给助手。' }
    Set-Content -LiteralPath $buildStamp -Value $buildKey -Encoding UTF8
}
Write-Host '系统正在启动。本窗口保持打开；关闭本窗口即可停止运行，已有数据会保留。'
Write-Host ('你的数据保存在：{0}' -f $dataDirectory)
$info = New-Object Diagnostics.ProcessStartInfo
$info.FileName = $node
$info.Arguments = '"' + (Join-Path $bundle 'node_modules/next/dist/bin/next') + '" start --hostname 127.0.0.1 --port 3077'
$info.WorkingDirectory = $bundle
$info.UseShellExecute = $false
$process = New-Object Diagnostics.Process
$process.StartInfo = $info
$started = $false
try {
    [void]$process.Start()
    $started = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        if ($process.HasExited) { throw '系统启动失败，请查看上方错误。' }
        if (Test-PersonalServer) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw '启动超时，请把本窗口的错误截图发给助手。' }
    Start-Process $address
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw '系统已退出，请查看上方错误。' }
} finally {
    if ($started -and -not $process.HasExited) { $process.Kill() }
    $process.Dispose()
}
