# Your Hafnia VLM allowance

## The numbers

| Question | Answer |
|---|---|
| How many requests? | 500 a day, for you alone. Teammates each have their own 500 on their own machines; allowances do not pool. |
| When does it reset? | Every day at 00:00 UTC, not at your local midnight. |
| What is one request? | One summary: one camera's clip and one prompt. |
| What counts? | Every summary that completes, whether it came from Smart Client (Summarization, Generate), a webhook or the gateway API. |
| What costs nothing? | A request that fails before it reaches Hafnia VLM, for example one asking for a time with no recording (recordings are kept 24 hours). |
| Where are the answers? | Smart Client, Summarization, History. The gateway keeps them 30 days (failed requests 1 day). |

## Check what is left

On the machine; the gateway is not reachable from your laptop.

- **Gateway page.** In Edge, open `https://localhost:15443/`, continue past the certificate warning, and log in as
  `administrator` with your Windows password. The System page shows *Daily Quota*: used / allowance, and the time
  left until the reset. *Monthly Quota* below it is the same count over Hafnia VLM's billing month. Never press
  *Reset System* on that page: it deletes your Hafnia connection, prompts, rules and history.
- **PowerShell:**

  ```powershell
  $q = ((curl.exe -sk https://localhost:15443/api/System/Information) -join '' | ConvertFrom-Json).QuotaInformation
  if ($q) { '{0} of {1} used today, resets {2:yyyy-MM-dd HH:mm} UTC' -f $q.DailySummaryCount, $q.DailySummaryQuota, ([datetime]$q.DailySummaryReset).ToUniversalTime() } else { 'Not available: the gateway or Hafnia VLM did not answer' }
  ```


## Read it from your code

One call: `GET https://localhost:15443/api/System/Information`. It needs no login.

- Your code must run on the machine.
- The gateway's certificate is self-signed, so your HTTP client must accept it. The example below turns certificate
  checks off for one client: use that client only for the gateway.
- Windows PowerShell 5.1's `Invoke-RestMethod` and `Invoke-WebRequest` cannot connect to the gateway. Use
  `curl.exe -k`, as above.

The answer is JSON; your allowance is in `QuotaInformation`. Example, with the other fields left out:

```json
{
  "QuotaInformation": {
    "DailySummaryQuota": 500,
    "DailySummaryCount": 37,
    "DailySummaryReset": "2026-10-08T00:00:00Z"
  }
}
```

| Field | Meaning |
|---|---|
| `DailySummaryQuota` | your daily allowance: 500 |
| `DailySummaryCount` | summaries asked for since 00:00 UTC that have completed |
| `DailySummaryReset` | when the count starts again from 0 (UTC) |

Left today: at most `DailySummaryQuota` minus `DailySummaryCount`.

No `QuotaInformation` in the answer: Hafnia VLM did not answer the gateway this time. Try again in a minute; if it
stays missing, ask the organizers.

Python 3, no extra packages:

```python
import json, ssl, urllib.request

ctx = ssl.create_default_context()
ctx.check_hostname = False       # certificate checks off for this client:
ctx.verify_mode = ssl.CERT_NONE  # use it only for the gateway

url = "https://localhost:15443/api/System/Information"
with urllib.request.urlopen(url, context=ctx, timeout=60) as response:
    quota = json.load(response).get("QuotaInformation")

if quota:
    left = quota["DailySummaryQuota"] - quota["DailySummaryCount"]
    print(f"{left} left today, resets {quota['DailySummaryReset']}")
else:
    print("Not available right now: try again in a minute")
```

C#: the same call, with an `HttpClient` set up as in the `hafnia-vlm` skill, `references/gateway-api.md`.

## The count and the limit

Hafnia VLM enforces the limit with its own count. The gateway's count can be lower: after a rebuild of your machine,
or when a gateway restart sends running summaries again. So your 500 minus the gateway's count is the most you have left.

## When it runs out

New summaries fail until 00:00 UTC. History shows them as *Failed*, with the error from Hafnia VLM. *Daily Quota* on
the System page can show less than 500 / 500 ("The count and the limit" above). Failed summaries are not tried
again: ask again after the reset.
Everything else keeps working: cameras, recordings, rules, alarms, your code.

## What 500 buys

| Pattern | Requests a day |
|---|---|
| Testing by hand in Smart Client | one per click on Generate Summarization |
| A check every 15 minutes on one camera | 96 |
| A check every 5 minutes on one camera | 288 |
| A check every 15 minutes on all five cameras | 480: nearly all of it |
| A rule that sends every motion event on one of these cameras to Hafnia | unpredictable, easily all of it: never do this |
| A gateway rule raises an analytics event from an answer, and a rule sends that event to Hafnia again | a loop until the allowance is gone: never do this |

## Spend it well

- **Trigger on purpose:** a user-defined event you raise yourself, a rule on a schedule, or an analytics event that
  no gateway rule raised. Never raw motion on these cameras.
- **Cap your code:** before each request, read `DailySummaryCount` and stop at a fixed number, for example 450. A
  per-camera cooldown alone is not enough: one request every 5 minutes on five cameras is 1,440 a day.
- **Reuse answers:** while you build your UI, read earlier answers (Smart Client History, or the gateway API: see
  the `hafnia-vlm` skill) instead of asking again.
- **Get the prompt right first,** by hand in Smart Client on a few clips, before you automate it.
- **Keep clips short:** a long clip costs the same one request, but it is slower, and the gateway gives up on an
  export that takes more than 60 seconds.
- **Split heavy testing** between teammates' machines.
- **Keep a reserve** for the day you record your demo video.
