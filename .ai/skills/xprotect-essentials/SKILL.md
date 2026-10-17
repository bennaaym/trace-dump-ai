---
name: xprotect-essentials
description: Using Milestone XProtect on a participant's own Hafnia Hackathon 2026 machine (pNNN). Smart Client (views, live and playback, search, bookmarks, Alarm Manager, firing events by hand) and Management Client (user-defined and analytics events, rules, webhooks, alarm definitions, basic users); how events, rules and alarms connect; and PowerShell scripting with MilestonePSTools so a rebuilt machine gets the setup back. Use when a participant asks how to do something in XProtect itself. Not for Hafnia prompts, creating Hafnia webhook addresses or gateway rules (the hafnia-vlm skill), nor for application code that calls XProtect's APIs (the xprotect-apis skill).
---

# XProtect on your machine

Your machine runs XProtect Corporate 2026 R1, and you are its administrator. You work in two applications on the
machine, over Remote Desktop:

| Application | For | Log in |
|---|---|---|
| Smart Client | Watching: live and recorded video, search, bookmarks, alarms | Computer `localhost`, *Windows authentication (current user)*, **Connect** |
| Management Client | Configuring: events, rules, webhooks, alarms, users | Computer `localhost`, Windows authentication as yourself |

## How XProtect reacts to things

XProtect raises an **event** when something happens:

| Event | Raised by |
|---|---|
| Device event, for example motion | A camera |
| User-defined event | A person in Smart Client, a rule, or code |
| Analytics event | Another system, such as the Hafnia gateway |
| System event, for example a camera not responding | XProtect itself |

- A **rule** reacts to an event, or to a schedule, with actions: for example start a recording, raise a
  user-defined event, or send the event to a **webhook** (an address of your own, or a Hafnia webhook).
- An **alarm definition** turns an event into an **alarm** in Smart Client's Alarm Manager. It needs no rule.

| Thing | Where in Management Client |
|---|---|
| Rules, user-defined events, analytics events, webhooks | Rules and Events |
| Alarm definitions, alarm list columns | Alarms |
| Basic users, roles | Security |
| Cameras, motion detection | Devices, Cameras |

## What is already set up

- The cameras, in the device group *Hackathon*, and the Smart Client view *Hackathon › Cameras › All cameras*. Their
  names are in the `xprotect-hackathon` skill.
- XProtect's default rules, such as *Default Record on Motion Rule* and *Default Start Feed Rule*. They keep video
  and recording running: leave them alone.
- Recordings are kept 24 hours.
- Analytics events are switched off, and none exist.
- None of your own user-defined events, webhooks, alarm definitions or basic users exist yet. You add what you need.

## For the assistant

- XProtect's clients and MilestonePSTools run on the participant's machine. You are on the machine if `hostname`
  prints `p` and three digits (any case) **and** `sc.exe query "Milestone XProtect Management Server"` finds the
  service. Otherwise give the participant steps to run over Remote Desktop.
- Off the machine, never run `Connect-Vms` or anything from `references/scripting.md`: `localhost` there can be the
  participant's own XProtect.
- Every new PowerShell process starts unconnected: first run `Import-Module MilestonePSTools` and
  `Connect-Vms -ServerAddress 'http://localhost' -AcceptEula | Out-Null`. Without `-ServerAddress`, `Connect-Vms`
  can open a login dialog and wait.
- Write PowerShell of more than one line to a `.ps1` file, and run it with
  `powershell -NoProfile -ExecutionPolicy Bypass -File` and the file's path.
- A script that calls `Read-Host` (passwords, tokens) is for the participant to run in their own PowerShell window.
- Smart Client, switching analytics events on, and **Test Event** have no command: give the participant the clicks.
  Create analytics events by hand or with the Configuration REST API (`references/scripting.md`).
- Never change or delete the default rules, the recording server's storage, or the cameras' hardware settings, and
  ask before deleting anything else.
- Never let motion, or an analytics event that a Hafnia gateway rule raised, start a Hafnia webhook: each call can
  cost 1 of the participant's 500 requests a day.
- Prefer a script for anything the participant will need again on a rebuilt machine (`references/scripting.md`).
- Never print passwords, put them in scripts or files, or ask for them in the chat: scripts ask for them as secure
  strings when they run (`Read-Host -AsSecureString`).

## Go deeper

| You want to | Read |
|---|---|
| Watch, play back, search, bookmark, handle alarms, fire an event by hand | `references/smart-client.md` |
| Create events, rules, webhooks, alarm definitions and basic users | `references/management-client.md` |
| Script your setup so a rebuilt machine gets it back | `references/scripting.md` |
| Read Milestone's full manuals | [Smart Client 2026 R1](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/index-en), [Management Client 2026 R1](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/index-en) |
| Use Hafnia VLM from XProtect | the `hafnia-vlm` skill |
| Call XProtect from your own code, or receive its webhooks | the `xprotect-apis` skill |

## When something does not work

- **A rule does nothing:** check that it is active: a red x on the rule in the Rules list means it is not. Tick
  *Active* in its properties and click **Save**.
- **To see whether it fires:** fire a user-defined event by hand (`references/smart-client.md`), or add the action
  *Make new \<log entry\>* to the rule and look for the entry in Management Client, Server Logs.
- **A rule on a camera event:** the camera must have that feature on, for example motion detection.
- **To check a rule:** right-click it, **Validate Rule**.
- **A change has no effect:** click **Save** on the Management Client toolbar.
- **Smart Client does not show a renamed or new user-defined event:** log out of Smart Client and in again.
- **Everything else on the machine:** the `xprotect-hackathon` skill, `references/troubleshooting.md`.
- **Still stuck:** email hackathon.hafnia@milestone.dk with your machine name, what you did, and what you saw.
