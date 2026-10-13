. (Join-Path $PSScriptRoot 'windows-common.ps1')
Assert-LanDocker
Invoke-LanCompose -DockerArguments @('stop')
Write-Host '服务已停止，数据库和证书卷均保留。'
