---
name: xprotect-apis
description: Calling Milestone XProtect from your own code, on a participant's Hafnia Hackathon 2026 machine (pNNN) or from their laptop. Which XProtect API fits a job (the API Gateway's REST APIs for configuration, events, alarms, bookmarks and live JPEG images; the WebSocket events and state API; WebRTC video; receiving XProtect webhooks in your own code), where Milestone's official documentation, OpenAPI files and samples are, and what is different on the hackathon machines (addresses, plain HTTP, tokens for a basic user and 401 errors, what the laptop can reach, CORS, user-defined events that are never stored). Use when a participant writes code that talks to XProtect, or asks where Milestone documents an XProtect API. Not for plug-ins or C# apps built on the MIP .NET library (the xprotect-plugins skill), nor for the Hafnia gateway's own API (the hafnia-vlm skill).
---

# XProtect APIs from your code

Milestone documents its APIs well: this skill points to the right official page for each job and adds what is
different on your machine. Your machine runs XProtect 2026 R1. Its REST, WebSocket and WebRTC APIs go through the API
Gateway: `http://localhost/api/` on the machine, `http://pNNN/api/` from your laptop.

## Which API for which job

| You want to | API | Official docs | Official sample | Your code runs on |
|---|---|---|---|---|
| Log in and make a first call | Token from the identity provider | [Quickstart](https://doc.developer.milestonesys.com/mipvmsapi/content/quickstart) | curl in the quickstart | Machine or laptop |
| Read or change configuration: cameras, user-defined and analytics events, alarm definitions, rules, users | Configuration REST API | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/config-rest/v1/), [OpenAPI file](https://doc.developer.milestonesys.com/mipvmsapi/api/config-rest/v1/openapi.yaml) | [RESTful Communication - Python](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/RestfulCommunicationPython/README.html) | Machine or laptop |
| Get a live JPEG image from a camera | Configuration REST API, camera task `JpegGetLive` | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/config-rest/v1/#tag/DeviceConfig/operation/postTaskForCameras) | | Machine or laptop |
| Trigger a user-defined or analytics event | Events REST API | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/events-rest/v1/) | [RESTful Events API - Python](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/EventsRestApiPython/README.html) | Machine or laptop |
| React to events as they happen, or read device state | Events and State WebSocket API | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/events-ws/v1/) | [Python](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/EventsAndStateWebSocketApiPython/README.html), [JavaScript](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/EventsAndStateWebSocketJavaScript/README.html) | Machine or laptop |
| Raise, read or update alarms | Alarms REST API | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/alarms-rest/v1/) | [RESTful Alarms API - Python](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/AlarmsRestApiPython/README.html) | Machine or laptop |
| Add or search bookmarks | Bookmarks REST API | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/bookmarks-rest/v1/), [OpenAPI file](https://doc.developer.milestonesys.com/mipvmsapi/api/bookmarks-rest/v1/openapi.yaml) | | Machine or laptop |
| Show live or recorded video in a browser | WebRTC | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/webrtc-rest/v1/), [OpenAPI file](https://doc.developer.milestonesys.com/mipvmsapi/api/webrtc-rest/v1/openapi.yaml) | [WebRTC JavaScript Client](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/WebRTC_JavaScript/README.html) | A browser on the machine |
| Receive XProtect's calls when a rule fires | Webhooks | [Webhooks API](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/the-webhooks-api) | [Node.js and Python receivers](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/code-webhook-integrations) | Machine |
| Ask Hafnia VLM about a clip | Hafnia gateway API | the `hafnia-vlm` skill | | Machine |
| Run code inside Smart Client, Management Client or the Event Server | MIP SDK plug-ins | the `xprotect-plugins` skill | | Machine |

## What is different on your machine

- Milestone's examples use `https://` and a host such as `test-01.example.com`. Use `http://localhost` on the
  machine, or `http://pNNN` from your laptop.
- Log in as a basic user (create one: the `xprotect-essentials` skill): `POST /API/IDP/connect/token` with
  `grant_type=password`, `username`, `password` and `client_id=GrantValidatorClient`. Get a new token before
  `expires_in` seconds have passed.
- Details, and CORS for browser code: `references/your-machine.md`.

## For the assistant

- You are on the machine if `hostname` prints `p` and three digits (any case) **and**
  `sc.exe query "Milestone XProtect Management Server"` finds the service: use `http://localhost`. Otherwise ask for
  the machine name and use `http://pNNN`; never call `localhost` there, which can be the participant's own XProtect.
- Before writing code against an XProtect API, read its official reference or OpenAPI file for the exact paths and
  fields; do not write them from memory.
- The Configuration reference page is very large (about 20 MB): download its OpenAPI file (about 1.3 MB) and search
  that.
- Prefer the REST and WebSocket APIs; Milestone marks the SOAP and other older protocols as legacy. AI Bridge, which
  Milestone's topic pages also list, is not installed on the machine.
- Start from Milestone's samples and keep their calls: change the address, `http://`, the user and, in the WebSocket
  sample, the subscription (`references/your-machine.md`).
- Milestone's Python samples need Python 3.10 or later (the WebSocket sample 3.11) and the packages their READMEs
  list. The WebSocket sample uses Windows commands: run it on the machine.
- Ask the participant before creating `appsettings.Production.json` or recycling the API Gateway's application pool.
- Let the code ask for the basic user's password when it runs, or read it from an environment variable; never ask
  for it in the chat, print it or write it to a file.
- Code that triggers events can start Hafnia webhooks through XProtect rules: each call can cost 1 of the participant's
  500 requests a day. Say how many the code will use before you run it, and never trigger an event for each motion
  event. Never let a Hafnia result trigger a new Hafnia request.

## Go deeper

| You want | Read |
|---|---|
| Every official link: references, OpenAPI files, samples, manuals, forum | `references/doc-map.md` |
| What is different on your machine: addresses, login, events, webhooks, CORS | `references/your-machine.md` |

## When something does not work

- **A call answers 401:** the token is missing or has expired. Get a new one.
- **The token request fails:** check the user name and password. Five failed logins lock the user out for 5 minutes.
- **The browser blocks your call (CORS):** `references/your-machine.md`, "Browser code".
- **A user-defined event you triggered is missing from `GET /events`:** expected. Subscribe with the WebSocket API.
- **Your webhook receiver gets nothing:** it must run on the machine, at a local address. Fire the event by hand to
  test (the `xprotect-essentials` skill).
- **Questions about the APIs themselves:** Milestone's [developer forum](https://forum.milestonesys.com/).
- **About your machine:** email hackathon.hafnia@milestone.dk with your machine name, what you did, and what you saw.
