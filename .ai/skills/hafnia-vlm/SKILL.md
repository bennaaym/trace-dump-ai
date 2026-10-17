---
name: hafnia-vlm
description: Using Hafnia VLM, the vision-language model, on a participant's own Hafnia Hackathon 2026 machine (pNNN). Covers the Summarization workspace in Smart Client, prompts and the system prompt, Hafnia webhooks that send a clip when an XProtect rule fires, gateway rules that turn a keyword in the answer into an XProtect analytics event and alarm, bookmarks that hold the answer, and the Hafnia gateway API (https://localhost:15443) from Python or C#. Use for anything that sends video to Hafnia VLM or reads its answers.
---

# Hafnia VLM on your machine

The Hafnia plug-in sends clips from your cameras to Hafnia VLM, a vision-language model in the cloud, and keeps the
answers.

## How it works

| Where | What you do there |
|---|---|
| Smart Client, *Summarization* | Ask by hand (*Generate*), read answers (*History*), create webhook addresses (*Webhooks Setup*) |
| Gateway page `https://localhost:15443/`, user `administrator`, your Windows password | Prompts, gateway rules, the system prompt, today's allowance (*System*) |
| Gateway API, same address | Ask, read answers, and manage prompts and rules from code |
| Management Client | XProtect webhooks, rules, user-defined and analytics events, alarms |

The gateway runs on the machine; your laptop cannot reach it.

1. A request is one camera, a stretch of its recording from the last 24 hours, and a prompt.
2. The gateway exports the clip from XProtect.
3. It sends the clip and the prompt to Hafnia VLM. A summary that completes costs 1 of your 500 requests a day,
   reset at 00:00 UTC (more: the `xprotect-hackathon` skill, `references/vlm-allowance.md`).
4. It stores the answer: read it in *History* or through the API.
5. A webhook request can also save the answer as a bookmark on the clip (off by default).
6. A gateway rule raises an XProtect analytics event when the answer contains its keyword, but only for requests made
   with its saved prompt.
7. The event carries the keyword, never the answer text. XProtect alarms and rules act on it.

| Start a request | How | Code |
|---|---|---|
| By hand | Smart Client, *Summarization*, *Generate* | no |
| From an XProtect rule | The rule calls a Hafnia webhook | no |
| From code on the machine | Gateway API, `POST /api/Summaries` | yes |
| From code on your laptop | Through XProtect: the `xprotect-hackathon` skill, "Working from your laptop", and the `xprotect-apis` skill | yes |

## For the assistant

- Code that calls the gateway runs on the participant's machine. You are on the machine if `hostname` prints `p` and
  three digits (any case) **and** `sc.exe query "Milestone XProtect Management Server"` finds the service. Otherwise
  give the participant steps to run over Remote Desktop.
- Before you run anything that sends requests in a loop, say how many of the 500 it will use. Never connect motion
  detection, or an analytics event that a gateway rule raised, to Hafnia.
- Never print the gateway password, write it into a file, commit it, or ask for it in the chat. Read it from an
  environment variable, or let the code ask for it when it runs.
- On the gateway page, never press *Reset System*. In Settings, change only the two *Advanced Settings* sections;
  *Hafnia VLM Settings* and *XProtect Settings* connect the gateway and are set up for the participant.
- Ask before you restart the gateway service: requests in progress start again from the beginning, and Hafnia VLM
  may count them twice.
- Find cameras by name and prompts by title: camera IDs change when the machine is rebuilt, prompt IDs when prompts
  are imported.
- Python and the .NET SDK are not installed on the machine: install what the participant needs first.

## Go deeper

| You want to | Read |
|---|---|
| Build the whole chain once, step by step: prompt, webhook, gateway rule, alarm, bookmark | `references/worked-example.md` |
| Write prompts that give usable answers; manage prompts and the system prompt | `references/prompts.md` |
| Set up and debug Hafnia webhooks: cameras, clip length, bookmarks | `references/webhooks.md` |
| Turn answers into analytics events, alarms and rules; why a rule does not fire | `references/gateway-rules.md` |
| Call the gateway from code: log in, ask, wait for the answer, list answers | `references/gateway-api.md` |

On the machine, a ready-made script asks about the last seconds of one camera. Install Python 3.11 or later from
python.org first. Then run this in PowerShell; it asks for a camera ID, which the tour script in the
`xprotect-hackathon` skill prints:

```powershell
py C:\HackathonKit\hafnia-vlm\scripts\ask_hafnia.py --camera (Read-Host 'Camera ID') --prompt "Describe what happens in this video."
```

## When something does not work

- **Nothing appears in History:** `references/webhooks.md`, "When it does not work".
- **A request failed:** open it in History and read *Error:*; the reasons are in the `xprotect-hackathon` skill,
  `references/troubleshooting.md`.
- **A gateway rule does not raise its event:** `references/gateway-rules.md`, "When the event does not arrive".
- **Still stuck:** email hackathon.hafnia@milestone.dk with your machine name, what you did, and what you saw.
