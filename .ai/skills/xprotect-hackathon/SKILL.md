---
name: xprotect-hackathon
description: Orientation and first aid for a participant's own Hafnia Hackathon 2026 machine (pNNN). What is on it, how to connect (Tailscale, Remote Desktop/RDP), accounts, addresses and ports, the first 30 minutes, the Hafnia VLM daily allowance (500 requests - quota, limit, how many are left), house rules, where to start building, and fixes when something on the machine does not work (Smart Client, Summarization workspace, Hafnia gateway, cameras, logs). Start here before the other hackathon skills.
---

# Your hackathon machine

You have your own XProtect system: one Windows server in the cloud that only you (and the organizers, for support)
can reach. It runs XProtect Corporate 2026 R1 with five cameras playing recorded video, and the Hafnia VLM
integration, already connected to Hafnia with your personal allowance of **500 requests a day**. You are its
administrator.

## For the assistant: where are you running?

You are on the participant's machine only if `hostname` prints `p` and three digits (any case, e.g. `p042`) **and**
`sc.exe query "Milestone XProtect Management Server"` finds the service. Then everything below works with
`localhost`. Otherwise you are on the participant's own computer: only what "Working from your laptop" lists works,
and that computer may run an XProtect of its own: reach the machine as `pNNN`, never as `localhost`, and change no
XProtect there. For work on the machine, give the participant steps to run over Remote Desktop.

- Ask the participant before you restart a service or reboot the machine.
- Never run `tailscale` commands or the Tailscale app on the machine.
- Never print passwords or tokens.
- The tour script takes 1–3 minutes: run it with a 5-minute timeout.

## What is on the machine

| Part | What it is for |
|---|---|
| XProtect Corporate 2026 R1: Management Server, Recording Server, Event Server, Mobile Server, API Gateway, SQL Server Express | the whole video management system, on this one machine |
| XProtect Smart Client 2026 R1 | the operator's application: live, playback, search, alarms, Hafnia summaries |
| XProtect Management Client 2026 R1 | configuration: cameras, events, rules, alarms, webhooks, users and roles |
| Hafnia plug-in for XProtect 2.0.150 | the Summarization workspace in Smart Client, and the Hafnia gateway service that talks to Hafnia VLM |
| MilestonePSTools 25.2.61 | PowerShell module to query and configure XProtect from scripts |
| StableFPS driver | plays recorded video files as cameras |
| Tailscale | the private link between your laptop and the machine |
| This kit | `C:\HackathonKit` |
| Microsoft Edge, Windows PowerShell 5.1, `curl.exe` | |

Windows Server 2022, 4 vCPUs, 16 GB RAM, an NVIDIA T4 GPU (16 GB), a 250 GB system disk (C:) and a fast 116 GB data
disk (D:), clock in UTC, internet access. D: is emptied if the machine is ever stopped: keep nothing there that you
cannot download again.
Git, Python, Node.js, VS Code and the .NET SDK are not installed: install what you need.

## Your cameras

Five cameras, each playing a recorded clip on an endless loop, at 10 frames per second (H.264).
They behave like real cameras: live video, motion detection, recording, playback.

| Camera | Scene | Size |
|---|---|---|
| `busy_street` | a dense crowd on a city street at night | 1280×720 |
| `highway_traffic_overcast_weather` | a highway in thick fog, light traffic with headlights on | 1920×1080 |
| `city_street_7_condensation_inside_housing` | a street corner; the view starts clear, then fogs up from condensation inside the camera housing. The clip is about 8 seconds, so this happens again every loop | 832×480 |
| `vandalism` | a man throws something at a building's window and breaks it. The clip is about 8 seconds, so this happens again every loop | 832×480 |
| `traffic_flows_in_the_open_lanes` | roadworks close the bus lane; traffic flows past in the open lanes | 832×480 |

- Device group **Hackathon**; Smart Client view **Hackathon › Cameras › All cameras**.
- The cameras record on motion: when you select a time span, pick one the timeline shows as recorded. Recordings
  are kept **24 hours**.
- The loops make tests repeatable: the same scene comes back again and again.
- Camera IDs (the APIs need them): the tour script prints them, and `GET /api/rest/v1/cameras` lists them.
  They change when a machine is rebuilt, so look cameras up by name in your code.

## How to get in

1. On your laptop, install Tailscale (tailscale.com/download) and accept the Tailscale invitation, signing in with
   the account it was sent to. If your laptop already uses Tailscale for work, add this as a second account in the
   Tailscale app and switch to it.
