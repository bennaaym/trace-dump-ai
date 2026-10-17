# Gateway rules: from an answer to an XProtect event

A gateway rule watches the answers to one saved prompt. When an answer contains the rule's trigger text, the gateway
raises an XProtect analytics event. XProtect alarm definitions and rules then act on it. No code is needed.

## Before you start

1. **Switch on analytics events.** Management Client, Tools, Options, *Analytics Events* tab: select *Enable*, keep
   port 9090, select *All network addresses*, and click OK.
2. **Create an analytics event** for each outcome you want to act on. Management Client, Rules and Events, Analytics
   Events: right-click *Analytics Events*, **Add New**, name it, save.
3. **Have a saved prompt that answers with keywords.** See `prompts.md`.

## Create the rule

On the machine, open `https://localhost:15443/` in Edge and log in as `administrator` with your Windows password.
Rules, **Create New Rule**:

| Field | Value |
|---|---|
| *Name* | Your name for the rule. XProtect shows it in the event's type: `Hafnia Rule '<Name>'`. |
| *Description* | Optional |
| *Prompt* | The saved prompt whose answers the rule watches |
| *Trigger text* | The keyword, exactly as the prompt asks for it, with no spaces or punctuation around it |
| *Rule action* | *Triggers an Analytics Event in XProtect.* |
| *Action option* | The analytics event to raise |

**Add trigger** adds another keyword, which can raise a different analytics event. Click **Create**. If your
analytics event is not in the *Action option* list, check that it exists in Management Client and open the dialog
again. Rules point to their prompt by ID: after importing prompts on a fresh machine, create the rules again.

## Which answers a rule looks at

- Only completed requests that carry the rule's saved prompt:
  - **by hand:** that prompt is selected in the *Prompt* list;
  - **webhook:** the webhook was generated with that prompt;
  - **gateway API:** the request sends the prompt's ID as `PromptId` (see `gateway-api.md`). The same text sent
    without `PromptId` is never checked.
- Each answer is checked once, when it arrives.

## How the trigger text is matched

The trigger text must appear in the answer as a whole word, anywhere in the answer, ignoring case.

| Answer | Trigger text | Raises the event? |
|---|---|---|
| `VANDALISM_CONFIRMED` | `VANDALISM_CONFIRMED` | Yes |
| `Vandalism_confirmed.` | `VANDALISM_CONFIRMED` | Yes |
| `NO_VANDALISM` | `VANDALISM_CONFIRMED` | No |
| `VANDALISM_CONFIRMED` | `VANDALISM` | No: `_` counts as part of the word |
| `There is no vandalism.` | `NO` | Yes: avoid plain words as trigger text |
| `VANDALISM_CONFIRMED.` | `VANDALISM_CONFIRMED.` | No: never end trigger text with punctuation |

- A rule raises at most one event per answer: the first of its triggers that matches, in the order listed.
- All rules for the same prompt are checked, so several rules can each raise their event for one answer.

## What XProtect receives

| Part of the analytics event | Value |
|---|---|
| Event | The analytics event chosen in *Action option* |
| Type | `Hafnia Rule '<rule name>'` |
| Tag | The trigger text that matched |
| Source | The clip's camera |
| Time | The clip's start and end |

The answer text is not part of the event, so an alarm shows the keyword (*Tag*), never the answer. Without code, a
webhook with bookmarks keeps the answer on the same camera and time (`webhooks.md`). To bring the text into
XProtect yourself, read it through the gateway API (`gateway-api.md`) and use XProtect's APIs (the `xprotect-apis`
skill).

## Act on the event

- **Alarm:** Management Client, Alarms, Alarm Definitions: right-click, **Add New**. Triggering event *Analytics
  Events*, then your event; Sources: the camera, or *All Cameras*. The alarm appears in Smart Client's Alarm Manager.
- **XProtect rule:** Management Client, Rules and Events, Rules: **Add Rule** with your analytics event as the event
  and any action, for example starting a recording, or a webhook to your own service on the machine.
- **Tag and Type in the alarm list:** Management Client, Alarms, *Alarm Data Settings*: move *Tag* and *Type* to the
  selected list. Then in Smart Client's Alarm Manager, right-click the column headers and add *Tag* and *Type*.

**Never let one of these events start a Hafnia request.** Each answer would raise the event again, and the loop
runs until your allowance is gone.

## When the event does not arrive

1. In History, the request must be *Completed*.
2. The request must carry the rule's saved prompt (see "Which answers a rule looks at").
3. The answer must contain the trigger text as a whole word: use **Copy to clipboard** in History and compare.
4. Analytics events must be switched on in Management Client, and the port must match the gateway's *Analytics
   Events Port* (gateway page, Settings, *XProtect Advanced Settings*; 9090 by default). In Settings, change only the
   two *Advanced Settings* sections.
5. The analytics event must exist under exactly the name the rule shows. The rule stores the name: if you renamed
   the event, edit the rule.
6. An alarm definition or rule must use the event, and its sources must include the camera.
7. Search the gateway's log files for rule errors; a rule that works writes nothing there. In PowerShell on the
   machine:

   ```powershell
   Get-ChildItem 'C:\ProgramData\VideoOS\Hafnia.Vlm.Gateway\logs' -Recurse -File | Sort-Object LastWriteTime | Select-String -Pattern 'Failed to (trigger|execute rule action|evalute rule)' | Select-Object -Last 20
   ```
