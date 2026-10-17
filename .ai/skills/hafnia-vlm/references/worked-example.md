# Worked example: confirm vandalism and raise an alarm

This uses every building block once. When an XProtect event fires, Hafnia VLM checks the `vandalism` camera, and
XProtect raises an alarm only if Hafnia confirms vandalism. The answer is also kept in a bookmark on the video.

- Do every step on the machine, over Remote Desktop.
- It costs 3 requests to set up and test, then 1 per check.

## 1. A prompt that answers with a keyword

Smart Client, Summarization, Generate tab: click **New**, set *Title* to `Vandalism check` and *Content* to:

```
Is someone damaging property in this video, such as breaking a window or throwing an object at a building?
Reply with exactly one word: VANDALISM_CONFIRMED if there is vandalism, NO_VANDALISM if there is not.
```

Click **Save**: the webhook and the gateway rule use the saved prompt.

## 2. Test it by hand

1. Click **+ Add Camera** and pick `vandalism`.
2. On the timeline, switch on time selection (its tooltip: *Set start and end time on timeline*), and select about
   30 seconds of recorded video.
3. Pick the prompt *Vandalism check* and click **Generate Summarization**.
4. Read the answer in History: you want `VANDALISM_CONFIRMED`.
5. Back on the Generate tab, click **Clear List** to remove the camera, and repeat with
   `highway_traffic_overcast_weather`, where you want `NO_VANDALISM`.

If the answers are wrong or wordy, improve the prompt before you automate it (`prompts.md`).

## 3. Switch on analytics events in XProtect

Management Client, Tools, Options, *Analytics Events* tab: select *Enable*, keep port 9090, select *All network
addresses*, and click OK.

## 4. Create the analytics event

Management Client, Rules and Events, Analytics Events: right-click *Analytics Events*, **Add New**, name it
`Hafnia vandalism confirmed`, save.

## 5. Create the gateway rule

In Edge, open `https://localhost:15443/` and log in as `administrator` with your Windows password. Rules,
**Create New Rule**:

- Name `Vandalism`, Prompt *Vandalism check*.
- Trigger text `VANDALISM_CONFIRMED`, Rule action *Triggers an Analytics Event in XProtect.*, Action option
  *Hafnia vandalism confirmed*.
- Click **Create**.

## 6. Create the alarm

Management Client, Alarms, Alarm Definitions: right-click, **Add New**. Name it `Vandalism (Hafnia)`, Triggering event
*Analytics Events*, then *Hafnia vandalism confirmed*, Sources `vandalism`. Save.

## 7. Create the Hafnia webhook

Smart Client, Summarization, Webhooks Setup:

- *Name* `Vandalism check`. *Prompt*: click **Refresh**, then pick *Vandalism check*.
- Tick *Override system defaults*: *Create Bookmark* Yes, *PreBuffer* 15, *PostBuffer* 15. The `vandalism` clip loops
  about every 8 seconds, so 30 seconds always contain it.
- **Select Camera**: `vandalism`. Click **Copy to Clipboard** next to *Generated Webhook URI*.

Then Management Client, Rules and Events, Webhooks: right-click, **Add New...**. Name it `Hafnia vandalism check`,
paste the address, leave *Token* empty, and save.

## 8. Create the trigger

Management Client, Rules and Events:

- User-defined Events: right-click *Events*, **Add User-defined Event**, name it `Check vandalism`, OK.
- Rules: right-click, **Add Rule**, name `Ask Hafnia about vandalism`. In step 1, click *event* in the rule
  description and choose the user-defined event *Check vandalism*. In step 3, select *Send event info to
  \<webhooks\>*, click *address* and add the webhook *Hafnia vandalism check*. **Finish**.

## 9. Fire it

In PowerShell on the machine:

```powershell
Import-Module MilestonePSTools
Connect-Vms -ServerAddress 'http://localhost' -AcceptEula | Out-Null
Get-UserDefinedEvent -Name 'Check vandalism' | Send-UserDefinedEvent
```

Or by hand: Smart Client, live mode, expand the *Event* pane and click **Activate** next to *Check vandalism*. If it
is not listed, log out of Smart Client and in again.

## 10. Check the result

In Smart Client:

- History shows the request with *Trigger* Webhook and *Trigger name* Vandalism check. Wait until it is *Completed*.
- If the answer contains `VANDALISM_CONFIRMED`, Alarm Manager shows the alarm *Vandalism (Hafnia)*.
- The camera's timeline has a bookmark whose description holds the answer.

Nothing in History: `webhooks.md`, "When it does not work". No alarm: `gateway-rules.md`, "When the event does not
arrive".

## Make it yours

Replace step 8's user-defined event with the event that should start a check: a schedule or an event your code
raises. Never use raw motion on these cameras, and never an analytics event that a gateway
rule raised: each would use up your allowance.
