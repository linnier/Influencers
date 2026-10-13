. (Join-Path $PSScriptRoot 'windows-common.ps1')
Assert-LanDocker
Set-Location -LiteralPath $script:BundleRoot

if (-not (Test-Path -LiteralPath $script:LanConfig)) {
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { Test-PrivateIPv4 $_.IPAddress })
    Write-Host '可用的内网地址（请选择 Wi-Fi 或以太网地址，不选 Docker/VPN 虚拟网卡）：'
    $addresses | ForEach-Object { Write-Host ("{0}: {1}" -f $_.InterfaceAlias, $_.IPAddress) }
    $lanIp = (Read-Host '本机局域网 IPv4').Trim()
    if (-not (Test-PrivateIPv4 $lanIp) -or $lanIp -notin $addresses.IPAddress) { throw '请输入本机网卡实际使用的私有 IPv4 地址。' }
    $username = (Read-Host '管理员用户名（留空使用 admin）').Trim()
    if (-not $username) { $username = 'admin' }
    if ($username -notmatch '^[A-Za-z0-9_.-]{1,32}$') { throw '用户名只能包含字母、数字、点、下划线或短横线。' }
    & docker pull $script:CaddyImage
    if ($LASTEXITCODE -ne 0) { throw '首次安装需要联网下载官方镜像，请检查网络。' }
    $secure = Read-Host '管理员密码（至少 12 个字符，输入不显示）' -AsSecureString
    $confirmation = Read-Host '再次输入密码' -AsSecureString
    $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
    try {
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
        $again = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
        if ($password -cne $again) { throw '两次密码不一致。' }
        if ($password.Length -lt 12 -or [Text.Encoding]::UTF8.GetByteCount($password) -gt 72 -or $password -cne $password.Trim() -or $password.Contains("`n") -or $password.Contains("`r")) { throw '密码须至少 12 个字符、不超过 72 字节，不含换行且首尾不留空格。' }
        $info = New-Object System.Diagnostics.ProcessStartInfo
        $info.FileName = 'docker'
        $info.Arguments = "run --rm -i $script:CaddyImage caddy hash-password --algorithm bcrypt --bcrypt-cost 14"
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardInput = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $info
        [void]$process.Start()
        $process.StandardInput.WriteLine($password)
        $process.StandardInput.Close()
        $hashOutput = $process.StandardOutput.ReadToEnd()
        $hashError = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        $hashMatch = [regex]::Match($hashOutput, '\$2[aby]\$14\$[./A-Za-z0-9]{53}')
        if ($process.ExitCode -ne 0 -or -not $hashMatch.Success) { throw '密码哈希生成失败，未保存凭据。' }
        $passwordHash = $hashMatch.Value
        $process.Dispose()
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr)
        $password = $null; $again = $null
        $secure.Dispose(); $confirmation.Dispose()
    }
    $contents = "LAN_IP=$lanIp`nADMIN_USERNAME=$username`nADMIN_PASSWORD_HASH='$passwordHash'`n"
    $stream = New-Object System.IO.FileStream($script:LanConfig, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($contents); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    try {
        $acl = New-Object Security.AccessControl.FileSecurity
        $acl.SetAccessRuleProtection($true, $false)
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')))
        foreach ($wellKnown in @([Security.Principal.WellKnownSidType]::LocalSystemSid, [Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid)) {
            $account = New-Object Security.Principal.SecurityIdentifier($wellKnown, $null)
            $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($account, 'FullControl', 'Allow')))
        }
        Set-Acl -LiteralPath $script:LanConfig -AclObject $acl
    } catch {
        Remove-Item -LiteralPath $script:LanConfig -Force
        throw '无法保护配置文件，请解压到本机 NTFS 用户目录后重试。'
    }
    Write-Host '已保存本机配置；仅存储密码哈希，不存储明文密码。'
}

$lanIp = Read-LanIPv4
if (-not (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -eq $lanIp })) { throw '本机 IP 已变化。请将 .env.lan 的 LAN_IP 改为本机新的私有 IPv4，不修改密码哈希。' }
Invoke-LanCompose -DockerArguments @('config', '--quiet')
# Private bundles include a verified cache; GitHub source ZIPs download dependencies.
if (-not $env:NPM_OFFLINE -and (Test-Path -LiteralPath (Join-Path $script:BundleRoot 'deploy/npm-cache/_cacache'))) {
    $env:NPM_OFFLINE = 'true'
}
Invoke-LanCompose -DockerArguments @('build', 'app')
$exists = Invoke-LanCompose -DockerArguments @('run', '--rm', '--no-deps', 'app', 'node', '-e', "console.log(require('node:fs').existsSync(process.env.INFLUENCERS_DB_PATH))") -Capture
if ($exists.Trim() -eq 'false') {
    $source = Join-Path $script:BundleRoot 'initial-data/influencers.sqlite'
    if (Test-Path -LiteralPath $source) {
        Invoke-LanCompose -DockerArguments @('run', '--rm', '--no-deps', '--user', '0:0', '--cap-add', 'CHOWN', '--cap-add', 'DAC_OVERRIDE', '-v', "${source}:/restore.sqlite:ro", 'app', 'node', 'deploy/database.mjs', 'restore', '/restore.sqlite')
    } else {
        Write-Host '这是源码版，不包含达人名单。首次启动将创建空数据库，不会替换已有业务数据。'
    }
} elseif ($exists.Trim() -ne 'true') { throw '无法确定已有数据库状态，停止启动。' }
else { Write-Host '已有业务数据库将保留，不重复导入。' }
Invoke-LanCompose -DockerArguments @('up', '-d')
$certDirectory = Join-Path $script:BundleRoot 'lan-certificate'
[void](New-Item -ItemType Directory -Path $certDirectory -Force)
$certificate = Join-Path $certDirectory 'root.crt'
$copied = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker compose --env-file $script:LanConfig -f $script:LanCompose cp 'caddy:/data/caddy/pki/authorities/local/root.crt' $certificate 2>$null
        $copied = $LASTEXITCODE -eq 0
    } finally { $ErrorActionPreference = $savedPreference }
    if ($copied) { break }
    Start-Sleep -Seconds 2
}
if (-not $copied) { throw '证书尚未生成，请查看代理日志，勿忽略浏览器证书警告输入密码。' }
Write-Host ('局域网访问地址：https://{0}:8443' -f $lanIp)
Write-Host ('证书 SHA256：{0}' -f (Get-FileHash -LiteralPath $certificate -Algorithm SHA256).Hash)
Write-Host '下一步：运行 windows-trust.cmd 信任本机证书；管理员运行防火墙脚本，仅允许私有网络的本地子网访问。'
Write-Host '其他设备须先核对并安装此根证书，再通过上面的 HTTPS 内网地址登录。'
