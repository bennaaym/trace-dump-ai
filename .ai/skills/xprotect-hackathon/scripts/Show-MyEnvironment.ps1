<#
Show-MyEnvironment.ps1 - a read-only tour of your hackathon machine. It changes no settings.

Run it on the machine (over Remote Desktop), as the user you log in with:
    powershell -ExecutionPolicy Bypass -File .\Show-MyEnvironment.ps1

Eight steps, each printed as it runs: the machine, its network name, the services, your cameras with the IDs that
APIs and webhooks need, a call to the XProtect REST API as you, the Hafnia gateway and today's VLM allowance, the
developer tools on PATH, and the log folders. It ends with the addresses to use. It takes 1-3 minutes. A step that
fails says why, and the tour goes on with the next one.
#>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$total = 8
$name = $env:COMPUTERNAME.ToLower()

function Write-Step([int]$Number, [string]$Text) { Write-Host ''; Write-Host ('[{0}/{1}] {2}' -f $Number, $total, $Text) -ForegroundColor Cyan }
function Write-Item([string]$Label, $Value) { Write-Host ('  {0,-46} {1}' -f $Label, $Value) }
function Write-Failure([string]$What, $ErrorRecord) { Write-Host ('  FAILED {0}: {1}' -f $What, $ErrorRecord.Exception.Message) -ForegroundColor Yellow }

Write-Host ('Tour of {0} at {1:yyyy-MM-dd HH:mm} UTC. Read-only: it changes no settings.' -f $name, [DateTime]::UtcNow)

Write-Step 1 'This machine'
try {
    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    Write-Item 'Name' $env:COMPUTERNAME
    Write-Item 'Windows' $os.Caption
    Write-Item 'CPUs, memory' ('{0} CPUs, {1:N0} GB' -f $cs.NumberOfLogicalProcessors, ($cs.TotalPhysicalMemory / 1GB))
    Write-Item 'Disk C: free' ('{0:N0} of {1:N0} GB' -f ($disk.FreeSpace / 1GB), ($disk.Size / 1GB))
    Write-Item 'Time zone' (Get-TimeZone).Id
    Write-Item 'Running since' $os.LastBootUpTime
    Write-Item 'You are' ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
} catch { Write-Failure 'machine' $_ }

# Read from the network adapter, not from tailscale.exe: the connection is managed for you, and Tailscale commands
# run as your user can interfere with it.
Write-Step 2 'Network name (Tailscale)'
try {
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.InterfaceAlias -like 'Tailscale*' } | ForEach-Object { $_.IPAddress })
    Write-Item 'Name in your private network' $name
    Write-Item 'Address' $(if ($ips.Count) { $ips -join ', ' } else { 'no Tailscale address found' })
} catch { Write-Failure 'network' $_ }

Write-Step 3 'Services'
foreach ($svcName in 'Milestone XProtect Management Server', 'Milestone XProtect Recording Server', 'MilestoneEventServerService', 'Milestone XProtect Data Collector Server', 'Milestone XProtect Mobile Server', 'W3SVC', 'Hafnia.Vlm.Gateway', 'Tailscale') {
    $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
    if (-not $svc) { $svc = Get-Service -DisplayName $svcName -ErrorAction SilentlyContinue }
    if ($svc) { Write-Item $svc.DisplayName $svc.Status } else { Write-Item $svcName 'not found' }
}

Write-Step 4 'Cameras (MilestonePSTools, as you; a live image from each)'
try {
    Write-Item 'Loading MilestonePSTools' 'takes 10-30 s'
    Import-Module MilestonePSTools -ErrorAction Stop
    Write-Item 'Connecting to' 'http://localhost'
    Connect-Vms -ServerAddress 'http://localhost' -AcceptEula -ErrorAction Stop | Out-Null
    $ms = Get-VmsManagementServer -ErrorAction Stop
    Write-Item 'Management Server' ('{0}, version {1}' -f $ms.Name, $ms.Version)
    foreach ($cam in @(Get-VmsCamera -ErrorAction Stop | Sort-Object Name)) {
        try {
            $snap = Get-Snapshot -Camera $cam -Live -LiveTimeoutMS 10000 -ErrorAction Stop
            $image = if ($snap -and $snap.Content) { 'live image {0}x{1}' -f $snap.Width, $snap.Height } else { 'no live image' }
        } catch { $image = 'no live image: ' + $_.Exception.Message }
        Write-Item $cam.Name ('{0}, id {1}' -f $image, $cam.Id)
    }
    Disconnect-Vms
} catch { Write-Failure 'XProtect' $_ }

