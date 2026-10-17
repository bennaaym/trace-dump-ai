# Smart Client

Smart Client runs on the machine; open it over Remote Desktop. This file is the short version of Milestone's
[XProtect Smart Client 2026 R1 manual](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/index-en);
each section links the manual's pages.

## Log in

Manual: [Log in](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/log-in), [Allow HTTP connections](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/allow-http-connections).

1. Computer: `localhost`. Authentication: *Windows authentication (current user)*. Click **Connect**.
2. If a message says the connection uses an old security model, tick *Remember my choice. Do not show this message
   again* and select **Allow**. Your machine uses plain HTTP inside your private network; while you are connected
   this way, *Not secure* shows next to the toolbar.

## Find your way around

Manual: [User interface overview](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/user-interface-overview).

| Tab | What it is for |
|---|---|
| Views tab (named after the view you have open) | Live and recorded video |
| Exports | Video you are exporting |
| Search | Finding recordings, bookmarks, events, alarms, motion |
| Alarm Manager | Alarms to handle |
| System Monitor | The health of the system |
| Summarization | Hafnia VLM: see the `hafnia-vlm` skill |

**New views tab**, next to the tabs, opens another views tab.

## Watch live and recorded video

Manual: [The main timeline](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/the-main-timeline), [Create a view](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/create-a-view).

- **Open a view:** on the Views pane, open *Hackathon › Cameras › All cameras*. Double-click a camera to enlarge it.
- **Play back:** use the **PLAYBACK | LIVE** switch on the main timeline. In playback, drag the timeline or use the
  play buttons.
- **Make your own view:** click **Setup** on the toolbar, pick the *Private* group (only you see it), **Create new
  view**, choose a layout, name it, drag cameras from the *System overview* pane, then click **Setup** again to save.
  Changes made without **Setup** are temporary.

## Search

Manual: [Search for multiple criteria in video sequences](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/search-for-multiple-criteria-in-video-sequences).

1. Open the **Search** tab.
2. Set the time range (presets such as *Last 2 hours*, or *Custom interval*).
3. Choose cameras under *Selected cameras*.
4. **Search for**: *Alarms*, *Bookmarks*, *Events* or *Motion*, then **New search**.
5. For bookmarks, type a keyword: it matches the bookmark's ID, who added it, its headline and its description.

From a result, you can bookmark it or take a snapshot.

## Bookmarks

Manual: [Bookmarks](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/bookmarks), [Enable detailed bookmarks](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/enable-detailed-bookmarks).

- **Add one:** **Add bookmark** on the camera toolbar.
- **Give it a headline (at most 50 characters) and a description:** first switch on detailed bookmarks: *Settings and
  more*, *Settings*, *Functions* tab, and in the *Bookmark* row choose *Add bookmark details*.
- **See them:** blue bookmark marks on the timeline, and the Search tab.
- Hafnia webhooks can add bookmarks that hold Hafnia's answer: see the `hafnia-vlm` skill.

## Alarm Manager

Manual: [Alarms](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/alarms), [Using the Alarm list](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/using-the-alarm-list).

- The alarm list shows the newest alarms first and refreshes every 3 seconds.
- States: *New*, *In progress*, *On hold*, *Closed*.
- Right-click an alarm: **Acknowledge** (a *New* alarm becomes *In progress*) or **Close**.
- Right-click the list header to show or hide columns. Only columns switched on in Management Client (Alarms, Alarm
  Data Settings) are available.

## Fire a user-defined event by hand

Manual: [Manually activate events](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/manually-activate-events).

- In live mode, expand the *Event* pane and click **Activate** next to the event. Use this to test rules and
  webhooks without code.
- Nothing confirms it: look where the rule acts, for example History in Summarization for a Hafnia webhook.
- A new or renamed event is missing? Log out of Smart Client and in again.
- From PowerShell or your own code: `scripting.md`, and the `xprotect-apis` skill.