2. Open Remote Desktop to your machine name, **pNNN**, from your welcome email. Windows: Remote Desktop Connection;
   macOS and iPad: Windows App; Linux: Remmina.
3. Log in as **Administrator** with the password the organizers sent you.

Machines cannot reach each other. If the name does not resolve, use the `100.x.y.z` address the Tailscale app shows
for your machine. If you cannot install software on your laptop, tell the organizers.

## Accounts

| Where | User | Password |
|---|---|---|
| Windows (Remote Desktop) | `Administrator` | sent to you by the organizers |
| Smart Client, Management Client | Windows authentication as yourself; there is no separate XProtect login | |
| Hafnia gateway page and its API | `administrator` | the same as your Windows password |
| Your own code that calls XProtect | a basic user you create; it works on the machine and from your laptop. MilestonePSTools on the machine logs in as you | |

Never change the Windows Administrator password: the Hafnia integration depends on it. Your personal Hafnia VLM key
is already stored in the gateway, so on the machine you never need it.

## Addresses

| What | On the machine | From your laptop |
|---|---|---|
| Remote Desktop | | `pNNN` |
| Smart Client and Management Client | log in to `localhost` | use them on the machine |
| XProtect REST APIs (API Gateway) | `http://localhost/api/rest/v1/` | `http://pNNN/api/rest/v1/` |
| API token, basic user | `http://localhost/API/IDP/connect/token` | `http://pNNN/API/IDP/connect/token` |
| Live events over WebSocket | `ws://localhost/api/ws/events/v1` | `ws://pNNN/api/ws/events/v1` |
| XProtect Web Client, in a browser | `http://localhost:8081/` | `http://pNNN:8081/` |
| Hafnia gateway: web page, API, API docs | `https://localhost:15443/`, `https://localhost:15443/api/swagger/` | not reachable |

XProtect uses plain HTTP inside your private network; the Tailscale tunnel itself is encrypted. The Hafnia gateway
uses HTTPS with a self-signed certificate: if the browser warns, continue.

### Working from your laptop

- Works: Remote Desktop, the XProtect REST and WebSocket APIs, the Web Client.
- Does not work: the Hafnia gateway, web servers you run on the machine (open them in Edge there), and anything that
  calls your laptop from the machine. Code that calls the gateway, and receivers for XProtect webhooks, run on the
  machine.
- Hafnia from laptop code, through your machine: raise a user-defined event through the Events REST API; an XProtect
  rule sends it to a Hafnia webhook (see the `hafnia-vlm` skill); read the result back as an alarm, event or bookmark.
- Which XProtect API fits your code, and where Milestone documents it: the `xprotect-apis` skill.
- Code on your laptop logs in as a basic user: create one first (the `xprotect-essentials` skill,
  `references/management-client.md`, "Basic users"). A token and a first call, on macOS or Linux; it asks for your
  machine name, basic user and password:

  ```bash
  printf 'Machine name, for example p042: '; read -r XP_HOST
  printf 'Basic user: '; read -r XP_USER
  printf 'XProtect password: '; read -rs XP_PASSWORD; echo
  TOKEN=$(curl -fsS -X POST "http://$XP_HOST/API/IDP/connect/token" \
    -d grant_type=password -d client_id=GrantValidatorClient \
    --data-urlencode "username=$XP_USER" --data-urlencode "password=$XP_PASSWORD" \
    | sed -E 's/.*"access_token" *: *"([^"]+)".*/\1/')
  curl -fsS -H "Authorization: Bearer $TOKEN" "http://$XP_HOST/api/rest/v1/cameras"
  ```

## Your first 30 minutes

On the machine, over Remote Desktop:

1. **See the cameras.** Start XProtect Smart Client. Computer `localhost`, authentication *Windows authentication
   (current user)*, Connect. If a message says the connection uses an old security model, tick *Remember my choice.
   Do not show this message again* and select **Allow**. In the Views tab, open the view **Hackathon › Cameras › All
   cameras**: five moving scenes.
2. **Play back.** Switch the timeline from live to playback and drag it back a few minutes. Up to 24 hours are
   stored.
3. **Ask Hafnia.** Open the Summarization tab, then Generate:
   - **+ Add Camera**, and pick `vandalism`.
   - On the timeline, switch on time selection (its tooltip: *Set start and end time on timeline*), and
     drag the brackets around about 30 seconds of recorded video. Generate Summarization
     stays greyed out until a time span is selected.
   - Keep the default AI model and pick a prompt. To write your own, click New, replace the text with *Describe
     what happens in this video.*, and Save.
   - Click Generate Summarization. When the progress bar finishes, open History and read the answer. That used 1 of
     today's 500 requests.