# Windows authentication goes straight to the identity provider (/IDP/...): the API Gateway (/API/...) does not pass
# it through. Basic users use /API/IDP/connect/token with grant_type=password.
Write-Step 5 'XProtect REST API (a token as you, then the camera list)'
try {
    $token = Invoke-RestMethod -Method Post -Uri 'http://localhost/IDP/connect/token' -UseDefaultCredentials -Body @{ grant_type = 'windows_credentials'; client_id = 'GrantValidatorClient' }
    Write-Item 'POST /IDP/connect/token' ('OK, token valid for {0} s' -f $token.expires_in)
    $cameras = Invoke-RestMethod -Uri 'http://localhost/api/rest/v1/cameras' -Headers @{ Authorization = 'Bearer ' + $token.access_token }
    Write-Item 'GET /api/rest/v1/cameras' ('{0} cameras' -f @($cameras.array).Count)
} catch { Write-Failure 'REST API' $_ }

Write-Step 6 'Hafnia gateway and your VLM allowance'
try {
    Write-Item 'Service Hafnia.Vlm.Gateway' (Get-Service -Name 'Hafnia.Vlm.Gateway').Status
    Write-Item 'Asking the gateway' 'takes up to 60 s'
    $json = curl.exe -sk --max-time 60 'https://localhost:15443/api/System/Information'
    if ($LASTEXITCODE -ne 0) { throw ('the gateway did not answer (curl exit code {0})' -f $LASTEXITCODE) }
    $info = ($json -join '') | ConvertFrom-Json
    Write-Item 'Gateway version' $info.Version
    Write-Item 'Setup complete' (-not $info.IsSetupWizardRequired)
    Write-Item 'Prompts, summaries, rules' ('{0}, {1}, {2}' -f $info.PromptCount, $info.SummaryCount, $info.RuleCount)
    $q = $info.QuotaInformation
    if ($q) { Write-Item 'VLM requests today' ('{0} of {1} used, resets {2:yyyy-MM-dd HH:mm} UTC' -f $q.DailySummaryCount, $q.DailySummaryQuota, ([datetime]$q.DailySummaryReset).ToUniversalTime()) }
    else { Write-Item 'VLM requests today' 'not available: the gateway cannot reach Hafnia VLM right now' }
} catch { Write-Failure 'Hafnia gateway' $_ }

Write-Step 7 'Developer tools on PATH'
foreach ($tool in 'git', 'python', 'node', 'npm', 'dotnet', 'code', 'pwsh', 'claude') {
    try {
        $cmd = Get-Command $tool -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $cmd) { Write-Item $tool 'not installed'; continue }
        $where = $cmd.Source
        if ($tool -eq 'dotnet') { $where = '{0} ({1} SDKs)' -f $cmd.Source, @(& $cmd.Source --list-sdks).Count }
        Write-Item $tool $where
    } catch { Write-Failure $tool $_ }
}

Write-Step 8 'Log folders'
$folders = @(Get-ChildItem 'C:\ProgramData\Milestone' -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'Logs' } | Where-Object { Test-Path $_ })
$folders += @('C:\ProgramData\VideoOS\Hafnia.Vlm.Gateway\logs' | Where-Object { Test-Path $_ })
foreach ($folder in $folders) { Write-Host ('  {0}' -f $folder) }

Write-Host ''
Write-Host 'Addresses' -ForegroundColor Cyan
Write-Item 'Smart Client, Management Client' 'log in to localhost, Windows authentication (current user)'
Write-Item 'Hafnia gateway, on this machine' 'https://localhost:15443/   API docs: https://localhost:15443/api/swagger/'
Write-Item 'From your laptop' ('Remote Desktop: {0}   Web Client: http://{0}:8081/   REST: http://{0}/api/rest/v1/' -f $name)
