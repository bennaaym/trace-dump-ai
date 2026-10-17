# What is different on your machine

Milestone's documentation is written for any XProtect system. These are the details of yours: XProtect 2026 R1, one
machine, plain HTTP inside your private network.

## Addresses

| What | On the machine | From your laptop |
|---|---|---|
| REST APIs | `http://localhost/api/rest/v1/` | `http://pNNN/api/rest/v1/` |
| Events and State WebSocket | `ws://localhost/api/ws/events/v1` | `ws://pNNN/api/ws/events/v1` |
| Token for a basic user | `http://localhost/API/IDP/connect/token` | `http://pNNN/API/IDP/connect/token` |

- Milestone's examples use `https://` and a host such as `test-01.example.com`: replace both. Steps about
  certificates, such as curl's `--insecure` or Postman's certificate settings, do not apply.
- The machine cannot open connections to your laptop.

## Log in

- **Basic user:** create one in Management Client or with a script (the `xprotect-essentials` skill). Give it a role
  with the rights your code needs; the *Administrators* role has all of them.
- **Token:** `POST` to the token address, form-encoded: `grant_type=password`, `username`, `password`,
  `client_id=GrantValidatorClient`. The answer holds `access_token` and `expires_in` (seconds).
- **Calls:** send the header `Authorization: Bearer` followed by the token. Get a new token before `expires_in`
  seconds have passed.
- **A first call with curl:** Milestone's [Quickstart](https://doc.developer.milestonesys.com/mipvmsapi/content/quickstart),
  or the `xprotect-hackathon` skill, "Working from your laptop", which has it with your machine's address.

## Events you trigger

- **A user-defined event:** `GET /api/rest/v1/userDefinedEvents` lists them with their `id`; pick yours by `name`,
  because the list also holds XProtect's own. Then `POST /api/rest/v1/events` with a JSON body whose `type` is that
  `id`. Milestone's RESTful Events API sample triggers the first one in the list that is not XProtect's own.
- **Rules and alarm definitions react** to events you trigger, as they do to any other event.
- **User-defined events are never stored,** and that cannot be changed
  ([Alarms and Events tab](https://doc.milestonesys.com/xprotect/xprotect-management-client/2026r1/en/alarms-and-events-tab--options-)):
  `GET /events` never returns them, and `GET /events/{id}` answers 404.
- **To see them arrive,** subscribe with the Events and State WebSocket API. Milestone's Python WebSocket sample
  subscribes to camera motion and recording events only: in its `main.py`, set `subscription_filters` to
  `"resourceTypes": ["userDefinedEvents"]`, `"sourceIds": ["*"]` and `"eventTypes": ["*"]`.
- **An analytics event** can also be triggered with `POST /events`; the reference shows its body.

## Webhooks

- XProtect calls the webhook's address from the machine. Run your receiver on the machine and give XProtect a local
  address, for example `http://127.0.0.1:5000/webhooks` as in Milestone's
  [Code webhook integrations](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/code-webhook-integrations).
  Skip that page's ngrok step.
- Every call carries the header `X-Hub-Signature-256` with the value `sha256=` followed by the base64 HMAC-SHA256 of
  the body, keyed with the webhook's token, or with an empty string when it has none. Milestone's receivers check it:
  [Improving webhook security with tokens](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/improving-webhook-security-with-tokens).
- A failed call is retried twice, 30 seconds apart, with the same `Event.EventHeader.ID`, except after an answer of
  400: use that ID to ignore repeats ([The webhooks API](https://doc.milestonesys.com/xprotect/webhooks-in-xprotect/2026r1/en/the-webhooks-api)).

## Browser code

- CORS is off: JavaScript in a page from another address or port, or opened from a file, cannot call the APIs.
  Code outside a browser, such as a Python or Node.js backend, is not affected.
- To switch CORS on, follow Milestone's
  [API Gateway configuration files](https://doc.milestonesys.com/xprotect/xprotect-api-gateway-doc1042/2026r1/en/api-gateway-configuration-files)
  page: an `appsettings.Production.json` in `C:\Program Files\Milestone\XProtect API Gateway\`, then a recycle of
  the IIS application pool *VideoOS ApiGateway AppPool*. Do not edit `appsettings.json` there.
- Milestone's Events and State WebSocket JavaScript sample has a ready file, `CORS_Setup\appsettings.Production.json`,
  that allows every origin.
- A mistake in your file stops the API Gateway: delete your file and recycle the pool again.
- WebRTC: run the page in a browser on the machine. Milestone's WebRTC sample, opened from a file, still needs CORS
  there.
