# Milestone's plug-in documentation: where everything is

Milestone keeps its MIP SDK documentation online; open the links in a browser on the machine or on your laptop. The
pages are not split by XProtect version: the 2026 R1 release note below lists what changed in the version on your
machine.

## Start here

| Page | What it is |
|---|---|
| [Plug-in integration](https://doc.developer.milestonesys.com/mipsdk/content_1.html) | What a plug-in can do, and the three applications that host plug-ins |
| [Protocol, component or plug-in](https://doc.developer.milestonesys.com/mipvmsapi/content/integration-modes) | The three ways to integrate with XProtect, and what each allows |
| [Plug-in development](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/plug-in_development.html) | Requirements, the `MIPPlugins` folders, `plugin.def`, checking that a plug-in loaded, logs (its Smart Client log path is older than 2026 R1), debugging, deploying, versions |
| [Technical information](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/technical_information.html) | Version numbers and NuGet packages, the classes every plug-in needs, when plug-ins load |
| [MIP SDK templates](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/VsExtension.html) | Milestone's project templates, *MIPPlugin* among them |
| [MIP SDK 2026 R1 release note](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/mip2026r1_intro.html) | What changed in 2026 R1 |

## How plug-ins work

| Page | What it is |
|---|---|
| [Introduction to classes](https://doc.developer.milestonesys.com/mipsdk/reference/architecture/class_introduction.html) | The main classes: `PluginDefinition`, items, view item managers, `EnvironmentManager` |
| [Class overview and function](https://doc.developer.milestonesys.com/mipsdk/reference/architecture/class_overview_and_function.html) | The main kinds of Smart Client plug-in and where they appear; the Management Client and Event Server classes |
| [Class life cycle](https://doc.developer.milestonesys.com/mipsdk/reference/architecture/class_life_cycle.html) | When `Init()` and `Close()` run, and what is ready by then |
| [Working with messages](https://doc.developer.milestonesys.com/mipsdk/reference/architecture/plug-in_integration.html) | Sending and receiving messages inside an application; which thread receivers run on |
| [Video display and overlay](https://doc.developer.milestonesys.com/mipsdk/reference/architecture/video_display_and_overlay.html) | The video control, the item picker, overlays on video |
| [Configuration choices](https://doc.developer.milestonesys.com/mipsdk/reference/architecture/configuration_choises.html) | Where a plug-in can keep its settings |
| [Recommended user controls](https://doc.developer.milestonesys.com/mipsdk/reference/architecture/user_controls.html) | Ready-made WPF and WinForms controls that look like XProtect |
| [MIP Reference Manual](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/index.html) | Every class and member of the plug-in library |

## Topics

| Page | What it is |
|---|---|
| [Events and alarms](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/intro_events.html) | The kinds of events; sending analytics events and alarms; receiving new events in the Event Server |
| [Rule system integration](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/intro_rulesystem.html) | Your own events and actions in XProtect rules |
| [Analytics integration](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/intro_analytics.html) | Getting video out of XProtect, sending analytics events in, plug-ins for the Event Server and Smart Client |
| [MIP message communication](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/intro_mip_messaging.html) | Messages between applications, routed through the Event Server |
| [Search agents](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/intro_searchagent.html) | Your own search category in Smart Client's Search workspace |

## Plug-in samples

[All plug-in samples](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/index_1.html), by group. The
code is in [milestonesys/mipsdk-samples-plugin](https://github.com/milestonesys/mipsdk-samples-plugin), one solution
for all of them: `src\PluginSamples.sln`.

| Sample | What it shows |
|---|---|
| [Smart Client Workspace](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCWorkSpace/README.html) | A new tab in Smart Client with its own view, and a side panel |
| [Video Preview](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/VideoPreview/README.html) | Live video in your own view item or Management Client page; in Smart Client you can draw a line on it |
| [Smart Client Toolbar Plug-in](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCToolbarPlugin/README.html) | Buttons in the workspace toolbar and in camera view items' toolbars |
| [Smart Client Settings Panel](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCSettingsPanel/README.html) | Your own page in Smart Client's settings |
| [Analytics Overlay](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/AnalyticsOverlay/README.html) | An overlay on the camera you pick, wherever it is shown |
| [Smart Client Overlay Graph on Event](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCOverlayGraphOnEvent/README.html) | Overlays from analytics events on the camera they came from, live and in playback |
| [Smart Client Alarm Preview](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/AlarmPreview/README.html) | Your own content in the alarm preview when an operator selects an alarm |
| [Smart Client Toast](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCToast/README.html) | Show, update and remove notifications (toasts) in Smart Client |
| [Search agents](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCSearchAgent/README.html) | Your own search categories in the Search workspace |
| [Admin Tab](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/AdminTabPlugin/README.html) | Your own tab on a camera's page in Management Client |
| [Tracing Events](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/EventTracer/README.html) | An Event Server plug-in that writes every event to the MIP log |
| [Bat file execution from rule action](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/BatAction/README.html) | Your own action in XProtect rules, run by the Event Server |
| [Active Elements Overlay](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/ActiveElementsOverlay/README.html) | WPF controls an operator can click, on top of camera view items |
| [Smart Client Timeline](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/TimelineViewItem/README.html) | Your own sequences on the Smart Client timeline |
| [Smart Client Dynamic View](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/DynamicView/README.html) | A background plug-in that opens the selected alarm's cameras in a floating window |
| [Client actions in Smart Client](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/SCClientAction/README.html) | Actions an operator can put on keyboard shortcuts, joystick buttons or overlay buttons |
| [Message Tester](https://doc.developer.milestonesys.com/mipsdk/samples/PluginSamples/MessageTester/README.html) | Send any Smart Client message by hand and watch the messages that are sent |

## Stand-alone C# apps (component integration)

| Page | What it is |
|---|---|
| [How to integrate the MIP .NET library](https://doc.developer.milestonesys.com/mipsdk/content_2.html) | What a stand-alone app can do with the library |
| [Component environments for login](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/intro_environments_login.html) | Logging in: credentials, `secureOnly` |
| [.NET library initialization](https://doc.developer.milestonesys.com/mipsdk/reference/architecture/net_library_initialization.html) | Starting the library and logging in |
| [Component samples](https://doc.developer.milestonesys.com/mipsdk/samples/ComponentSamples/index_2.html) | Video viewers, events, alarms, bookmarks, configuration; the code is in [milestonesys/mipsdk-samples-component](https://github.com/milestonesys/mipsdk-samples-component) |

## XProtect 2026 R1 manuals

| Page | What it is |
|---|---|
| [Verify the current version of XProtect Smart Client](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/verify-the-current-version-of-xprotect-smart-client.html) | The About window: Smart Client and its plug-ins |
| [Advanced settings](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/advanced-settings.html) | Smart Client's logging switch and log files |
| [Managing server services](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/managing-server-services.html) | Starting, stopping and restarting the Event Server; what stops working meanwhile; its MIP logs |

## Help

| Page | What it is |
|---|---|
| [Developer forum](https://forum.milestonesys.com/) | Questions to Milestone's developer community |
