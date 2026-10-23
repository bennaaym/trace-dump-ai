param(
    [PSCredential] $Credential,
    [switch] $BasicUser
)

$ErrorActionPreference = 'Stop'

$eventName = 'TraceDump AI Suspected Dumping'
$baseUrl = 'http://localhost'
if (-not $Credential) {
    $Credential = Get-Credential -Message 'XProtect API user'
}
if (-not $BasicUser) {
    throw 'This setup script requires an XProtect basic user. Pass -BasicUser.'
}
$token = (Invoke-RestMethod `
    -Method Post `
    -Uri "$baseUrl/API/IDP/connect/token" `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body @{
        grant_type = 'password'
        username = $Credential.UserName
        password = $Credential.GetNetworkCredential().Password
        client_id = 'GrantValidatorClient'
    }).access_token
$headers = @{ Authorization = "Bearer $token" }
$event = (Invoke-RestMethod `
    -Headers $headers `
    -Uri "$baseUrl/api/rest/v1/analyticsEvents").array | Where-Object name -eq $eventName
if (@($event).Count -gt 1) {
    throw "More than one analytics event is named '$eventName'. Resolve duplicates manually."
}
if (-not $event) {
    $body = @{
        name = $eventName
        description = 'Event published for an AI-detected suspected dumping incident.'
    } | ConvertTo-Json
    $event = (Invoke-RestMethod `
        -Method Post `
        -Headers $headers `
        -ContentType 'application/json' `
        -Uri "$baseUrl/api/rest/v1/analyticsEvents" `
        -Body $body).data
    "created analytics event: $eventName"
} else {
    "present analytics event: $eventName"
}

"Native alarms are created through the Alarms REST API with the configured Medium priority."
$event | Select-Object Name, Id, Description
