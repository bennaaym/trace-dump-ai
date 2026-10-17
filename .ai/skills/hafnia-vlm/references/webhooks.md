# Hafnia webhooks

A Hafnia webhook is an address on the gateway. An XProtect rule with the action *Send event info to \<webhooks\>*
calls it when the rule fires. The gateway then exports a clip around the event time from one camera and asks Hafnia
VLM about it with the webhook's prompt; the answer arrives in History. Each summary that completes costs 1 of your 500 requests a day.
To ask from your own code, use the gateway API instead (`gateway-api.md`).

## Set one up

1. **Generate the address.** Smart Client, Summarization, **Webhooks Setup**:

   | Field | What to choose |
   |---|---|
   | *Name* | Shown as *Trigger name* in History and used as the bookmark's headline |
   | *Endpoint* | Keep it |
   | *AI Model* | Keep the default |
   | *Prompt* | A saved prompt; click **Refresh** if you created it after opening Summarization |
   | *Override system defaults* | Tick it to set *Create Bookmark* (Default, Yes, No), *PreBuffer* and *PostBuffer* (0–30 seconds each) for this webhook only |
   | *Selected Camera (optional)* | **Select Camera**: see "Which camera the clip comes from" |

   Then click **Copy to Clipboard** next to *Generated Webhook URI*.
2. **Add it to XProtect.** Management Client, Rules and Events, Webhooks: right-click, **Add New...**. Enter a name,
   paste the address, leave *Token* empty, and save.
3. **Make a rule call it.** Management Client, Rules and Events, Rules: right-click, **Add Rule**. In step 1, click
   *event* in the rule description and choose the event that should start a check. In step 3, select *Send event
   info to \<webhooks\>*, click *address* and add your webhook. **Finish**.
4. **Test it.** Fire the event and watch History in Smart Client: the request shows *Trigger* Webhook, *Trigger name*
   the *Name* you typed in Webhooks Setup, and *Source* the event.

To test with a user-defined event (Management Client, Rules and Events, User-defined Events), fire it from
PowerShell on the machine:

```powershell
Import-Module MilestonePSTools
Connect-Vms -ServerAddress 'http://localhost' -AcceptEula | Out-Null
Get-UserDefinedEvent -Name (Read-Host 'Event name') | Send-UserDefinedEvent
```

If nothing arrives in History, check the event's name: `Get-UserDefinedEvent -Name (Read-Host 'Event name')` alone
must print the event.

## Which camera the clip comes from

| The event comes from | The webhook's camera | Result |
|---|---|---|
| Camera A | none | Clip from A |
| Camera A | A | Clip from A |
| Camera A | B | *Failed*: "only one video source" |
| No camera (a user-defined event, a schedule) | B | Clip from B |
| No camera | none | Rejected: nothing in History; see "When it does not work" |

## Clip length and timing

- The clip runs from the event time minus *PreBuffer* to the event time plus *PostBuffer*.
- The defaults are 2 and 2 seconds: gateway page, Settings, *XProtect Advanced Settings*, *Default pre-buffer used
  with Webhooks* and *Default post-buffer used with Webhooks*. *Override system defaults* changes them for one
  webhook, 0–30 seconds each.
- The event time is the time in XProtect's event. A schedule has no event, so its time is when the call arrived.
- The gateway starts the export only after the post-buffer has passed. The export must finish within 60 seconds.
- A longer clip costs the same 1 request, but the export and the answer take longer.

## Bookmarks with the answer

- Off by default. For one webhook: *Override system defaults*, *Create Bookmark* Yes. For all webhooks: gateway
  page, Settings, *XProtect Advanced Settings*, *Create bookmarks for webhooks*.
- Only completed webhook requests get a bookmark. Requests made by hand or through the API do not.
- The bookmark is created when the answer arrives, on the clip's camera, over the clip's time span.
- Headline: the webhook's *Name*.
  Description: `This summary is AI-generated:` followed by the answer.
- To find bookmarks by their text: Smart Client, Search, select the cameras, search for bookmarks, and type a word
  from the answer as the keyword.

## The webhook address

- The address holds the webhook's settings: the prompt's ID, the camera's ID if you selected one, the name, and the
  buffers and bookmark choice if you ticked *Override system defaults*.
- To change a webhook, generate a new address and paste it into the webhook in Management Client.
- Prompt and camera IDs change on a fresh machine: generate the addresses again there.

## When it does not work

Nothing in History: search all the gateway's log files, not only the newest; in PowerShell on the machine:

```powershell
Get-ChildItem 'C:\ProgramData\VideoOS\Hafnia.Vlm.Gateway\logs' -Recurse -File | Sort-Object LastWriteTime | Select-String -Pattern 'webhook|Prompt with ID' | Select-Object -Last 20
```

| You see | Do this |
|---|---|
| Log: `Invalid webhook signature` | The XProtect webhook's *Token* must match the gateway's *Secret Token* (gateway page, Settings, *XProtect Advanced Settings*), which is empty by default. From your own code, use the gateway API instead. |
| Log: `No video URIs could be created from webhook payload for scheme 'xprotect'.` | The event has no camera and the webhook has none either. Generate the address again with a camera selected, and update the XProtect webhook. |
| Log: `Prompt with ID '…' not found.` | The prompt was deleted. Generate the address again with an existing prompt, and update the XProtect webhook. |
| Log: `Webhooks are disabled in the XProtect advanced settings.` | Gateway page, Settings, *XProtect Advanced Settings*: set *Enable webhooks* to Yes. |
| None of these in the gateway logs | The rule did not fire, or XProtect could not deliver the call. Look in the Event Server logs, `C:\ProgramData\Milestone\XProtect Event Server\Logs`, and fire a user-defined event as above to test the webhook alone. |
| History: *Failed*, "only one video source" | The event's camera differs from the webhook's camera. See "Which camera the clip comes from". |
| History: *Failed* with another reason | See the `xprotect-hackathon` skill, `references/troubleshooting.md`, "When a summary fails". |
| No bookmark | Bookmarks are off by default, and only completed webhook requests get one. |
| More requests than expected | The rule's event fires more often than you think. Never use motion on these cameras, or an analytics event that a gateway rule raised. |
