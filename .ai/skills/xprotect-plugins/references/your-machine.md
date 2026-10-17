# Plug-ins on your machine

Milestone's [Plug-in development](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/plug-in_development.html)
page covers setup, deployment, debugging and logs for any XProtect. These are the details of yours: XProtect 2026 R1
on one Windows Server 2022 machine with .NET Framework 4.8.

## Where plug-ins run

- Smart Client, Management Client and the Event Server run on the machine, so your plug-in runs there. Test it there,
  over Remote Desktop.
- Debug on the machine: a debugger on your laptop cannot reach it.

## Start a project

### From the template

- Milestone's *MIPPlugin* template
  ([MIP SDK templates](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/VsExtension.html)) makes a bit of
  everything: a Smart Client workspace, side panel, view items, toolbar buttons and settings page; a Management
  Client node, tab and options page; and a background plug-in that runs in the Event Server. Delete what you do not
  need, and the lines in `…Definition.cs` that create it.
- Replace the five placeholder IDs below the comment `// IMPORTANT!` in `…Definition.cs` with new GUIDs (in
  PowerShell: `[guid]::NewGuid()`). Until you do, Smart Client and Management Client show *Default GUID has not been
  replaced*.
- Its `plugin.def` has no `load` line, so every application loads it, the Event Server too. Add one that names only
  the applications you need ("plugin.def" below).

### From a sample

- Git is not installed on the machine: install it first (the `xprotect-hackathon` skill, "Your first 30 minutes",
  step 7).
- On the machine, in PowerShell: `git clone https://github.com/milestonesys/mipsdk-samples-plugin`
- Open `src\PluginSamples.sln`. A sample's folder does not build on its own: the samples share
  `src\CommonSamples.cs`.
- **Admin Tab** shows its tab only on Axis cameras, and yours are not. As its README says, make `IsVisible` in
  `AdminTabPlugin\Admin\AdminTabCameraPlugin.cs` return `true`.
- **Smart Client Alarm Preview** and **Smart Client Dynamic View** need alarms; **Smart Client Overlay Graph on
  Event** needs analytics events. The `xprotect-essentials` skill shows how to make both.
- **Bat file execution from rule action** reads `.bat` files from a `BatFiles` folder next to its DLL: copy
  `BatAction\BatFiles` there yourself.

## The NuGet package

- Plug-ins use `MilestoneSystems.VideoOS.Platform`. Version 26.1 matches 2026 R1, your machine. If NuGet offers a
  newer one, set `Version="26.1.*"` in the project file, so you use only what your machine has.
- Never use `MilestoneSystems.VideoOS.Platform.SDK` in a plug-in: it is for stand-alone apps.

## plugin.def

It sits next to your DLL, names it, and says which applications load it:

```xml
<plugin>
   <file name="MyPlugin.dll"/>
   <load env="SmartClient"/>
</plugin>
```

| `load env=` | Application |
|---|---|
| `SmartClient` | Smart Client |
| `Administration` | Management Client |
| `Service` | Event Server |

Name several with commas, for example `env="SmartClient, Administration"`. Without a `load` line, every application
loads the plug-in.

## Deploy

1. Make a folder for your plug-in in `C:\Program Files\Milestone\MIPPlugins`, named after your project, for example
   `C:\Program Files\Milestone\MIPPlugins\MyPlugin`.
2. Close the application that loads the plug-in (table below): its DLL cannot be replaced while it runs.
3. Copy your DLL, `plugin.def` and any files your code needs into the folder. Leave out `VideoOS.*` DLLs and language
   folders such as `de-DE`: the applications have their own.
4. Start the application again: it loads plug-ins when it starts.

| Loaded by | Before you copy | After you copy |
|---|---|---|
| Smart Client | close Smart Client | start it and log in |
| Management Client | close Management Client | start it |
| Event Server | in PowerShell: `Stop-Service MilestoneEventServerService` | `Start-Service MilestoneEventServerService` |

