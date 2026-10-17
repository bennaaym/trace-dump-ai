# Milestone's API documentation: where everything is

Milestone keeps its developer documentation online; open the links in a browser on the machine or on your laptop.
The developer pages are not split by XProtect version; every API listed here exists in XProtect 2026 R1, the version
on your machine.

## Start here

| Page | What it is |
|---|---|
| [MIP VMS API](https://doc.developer.milestonesys.com/mipvmsapi/) | Home of the developer documentation |
| [Quickstart](https://doc.developer.milestonesys.com/mipvmsapi/content/quickstart) | A token and a first call, with curl |
| [Protocol, component or plug-in](https://doc.developer.milestonesys.com/mipvmsapi/content/integration-modes) | The three ways to integrate with XProtect, and when to use each |
| [APIs by topic](https://doc.developer.milestonesys.com/mipvmsapi/api-overview) | Configuration, events, alarms, messaging, control, video, authentication, status: each topic page lists its APIs and marks the legacy ones |

## REST APIs

All at `/api/rest/v1/` on the API Gateway. The Events and Alarms references start with a Quickstart in cURL, Python,
Node.js and PowerShell.

| API | Reference | OpenAPI file |
|---|---|---|
| Configuration: cameras, events, alarm definitions, rules, users, roles, camera tasks such as `JpegGetLive` | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/config-rest/v1/) (a very large page) | [openapi.yaml](https://doc.developer.milestonesys.com/mipvmsapi/api/config-rest/v1/openapi.yaml) |
| Events: trigger events, read stored events | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/events-rest/v1/) | the reference page's *Download* button |
| Alarms: raise, read and update alarms | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/alarms-rest/v1/) | the reference page's *Download* button |
| Bookmarks | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/bookmarks-rest/v1/) | [openapi.yaml](https://doc.developer.milestonesys.com/mipvmsapi/api/bookmarks-rest/v1/openapi.yaml) |
| Evidence locks | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/evidencelocks-rest/v1/) | [openapi.yaml](https://doc.developer.milestonesys.com/mipvmsapi/api/evidencelocks-rest/v1/openapi.yaml) |
| WebRTC signaling: live and recorded video in a browser | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/webrtc-rest/v1/), [Introduction](https://doc.developer.milestonesys.com/mipsdk/gettingstarted/intro_WebRTC.html) | [openapi.yaml](https://doc.developer.milestonesys.com/mipvmsapi/api/webrtc-rest/v1/openapi.yaml) |

## WebSocket APIs

| API | Address | Reference |
|---|---|---|
| Events and State: subscribe to events, read device state | `/api/ws/events/v1` | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/events-ws/v1/) |
| Messages: send messages between applications | `/api/ws/messages/v1` | [Reference](https://doc.developer.milestonesys.com/mipvmsapi/api/messages-ws/v1/) |

## Webhooks (XProtect 2026 R1 manual)

| Page | What it is |
|---|---|
| [Creating webhooks in XProtect](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/creating-webhooks-in-xprotect) | Webhook and rule in Management Client |
| [The webhooks API](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/the-webhooks-api) | What XProtect sends: body, headers, retries |
| [Improving webhook security with tokens](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/improving-webhook-security-with-tokens) | The signature header and how to check it |
| [Code webhook integrations](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/code-webhook-integrations) | Receivers in Node.js (Express) and Python (Flask) |

## Samples

| Sample | What it shows |
|---|---|
| [All protocol samples](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/index_3.html) | The list, legacy samples included |
| [RESTful Communication - Python](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/RestfulCommunicationPython/README.html) | Log in; create, read, change and delete a user-defined event |
| [RESTful Events API - Python](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/EventsRestApiPython/README.html) | Trigger a user-defined event: the first in the list that is not XProtect's own |
| [RESTful Alarms API - Python](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/AlarmsRestApiPython/README.html) | Trigger and read alarms |
| [Event and State WebSocket API - Python](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/EventsAndStateWebSocketApiPython/README.html) | Session, subscription, events as they happen, device state |
| [Events and State WebSocket - JavaScript](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/EventsAndStateWebSocketJavaScript/README.html) | The same from a browser page; includes a CORS settings file |
| [Chat with WebSocket Messages](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/ChatWithWebsockets/README.html) | Publish and subscribe to messages from a browser page |
| [WebRTC JavaScript Client](https://doc.developer.milestonesys.com/mipsdk/samples/ProtocolSamples/WebRTC_JavaScript/README.html) | Live and recorded video in a browser; CORS, STUN and TURN notes |

The code is on GitHub:

- [milestonesys/mipsdk-samples-protocol](https://github.com/milestonesys/mipsdk-samples-protocol): the samples above;
- [milestonesys/mipsdk-samples-component](https://github.com/milestonesys/mipsdk-samples-component): C# applications;
- [milestonesys/mipsdk-samples-plugin](https://github.com/milestonesys/mipsdk-samples-plugin): C# plug-ins.

## Older protocols and the C# SDK

- Milestone marks the older protocols (SOAP, the Image Server protocol, generic events over TCP) as legacy: use the
  REST and WebSocket APIs.
- [MIP SDK](https://doc.developer.milestonesys.com/mipsdk/index.html): the C# SDK for plug-ins and stand-alone C#
  apps (the `xprotect-plugins` skill).

## Manuals and help

| Page | What it is |
|---|---|
| [API Gateway for administrators (2026 R1)](https://doc.milestonesys.com/xprotect/xprotect-api-gateway-doc1042/2026r1/en/milestone-xprotect-api-gateway-for-administrators) | What the API Gateway offers, and its limitations |
| [API Gateway configuration files (2026 R1)](https://doc.milestonesys.com/xprotect/xprotect-api-gateway-doc1042/2026r1/en/api-gateway-configuration-files) | Where the settings are; switching on CORS; STUN and TURN for WebRTC |
| [API Gateway doesn't answer requests (2026 R1)](https://doc.milestonesys.com/xprotect/xprotect-api-gateway-doc1042/2026r1/en/api-gateway-doesn-t-answer-requests) | Troubleshooting the API Gateway |
| [Developer forum](https://forum.milestonesys.com/) | Questions to Milestone's developer community |
