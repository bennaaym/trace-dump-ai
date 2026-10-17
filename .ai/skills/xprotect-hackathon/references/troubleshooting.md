# When something is wrong

Where a fix says "ask the organizers": email hackathon.hafnia@milestone.dk with your machine name, what you did,
and what you saw.

## Symptoms and fixes

| You see | Do this |
|---|---|
| Remote Desktop cannot reach `pNNN` | In the Tailscale app on your laptop: connected, signed in with the account the invitation was sent to, your machine listed? Try the machine's `100.x.y.z` address. Still nothing: ask the organizers. |
| Remote Desktop refuses the password | Type the user as `pNNN\Administrator` (some clients add your laptop's name or account otherwise). |
| Smart Client warns about an old security model, or shows *Not secure* | Expected: the machine uses plain HTTP inside your private network. In the warning, tick *Remember my choice. Do not show this message again* and select **Allow**. *Not secure* stays next to the toolbar: ignore it. |
| Smart Client or the APIs do not answer right after a reboot | XProtect's web services are still starting: wait 2–3 minutes. |
| Smart Client hides the Summarization workspace, or Summarization shows no prompts | Check that the service `Hafnia.Vlm.Gateway` is running, then log out of Smart Client and in again. With 25 or more prompts the list does not load correctly: keep fewer than 25 (delete some on the gateway page). Still wrong: ask the organizers. |
| Generate Summarization stays greyed out | Add a camera, switch on time selection on the timeline (its tooltip: *Set start and end time on timeline*) and select a stretch of recorded video, and pick a prompt. |
| A summary failed | See "When a summary fails" below. |
| The gateway page shows a setup wizard instead of a login | The gateway lost its settings, or its administrator password was reset from the tray icon. Do not run the wizard: ask the organizers. |
| A gateway rule never raises its alarm | See the `hafnia-vlm` skill, `references/gateway-rules.md`, "When the event does not arrive". |
| A camera shows no video | Wait 2 minutes, then check that the Recording Server service runs. The reason is usually in `DeviceHandling.log` (Recording Server log folder). |
| The Recording Server shows Running, but every stop fails ("Cannot stop … service") | It was stopped too soon after it started. Restart the machine. |
| `Invoke-RestMethod` or `Invoke-WebRequest` to `https://localhost:15443` fails | Windows PowerShell 5.1's web cmdlets cannot connect to the gateway. Use `curl.exe -k`, or code that accepts the self-signed certificate ("Read it from your code" in [vlm-allowance.md](vlm-allowance.md)). |
| `Connect-Vms` fails with VMO61008 (insufficient permissions) | You run as SYSTEM, for example from a scheduled task. Run as your own login. |
| Video in Smart Client is choppy over Remote Desktop | Your connection to the machine is slow. Use a smaller Remote Desktop window or a lower colour depth; the recordings themselves are fine. To watch from your laptop, use the Web Client. |
| The Web Client logged you out | It ends the session after 5 minutes in an inactive browser tab. Log in again. |
| A licence banner | Expected. The organizers handle licensing. |
| You locked yourself out, or the machine is beyond repair | Ask the organizers. A rebuild takes about 25 minutes and gives you a fresh machine. |

## When a summary fails

Open the request in Smart Client, Summarization, History, and read its reason.

| The reason says | Do this |
|---|---|
| only one video source | A webhook's rule fired on an event from another camera than the webhook's own. Use an event from that camera, or one without a camera (a user-defined event, a schedule). |
| Fetch Video | Pick a stretch within the last 24 hours. If it was long, pick a shorter one: the export must finish in 60 seconds. From code: check the camera ID (IDs change when a machine is rebuilt). If every request fails this way: ask the organizers. |
| an error from Hafnia VLM | Check your allowance. If it is not used up, try again in a minute. |
| Hafnia VLM configuration is invalid | The gateway lost its Hafnia settings: ask the organizers. |

## Services

Restart one only when you need to. In PowerShell on the machine: `Restart-Service -Name 'MilestoneEventServerService'`
(use the service name, not the display name).

| Service name | What it does |
|---|---|
| `Milestone XProtect Management Server` | configuration and logins |
| `Milestone XProtect Recording Server` | cameras, recording, video. Never stop it less than 90 seconds after it started. |
| `MilestoneEventServerService` (Milestone XProtect Event Server) | events, rules, alarms, webhooks, analytics events |
| `Milestone XProtect Data Collector Server` | system monitoring data |
| `Milestone XProtect Mobile Server` | the Web Client |
| `W3SVC` (IIS) | the API Gateway and the identity provider |
| `Hafnia.Vlm.Gateway` (Milestone XProtect Hafnia Integration Service) | the Hafnia gateway. A restart starts summaries in progress again. |
| `Tailscale` | your connection. Never stop it. |

## Log folders

| Component | Folder |
|---|---|
| Recording Server: cameras, video | `C:\ProgramData\Milestone\XProtect Recording Server\Logs` (`DeviceHandling.log` for camera problems) |
| Management Server | `C:\ProgramData\Milestone\XProtect Management Server\Logs` |
| Event Server: rules, alarms, webhooks, analytics events | `C:\ProgramData\Milestone\XProtect Event Server\Logs` |
| Mobile Server: Web Client | `C:\ProgramData\Milestone\XProtect Mobile Server\Logs` |
| Hafnia gateway | `C:\ProgramData\VideoOS\Hafnia.Vlm.Gateway\logs` |

The tour script (`scripts\Show-MyEnvironment.ps1` in this skill's folder) lists the log folders that exist on your
machine.
