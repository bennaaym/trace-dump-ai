# Scripting XProtect with MilestonePSTools

MilestonePSTools 25.2.61 is installed on the machine. It reads and changes what Management Client shows, so a script
in your repository can set your solution up again on a fresh machine. Run everything below in PowerShell on the
machine, logged in as yourself over Remote Desktop.

- For a command's help, run `Get-Help` with its name, for example `Get-Help New-VmsRule -Examples`: it shows the
  help of the version on your machine.
- The help is also online: [MilestonePSTools commands](https://www.milestonepstools.com/commands/en-US/).
- The examples are written for Windows PowerShell 5.1, the PowerShell on the machine.

## Connect

```powershell
Import-Module MilestonePSTools
Connect-Vms -ServerAddress 'http://localhost' -AcceptEula | Out-Null
```

- You connect as your Windows user: no password needed.
- Every new PowerShell window must connect again.
- Made something in Management Client while PowerShell was open? Run `Clear-VmsCache` so the commands see it.

## Look things up

Run one line at a time:

```powershell
Get-VmsCamera | Select-Object Name, Id                       # cameras and their IDs
Get-VmsCamera -Name 'part of a name'                         # cameras whose name contains this text, in any case
Get-UserDefinedEvent | Where-Object Subtype -eq UserDefined | Select-Object Name, Id  # your user-defined events
Get-VmsWebhook                                               # webhooks
Get-VmsRule | Select-Object DisplayName                      # rules, including XProtect's default rules
Get-VmsAlarmDefinition | Select-Object Name                  # alarm definitions
Get-VmsBasicUser                                             # basic users
Get-Bookmark -StartTime ([DateTime]::UtcNow).AddHours(-2)    # bookmarks of the last 2 hours
Get-AlarmLine | Sort-Object Timestamp | Select-Object Timestamp, Message, SourceName, StateName  # alarms
```

- IDs change when a machine is rebuilt: in scripts, look things up by name.
- `Get-VmsCamera -Name` matches part of a name. For the other commands, give the whole name; `Get-VmsRule`,
  `Get-VmsAlarmDefinition` and `Get-VmsWebhook` also take `*` for any text, for example `Get-VmsRule -Name '*Hafnia*'`.

## Set your solution up with one script

1. Start a file `setup.ps1` in your repository with these lines:

   ```powershell
   $ErrorActionPreference = 'Stop'
   Import-Module MilestonePSTools
   Connect-Vms -ServerAddress 'http://localhost' -AcceptEula -ErrorAction Stop | Out-Null
   ```

2. Add the blocks you need, in this order:
   1. user-defined events and webhooks;
   2. the line `Clear-VmsCache`, so the next blocks see what the first ones made;
   3. alarm definitions, rules and basic users.
3. Run it in PowerShell, in your repository's folder: `powershell -ExecutionPolicy Bypass -File .\setup.ps1`. It
   stops at the first error.

Each block checks the name first, so the script can run again without making duplicates. The check is by name
only: after you change a block, delete that item in Management Client and run the script again.

### User-defined event

```powershell
$name = 'Test event'
if (Get-UserDefinedEvent | Where-Object Name -eq $name) {
    "present: $name"
} else {
    Add-UserDefinedEvent -Name $name -ErrorAction Stop | Out-Null
    "created: $name"
}
```

To fire it and test a rule:

```powershell
Get-UserDefinedEvent -Name 'Test event' | Send-UserDefinedEvent
```

If the rule does not react, check the name: `Get-UserDefinedEvent -Name 'Test event'` alone must print the event.

### Webhook

```powershell
$name = 'My receiver'
if (Get-VmsWebhook | Where-Object Name -eq $name) {
    "present: $name"
} else {
    New-VmsWebhook -Name $name -Address 'http://127.0.0.1:5000/webhooks' -ErrorAction Stop | Out-Null
    "created: $name"
}
```

- XProtect allows two webhooks with the same name: without the check, every run adds one more.
- To sign the calls to your own receiver with a token, add `-Token (Read-Host 'Webhook token')` and paste the block alone; keep the token
  out of the script.
- A Hafnia webhook's address holds the prompt's ID, and the camera's ID if you selected one; both change on a
  rebuild. Generate the address again (the `hafnia-vlm` skill, `references/webhooks.md`) and paste it into the
  script.

To change the address of an existing webhook:

```powershell
Set-VmsWebhook -Name 'My receiver' -Address (Read-Host 'New address')
```

### Alarm definition

On a user-defined event:

```powershell
$name = 'Test alarm'
if (Get-VmsAlarmDefinition | Where-Object Name -eq $name) {
    "present: $name"
} else {
    $source = (Get-UserDefinedEvent -Name 'Test event').Path
    New-VmsAlarmDefinition -Name $name -EventTypeGroup 'External Events' -EventType 'External Event' -Source $source -ErrorAction Stop | Out-Null
    "created: $name"
}
```

On any other event, such as an analytics event raised by a Hafnia gateway rule:

1. Create the alarm definition by hand once (`management-client.md`).
2. Print the names of its triggering event, with your alarm definition's name in place of `My alarm`:

   ```powershell
   Get-VmsAlarmDefinition -Name 'My alarm' | ForEach-Object {
       $def = $_
       'EventTypeGroup: ' + ($def.EventTypeGroupValues.Keys | Where-Object { $def.EventTypeGroupValues[$_] -eq $def.EventTypeGroup })
       'EventType:      ' + ($def.EventTypeValues.Keys | Where-Object { $def.EventTypeValues[$_] -eq $def.EventType })
   }
   ```

3. Use the two names in the block above, with `-Source AllCameras` or the camera you want:
   `-Source (Get-VmsCamera | Where-Object Name -eq 'full camera name').Path`.

MilestonePSTools has no command that creates analytics events or switches them on. Create them by hand or with the
Configuration REST API (`POST /analyticsEvents`, the `xprotect-apis` skill), and switch them on by hand, before the
script runs.

### Rule

Create the rule by hand, then copy its settings into the script.

1. Create the rule in Management Client (`management-client.md`) and check that it works.
2. Print its settings as script lines, with your rule's name in place of `My rule`:

   ```powershell
   Get-VmsRule -Name 'My rule' | Select-Object -ExpandProperty Properties | ForEach-Object {
       $p = $_
       $line = "    '{0}' = '{1}'" -f $p.Key, ($p.Value -replace "'", "''")
       $choice = $p.ValueTypeInfos | Where-Object Value -eq $p.Value | Select-Object -First 1 -ExpandProperty Name
       if ($p.ValueType -eq 'Enum' -and $choice -and $choice -ne $p.Value) { $line += "  # $choice" }
       $line
   }
   ```

3. Paste the lines into this block:

   ```powershell
   $name = 'My rule'
   $properties = @{
       # the printed lines go here
   }
   if (Get-VmsRule | Where-Object DisplayName -eq $name) {
       "present: $name"
   } else {
       New-VmsRule -Name $name -Properties $properties -ErrorAction Stop | Out-Null
       "created: $name"
   }
   ```

4. Replace the IDs of your own things: they change on a rebuild. Replace the whole quoted value, quotes included.
   - A line that ends with `# <name>`: write that name instead, for example `'StartEventType' = 'Test event'`.
     `New-VmsRule` finds the ID by the name.
   - A camera (`Camera[…]`): `(Get-VmsCamera | Where-Object Name -eq 'full camera name').Path`.
   - The device group *Hackathon*: `(Get-VmsDeviceGroup -Name 'Hackathon' -Type Camera).Path`.
   - A webhook (`MIPItem[…]`): `(Get-VmsWebhook | Where-Object Name -eq 'My receiver').Path`.
   - Any other ID of your own: look it up by name the same way.
   - Keep IDs made of zeros, and `CameraGroup[0e1b0ad3-f67c-4d5f-b792-4bd6c3cf52f8]` (*All Cameras*): they are the
     same on every XProtect.

### Basic user

Paste this block alone, or run it from your script file: `Read-Host` waits for the password.

```powershell
$name = 'devuser'
if (Get-VmsBasicUser | Where-Object Name -eq $name) {
    "present: $name"
} else {
    $user = New-VmsBasicUser -Name $name -Password (Read-Host -Prompt "Password for $name" -AsSecureString) -ErrorAction Stop
    Add-VmsRoleMember -Role Administrators -Sid $user.Sid -ErrorAction Stop
    "created: $name"
}
```

- The user is enabled and is not asked to change its password.
- The password needs at least 8 characters, with an upper-case letter, a lower-case letter, a digit and a special
  character.
- The password is typed in when the script runs: keep it out of the script.

## After a rebuild

1. By hand in Management Client: switch analytics events on and create them (`management-client.md`).
2. Hafnia: import your prompts, set the system prompt and the *Advanced Settings* you changed, create the gateway
   rules, generate the webhook addresses and paste them into your script (the `hafnia-vlm` skill).
3. Run your script.

Test the script on your machine now: every line should say `present`. To see that it recreates something, delete
one of your own items, not one of XProtect's defaults, and run it again.