4. **See your allowance.** In Edge, open `https://localhost:15443/` (continue past a certificate warning) and log in
   as `administrator` with your Windows password. The System page shows today's count and quota.
5. **Look around Management Client** (log in to `localhost` as in step 1; just look): Rules and Events (Rules, Webhooks, User-defined Events,
   Analytics Events), Alarms, Security (Roles, Basic Users).
6. **Run the tour** (1–3 minutes). In PowerShell:
   `powershell -ExecutionPolicy Bypass -File C:\HackathonKit\xprotect-hackathon\scripts\Show-MyEnvironment.ps1`.
   It prints what is on the machine, including your camera IDs and today's allowance. It changes no settings.
7. **Set up your project repository.** Install Git (git-scm.com), create a repository (GitHub or similar) and clone
   it on the machine. Your work must not live only on the machine.

## Your VLM allowance: 500 requests a day

- One request = one summary = one camera's clip + one prompt, from Smart Client, a webhook or the gateway API. The
  count resets at 00:00 UTC.
- What is left: the gateway's System page (step 4 above).
- When it is used up, new summaries fail until the reset. XProtect itself keeps working.
- **Never connect motion on these cameras to Hafnia**: motion starts and stops all day. And **never let an event
  that Hafnia raised trigger Hafnia again**: that loops until the allowance is gone.
- Budget by design: a check every 15 minutes on one camera costs 96 a day; on all five cameras, 480, nearly all of it.

More, including a PowerShell line and code that read it, and patterns that save requests:
[references/vlm-allowance.md](references/vlm-allowance.md).

## House rules: keep the machine working

Do not:

- rename the computer, change the Administrator password, or uninstall or upgrade XProtect, Smart Client, the Hafnia
  plug-in or Tailscale;
- on the machine, open the Tailscale app, run `tailscale` commands, stop the Tailscale service, or change Windows Firewall rules: your
  Remote Desktop connection depends on them, so any of that can lock you out;
- press **Reset System** on the gateway's System page (it deletes your Hafnia connection, prompts, rules and history),
  or reset the gateway's administrator password from its tray icon (it restarts the gateway's setup wizard; if that
  happens, ask the organizers);
- switch Windows Update on: it is off so that no update restarts the machine;
- stop the Recording Server less than 90 seconds after it started: it can hang;
- put passwords, tokens or keys into git or into a chat.

Good to know:

- Restarting the Hafnia gateway starts summaries in progress again, and Hafnia VLM may count them twice.
- After a reboot, XProtect needs 2–3 minutes before logins and APIs answer.
- Licence banners in Smart Client or Management Client are expected; the organizers handle licensing.

## Save your work

If your machine breaks, the organizers can rebuild it: about 25 minutes, same name, but a fresh machine, so
everything you added is gone. Keep these in your repository:

- your code, which finds cameras by name (camera IDs change on a rebuild);
- your XProtect setup as a script (MilestonePSTools or the REST API): events, rules, alarm definitions, webhooks, so
  it recreates them after the steps by hand in "After a rebuild" (the `xprotect-essentials` skill,
  `references/scripting.md`);
- your Hafnia prompts (gateway page, Prompts, **Export Prompts**) and gateway rules (recreate them through the gateway API);
- the gateway's system prompt and any *Advanced Settings* you changed: the prompt export does not include them.

Reproducibility is a judging criterion: the judges must be able to set up your solution on a fresh machine.

## Which skill next

| You want to | Skill |
|---|---|
| Use XProtect: Smart Client, Management Client, events, rules, alarms, and scripting your setup | `xprotect-essentials` |
| Use Hafnia VLM: prompts; webhooks that send a clip to Hafnia when an XProtect rule fires; gateway rules that turn a keyword in the answer into an XProtect analytics event; the gateway API | `hafnia-vlm` |
| Build an app that talks to XProtect: REST, WebSocket, webhooks | `xprotect-apis` |
| Build a plug-in inside Smart Client, Management Client or the Event Server | `xprotect-plugins` |

Hafnia webhooks and gateway rules are set up in Smart Client, Management Client and the gateway page: no code needed.

## When something is wrong

Symptoms and fixes, services, and log folders: [references/troubleshooting.md](references/troubleshooting.md).

Still stuck: email the organizers at hackathon.hafnia@milestone.dk with your machine name, what you did, and what
you saw.
