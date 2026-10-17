# Management Client

Management Client runs on the machine; open it over Remote Desktop. Computer `localhost`, Windows authentication as
yourself. If it asks about a non-secure connection, select **Allow** ([Logging in](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/logging-in)).

This file is the short version of Milestone's
[XProtect Management Client 2026 R1 manual](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/index-en);
each section links the manual's pages.

## Two things to know first

- A change in the Properties pane counts only after **Save** on the toolbar.
- A rule made in the rule wizard is active as soon as you click **Finish**.

## User-defined events

Manual: [Add a user-defined event](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/add-a-user-defined-event).

- **Create:** Rules and Events, User-defined Events: right-click *Events*, **Add User-defined Event**, enter a name,
  OK.
- **Fire it:** by hand in Smart Client (live mode, *Event* pane, **Activate**); from a rule (action *On \<site\>
  trigger \<user-defined event\>*); from PowerShell (`scripting.md`); or from your own code (the `xprotect-apis`
  skill).
- **Renamed it?** Smart Client users see the new name after they log out and in again.

## Analytics events

Manual: [Analytics Events tab](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/analytics-events-tab--options-), [Add and edit an analytics event](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/add-and-edit-an-analytics-event), [Test an analytics event](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/test-an-analytics-event).

Other systems send analytics events to XProtect; the Hafnia gateway's rules do (the `hafnia-vlm` skill).

1. **Switch them on:** Tools, Options, *Analytics Events* tab: select *Enable* (off by default), keep port 9090,
   select *All network addresses*, and click OK.
2. **Create one:** Rules and Events, Analytics Events: right-click *Analytics Events*, **Add New**, enter a name and a
   description, then **Save** on the toolbar.
3. **Test it:** select the analytics event and use **Test Event** with a camera as the source: it shows whether the
   event arrives, and what is missing if not.

## Rules

Manual: [Add rules](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/add-rules), [Actions and stop actions](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/actions-and-stop-actions), [Validate rules](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/validate-rules), [Deactivate and activate a rule](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/deactivate-and-activate-a-rule).

1. Rules and Events, Rules: right-click *Rules*, **Add Rule**. The *Manage Rule* wizard opens.
2. **Step 1, type of rule:** a name, and the rule type, for example *Perform an action on \<event\>* or *Perform an
   action on a \<recurring time\>*.
3. In the rule description at the bottom, click the underlined items to choose what they stand for, for example
   *event*.
4. **Step 2, conditions** (optional), **step 3, actions**, **step 4, stop criteria**, then **Finish**. The wizard
   adds stop actions that an action needs, for example *Stop recording* after *Start recording*.
5. **Check it:** right-click the rule, **Validate Rule**. It does not check device settings such as motion
   detection.
6. **See it fire:** add the action *Make new \<log entry\>*, with a text of your own. The entries appear in
   Management Client, Server Logs.

Example, a rule that sends a user-defined event to a webhook:

1. Create the user-defined event (above) and the webhook (below).
2. **Add Rule**, name it. Step 1: *Perform an action on \<event\>*; click *event* in the rule description and pick
   your user-defined event.
3. Step 3: select *Send event info to \<webhooks\>*; click *address* in the rule description, add your webhook, OK.
4. **Finish**. Fire the event by hand to test it.

Leave the default rules (*Default Record on Motion Rule*, *Default Start Feed Rule* and the others) as they are:
changing them can stop video.

## Webhooks

Manual: [Creating webhooks in XProtect](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/creating-webhooks-in-xprotect).

1. **Create:** Rules and Events, Webhooks: right-click, **Add New...**. Fill in *Name*, *Address* and, optionally,
   *Token*, then **Save** on the toolbar.
2. **Use it:** in a rule (example above).
3. **Receivers:** the address must be reachable from the machine. Your laptop is not: run receivers on the machine.
4. **A Hafnia webhook:** the *Address* comes from Smart Client, Summarization, Webhooks Setup; leave *Token* empty
   (the `hafnia-vlm` skill).
5. **Never start a Hafnia webhook from motion,** or from an analytics event that a Hafnia gateway rule raised: each
   call can cost 1 of your 500 requests a day.
6. **What XProtect sends, and how to check its signature:** the `xprotect-apis` skill.

## Alarm definitions

Manual: [Add an alarm](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/add-an-alarm), [Alarm Definitions](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/alarm-definitions--alarms-node-), [Alarm Data Settings](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/alarm-data-settings--alarms-node-).

An alarm definition turns an event into an alarm in Smart Client's Alarm Manager. It needs no rule.

1. Alarms, Alarm Definitions: right-click, **Add New**.
2. Fill in:
   - *Name*, and *Instructions* for the operator;
   - *Triggering event*: first the type (for example *Analytics Events*), then the event itself;
   - *Sources*: the cameras, or *All Cameras*;
   - optionally priority, category, and related cameras (up to 15).
3. **Save** on the toolbar.

**Alarm list columns:** Alarms, Alarm Data Settings, *Alarm List Configuration* tab: move the columns you want from
*Available* to *Selected*.

## Basic users

Manual: [Create basic users](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/create-basic-users), [Assign users to roles](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/assign-remove-users-and-groups-to-from-roles).

Your own code can log in to XProtect as a basic user, on the machine or from your laptop.

- **Create:** Security, Basic Users: right-click, **Create Basic User**. Enter the name and the password twice, and
  set the status to *Enabled*.
- **No password change:** clear the option to change the password at the next login. Code cannot change it.
- **Password:** at least 8 characters, with an upper-case letter, a lower-case letter, a digit and a special
  character.
- **Lockout:** 5 failed logins lock the user out for 5 minutes.
- **Rights:** Security, Roles, *Administrators*, *Users and Groups* tab, **Add**, *Basic user*. The *Administrators*
  role has full access.
