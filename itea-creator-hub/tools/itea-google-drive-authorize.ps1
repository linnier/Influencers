param([string]$ClientFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
function Base64Url([byte[]]$Bytes) { return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
function RandomToken {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return Base64Url $bytes
}
function QueryString($Values) {
    return (($Values.GetEnumerator() | ForEach-Object { [Uri]::EscapeDataString([string]$_.Key) + '=' + [Uri]::EscapeDataString([string]$_.Value) }) -join '&')
}
$listener = $null
try {
    if (!$ClientFile) {
        $picker = New-Object Windows.Forms.OpenFileDialog
        $picker.Title = 'Select Google Desktop OAuth client JSON (downloaded from Google Cloud)'
        $picker.Filter = 'Google client JSON (*.json)|*.json'
        if ($picker.ShowDialog() -ne 'OK') { throw 'Cancelled.' }
        $ClientFile = $picker.FileName
    }
    $config = Get-Content -Raw -LiteralPath $ClientFile | ConvertFrom-Json
    $client = $config.installed
    if (!$client.client_id -or !$client.client_secret -or !$client.client_id.EndsWith('.apps.googleusercontent.com')) { throw 'Please select a Desktop app OAuth client JSON from Google Cloud.' }
    $state = RandomToken
    $verifier = RandomToken
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $challenge = Base64Url ($sha.ComputeHash([Text.Encoding]::ASCII.GetBytes($verifier))) } finally { $sha.Dispose() }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $redirect = 'http://127.0.0.1:' + $listener.LocalEndpoint.Port + '/'
    $scope = 'https://www.googleapis.com/auth/drive.file'
    $url = 'https://accounts.google.com/o/oauth2/v2/auth?' + (QueryString @{
        client_id=$client.client_id; redirect_uri=$redirect; response_type='code'; scope=$scope;
        access_type='offline'; prompt='consent'; state=$state; code_challenge=$challenge; code_challenge_method='S256'
    })
    Write-Host 'Opening Google authorization. Sign in with your personal Google account.'
    Start-Process $url
    $deadline = [DateTime]::UtcNow.AddMinutes(5)
    $code = $null
    while (!$code -and [DateTime]::UtcNow -lt $deadline) {
        if (!$listener.Pending()) { Start-Sleep -Milliseconds 100; continue }
        $socket = $listener.AcceptTcpClient()
        try {
            $socket.ReceiveTimeout = 5000
            $stream = $socket.GetStream()
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
            $line = $reader.ReadLine()
            if (!$line -or $line.Length -gt 16000 -or $line -notmatch '^GET (/[\S]*) HTTP/1\.[01]$') { continue }
            $target = [Uri]::new($redirect.TrimEnd('/') + $Matches[1])
            $query = @{}
            foreach ($part in $target.Query.TrimStart('?').Split('&')) {
                $pair = $part.Split('=', 2)
                if ($pair.Length -eq 2) { $query[[Uri]::UnescapeDataString($pair[0])] = [Uri]::UnescapeDataString($pair[1].Replace('+',' ')) }
            }
            $valid = $target.AbsolutePath -eq '/' -and $query.state -ceq $state
            $message = 'Invalid authorization response. Return to the Google window.'
            if ($valid -and $query.code) { $code = $query.code; $message = 'Google authorization received. Return to the itea authorization tool.' }
            if ($valid -and $query.error) { throw 'Google authorization was declined. Please run the tool again.' }
            $body = [Text.Encoding]::UTF8.GetBytes('<!doctype html><title>itea backup authorization</title><p>' + $message + '</p>')
            $head = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Security-Policy: default-src 'none'; frame-ancestors 'none'`r`nCache-Control: no-store`r`nConnection: close`r`nContent-Length: " + $body.Length + "`r`n`r`n")
            $stream.Write($head, 0, $head.Length); $stream.Write($body, 0, $body.Length)
        } finally { $socket.Dispose() }
    }
    if (!$code) { throw 'Authorization timed out after 5 minutes. Run the tool again.' }
    # Use fixed Google endpoints; never trust token_uri or auth_uri in the downloaded file.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $tokens = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -ContentType 'application/x-www-form-urlencoded' -Body @{
        client_id=$client.client_id; client_secret=$client.client_secret; grant_type='authorization_code';
        code=$code; code_verifier=$verifier; redirect_uri=$redirect
    }
    if (!$tokens.refresh_token -or !($tokens.scope.Split(' ') -contains $scope)) { throw 'Google did not return persistent Drive permission. Run the tool again and grant access.' }
    $save = New-Object Windows.Forms.SaveFileDialog
    $save.Title = 'Save temporary itea connection file, then import it in System Management'
    $save.Filter = 'JSON (*.json)|*.json'
    $save.FileName = 'itea-google-drive-connection.json'
    if ($save.ShowDialog() -ne 'OK') { throw 'Connection file was not saved.' }
    $bundle = @{format='itea-google-drive-connection-v1'; clientId=$client.client_id; clientSecret=$client.client_secret; refreshToken=$tokens.refresh_token} | ConvertTo-Json
    [IO.File]::WriteAllText($save.FileName, $bundle, [Text.UTF8Encoding]::new($false))
    Write-Host 'Saved. Import this file in itea System Management > Data backup.'
    Write-Host 'The file contains authorization credentials. Do not send it in chat. Delete it after import.'
} catch {
    # Provider exceptions may include authorization request details. Print no raw response bodies.
    Write-Host 'Authorization did not finish. Check the selected Desktop client, Google consent settings and network, then retry.' -ForegroundColor Red
    exit 1
} finally { if ($listener) { $listener.Stop() } }
