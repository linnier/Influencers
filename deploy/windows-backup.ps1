. (Join-Path $PSScriptRoot 'windows-common.ps1')
Assert-LanDocker
$directory = Join-Path $script:BundleRoot 'backups'
[void](New-Item -ItemType Directory -Path $directory -Force)
$name = 'influencers-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffffffZ') + '.sqlite'
Invoke-LanCompose -DockerArguments @('exec', '-T', 'app', 'node', 'deploy/database.mjs', 'backup', "/app/data/backups/$name")
Invoke-LanCompose -DockerArguments @('cp', "app:/app/data/backups/$name", (Join-Path $directory $name))
Write-Host ('已验证的备份位于：{0}' -f (Join-Path $directory $name))
