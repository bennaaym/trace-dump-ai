---
name: xprotect-plugins
description: Building MIP SDK plug-ins in C# (.NET Framework) that run inside XProtect Smart Client, Management Client or the Event Server on a participant's own Hafnia Hackathon 2026 machine (pNNN), and stand-alone C# apps that use the MIP .NET library. Which plug-in type fits a job, where Milestone's official docs, templates and samples are, and what is specific to the hackathon machines - the MIPPlugins folder and plugin.def, restarts, debugging, MIP logs, the 2026 R1 NuGet version, and leaving the Hafnia plug-in alone. Use when a participant wants code to run inside XProtect's own applications, writes a C# app with the MIP .NET library, or asks where Milestone documents plug-ins. Not for code that calls the REST or WebSocket APIs or receives webhooks (the xprotect-apis skill).
---

# Plug-ins for XProtect

A MIP plug-in is a C# DLL for .NET Framework. Smart Client, Management Client or the Event Server loads it when it
starts, and it runs inside that application. Milestone documents plug-ins well: this skill points to the official
page and sample for each job, and adds what is specific to your machine, which runs XProtect 2026 R1.

Code that can run outside XProtect can instead be an app that calls the REST APIs (the `xprotect-apis` skill): any
language, and nothing to restart.

## Which plug-in for which job

| You want to | Start from | Plug-in class | Runs in |
|---|---|---|---|
| Add a tab (a workspace) to Smart Client | [Smart Client Workspace](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCWorkSpace/README.html) | [WorkSpacePlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_client_1_1_work_space_plugin.html) | Smart Client |
| Add your own view item, a tile in a Smart Client view | The *MIPPlugin* template; [Video Preview](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/VideoPreview/README.html) for one that shows video | [ViewItemPlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_client_1_1_view_item_plugin.html) | Smart Client |
| Add a button to a camera's toolbar or to the workspace toolbar | [Smart Client Toolbar Plug-in](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCToolbarPlugin/README.html) | [ViewItemToolbarPlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_client_1_1_view_item_toolbar_plugin.html), [WorkSpaceToolbarPlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_client_1_1_work_space_toolbar_plugin.html) | Smart Client |
| Add a side panel, or a page in Smart Client's settings | [Smart Client Workspace](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCWorkSpace/README.html) (its side panel), [Smart Client Settings Panel](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCSettingsPanel/README.html) | [SidePanelPlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_client_1_1_side_panel_plugin.html), [SettingsPanelPlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_client_1_1_settings_panel_plugin.html) | Smart Client |
| Draw on top of live or recorded video | [Analytics Overlay](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/AnalyticsOverlay/README.html); [Smart Client Overlay Graph on Event](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCOverlayGraphOnEvent/README.html) for overlays from analytics events | [BackgroundPlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_background_1_1_background_plugin.html); `ClientControl.Instance.NewImageViewerControlEvent` gives it an [ImageViewerAddOn](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_client_1_1_image_viewer_add_on.html) | Smart Client |
| Show your own content when an operator selects an alarm | [Smart Client Alarm Preview](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/AlarmPreview/README.html) | [PluginDefinition](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_plugin_definition.html), `GenerateAlarmPreviewWpfUserControl` | Smart Client |
| Pop up a notification (a toast) in Smart Client | [Smart Client Toast](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCToast/README.html) | message `MessageId.SmartClient.ToastShowCommand` | Smart Client |
| Add your own search category to the Search workspace | [Search agents](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCSearchAgent/README.html) | [SearchAgentPlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_search_1_1_search_agent_plugin.html) | Smart Client |
| Add a tab to a camera's page in Management Client | [Admin Tab](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/AdminTabPlugin/README.html) | [TabPlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_admin_1_1_tab_plugin.html) | Management Client |
| Run code in the Event Server that sees every event as it happens | [Tracing Events](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/EventTracer/README.html) | [BackgroundPlugin](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_background_1_1_background_plugin.html), message `MessageId.Server.NewEventIndication` | Event Server |
| Add your own action to XProtect rules | [Bat file execution from rule action](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/BatAction/README.html) | [ActionManager](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_rule_action_1_1_action_manager.html) | Event Server |

*Runs in* is the application that loads the plug-in: your `plugin.def` names it (`references/your-machine.md`).

A stand-alone C# app can use the same library: `references/your-machine.md`, "Stand-alone C# apps".

## What is specific to your machine

- Plug-ins run on the machine, in Smart Client, Management Client and the Event Server. Test them there, over Remote
  Desktop.
- Debug on the machine: a debugger on your laptop cannot reach it.
- To install a plug-in: close the application that loads it, copy the files into a folder of your own in
  `C:\Program Files\Milestone\MIPPlugins`, and start the application again.
- The Hafnia plug-in is in `C:\Program Files\VideoOS\MIPPlugins`: leave it alone.
- The machine runs 2026 R1: the matching NuGet package is `MilestoneSystems.VideoOS.Platform` 26.1.

## For the assistant

- You are on the machine if `hostname` prints `p` and three digits (any case) **and**
  `sc.exe query "Milestone XProtect Management Server"` finds the service. Otherwise give the participant steps to
  run over Remote Desktop.
- Before writing plug-in code, read Milestone's page for the class and start from the template or the matching
  sample; do not write MIP SDK calls from memory.
- Plug-ins are .NET Framework projects (the template and samples target 4.7; the machine has 4.8). Target 4.8 when
  the plug-in calls the Hafnia gateway. Never make a plug-in for .NET 8.
- Ask before you close the participant's Smart Client or Management Client, and before you stop or restart the
  Event Server (`MilestoneEventServerService`): while it is stopped, alarms and analytics events do not work,
  including those from Hafnia gateway rules.
- Put the participant's plug-ins in `C:\Program Files\Milestone\MIPPlugins`. Never change the Hafnia plug-in's
  folder (in `C:\Program Files\VideoOS\MIPPlugins`) or XProtect's own plug-ins.
- Deploy only the plug-in's DLL, its `plugin.def` and the files its code needs; never `VideoOS.*` DLLs.
- Message handlers run on the UI thread when there is one: do slow work, such as calls to the Hafnia gateway,
  elsewhere.
- A plug-in that sees every event also sees every motion event from the cameras. Never send a Hafnia request
  for every event or for motion: filter to one event type first, and say how many of the participant's 500 requests a day
  the plug-in will use. Never let a Hafnia result trigger a new Hafnia request.
- Never write passwords into plug-in code, its files or the MIP log.

## Go deeper

| You want | Read |
|---|---|
| Milestone's docs by topic: getting started, how plug-ins work, samples, stand-alone apps, manuals, forum | `references/doc-map.md` |
| Start a project, deploy, debug and read logs on your machine; Hafnia from a plug-in; stand-alone C# apps | `references/your-machine.md` |

## When something does not work

- **The plug-in does not show up:** `references/your-machine.md`, "When the plug-in does not load".
- **The DLL cannot be copied because it is in use:** close Smart Client and Management Client. If the Event Server
  loads it too, stop the Event Server first.
- **Smart Client fails to start, or shows an error, after you added a plug-in:** move your plug-in's folder out of
  `MIPPlugins` and start Smart Client again.
- **Questions about the MIP SDK:** Milestone's [developer forum](https://forum.milestonesys.com/).
- **About your machine:** email hackathon.hafnia@milestone.dk with your machine name, what you did, and what you saw.