While the Event Server is stopped, alarms and analytics events do not work, including those from Hafnia gateway rules
([Stopping the Event Server service](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/managing-server-services.html#stopping-the-event-server-service)).

### Copy after each build

Milestone's page shows a post-build step that copies the DLL after each build. On your machine:

```
xcopy /y "$(TargetPath)" "C:\Program Files\Milestone\MIPPlugins\$(ProjectName)"
```

- The folder from step 1 must exist, and writing to it needs administrator rights.
- Copy `plugin.def` into the folder once by hand.
- Close the application before you build: the copy fails while it holds the DLL.

### Leave these alone

| Folder | What it is |
|---|---|
| `C:\Program Files\VideoOS\MIPPlugins\Milestone XProtect Hafnia Integration MIP Plugin` | the Hafnia plug-in |
| `C:\Program Files\Milestone\MIPPlugins\MobileAdministrator` | installed with XProtect |
| The applications' own folders in `C:\Program Files\Milestone` | XProtect itself: put nothing there |

## Check that it loaded

- **Smart Client:** *Settings and more* on the global toolbar, *About*, lists the plug-ins
  ([manual](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/verify-the-current-version-of-xprotect-smart-client.html)).
- **Management Client:** Help, About.
- **Event Server:** its MIP log ("Logs" below) has `PluginLoader` lines about the plug-ins it loaded.

## Debug

Milestone's page describes debugging: start the application from your development environment, with your plug-in in
place. On your machine:

| Plug-in in | Program | Arguments |
|---|---|---|
| Smart Client | `C:\Program Files\Milestone\XProtect Smart Client\Client.exe` | |
| Management Client | `C:\Program Files\Milestone\XProtect Management Client\VideoOS.Administration.exe` | |
| Event Server | `C:\Program Files\Milestone\XProtect Event Server\VideoOS.Event.Server.exe` | `-x` |

- The application loads your DLL from `MIPPlugins`, not from the build folder: copy each build there first.
- Event Server: stop the service first (`Stop-Service MilestoneEventServerService`); with `-x` it then runs as a
  program, as you. When you finish: `Start-Service MilestoneEventServerService`.
- As a service, the Event Server runs as the Windows account Network Service, not as you: test there too.

## Logs

Write to the MIP log with `EnvironmentManager.Instance.Log(false, "MyPlugin", "Init done")`; `true` instead of
`false` marks an error ([reference](https://doc.developer.milestonesys.com/mipsdk/MIPHelp/class_video_o_s_1_1_platform_1_1_environment_manager.html)).

| Application | MIP log |
|---|---|
| Smart Client | Switch logging on first: *Settings and more*, *Settings*, *Advanced*, *Logging (for technical support)*. Then `MIPLogger.log` in `C:\ProgramData\Milestone\XProtect Smart Client\Logs` ([manual](https://doc.milestonesys.com/xprotect/xprotect-smart-client/2026r1/en/advanced-settings.html)); Milestone's plug-in page shows an older place |
| Management Client | `C:\ProgramData\Milestone\XProtect Management Client\Logs` (Milestone's page: `MIPtrace.Log`) |
| Event Server | `C:\ProgramData\Milestone\XProtect Event Server\logs\MIPLogs`, one file a day |

## When the plug-in does not load

- The DLL is in its own folder in `MIPPlugins`: `C:\Program Files\Milestone\MIPPlugins\MyPlugin\MyPlugin.dll`.
- `plugin.def` is in the same folder and names the DLL exactly.
- The `load` line names the application, or there is no `load` line.
- You restarted the application after copying.
- The project is .NET Framework, built for Any CPU or x64, not .NET 8.
- The application's MIP log says why ("Logs" above).
- A Milestone sample that loads but shows nothing may need something first ("From a sample" above).

## Hafnia from a plug-in

- Plug-ins run on the machine, where the Hafnia gateway is (`https://localhost:15443`). Its API: the `hafnia-vlm`
  skill, `references/gateway-api.md`.
- The C# example there is for .NET 8. A plug-in is .NET Framework, so the example does not compile as it is: use it
  for the calls and fields.
- Its certificate setting needs .NET Framework 4.7.2 or later: target 4.8.
- Never write the gateway password into your plug-in, its files or the MIP log.
- A summary that completes costs 1 of your 500 requests a day; one that fails before it reaches Hafnia VLM costs
  nothing.

## Stand-alone C# apps

- A Windows app or service that uses the MIP .NET library is a component integration
  ([How to integrate the MIP .NET library](https://doc.developer.milestonesys.com/mipsdk/content_2.html)): it can show
  video, send events and read configuration.
- The library is the NuGet package `MilestoneSystems.VideoOS.Platform.SDK` (.NET Framework 4.7.2 or later).
- Run the app on the machine: it gets video and events straight from the Recording Server and the Event Server,
  which your laptop cannot reach.
- Log in to `http://localhost` with `secureOnly` set to `false`: your machine uses plain HTTP
  ([Component environments for login](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/intro_environments_login.html)).
- Start from Milestone's [component samples](https://doc.developer.milestonesys.com/mipsdk/samples/ComponentSamples/index_2.html);
  their code is in [milestonesys/mipsdk-samples-component](https://github.com/milestonesys/mipsdk-samples-component).
