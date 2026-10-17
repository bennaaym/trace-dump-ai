# Prompts

## Manage prompts

Prompts are stored in the Hafnia gateway on your machine. Smart Client, webhooks, gateway rules and the gateway API
all use the same prompts. One comes with the machine: *Road conditions analysis*, which asks for a short, factual
description of the weather and the road surface.

| Where | What you can do |
|---|---|
| Smart Client, Summarization, Generate tab | **New** adds a prompt called *New Prompt* to the gateway at once. Edit *Title* and *Content*; **Save** becomes clickable after a change. You cannot delete prompts here. |
| Gateway page `https://localhost:15443/`, Prompts | **Add Prompt**; click a prompt to edit it; **Duplicate**; **Delete**; **Export Prompts**; **Import Prompts**; search. Log in as `administrator` with your Windows password. |
| Gateway API | List, create, change and delete prompts: see `gateway-api.md`. |

- **Keep fewer than 25 prompts.** With 25 or more, Smart Client does not load the prompt list correctly. Every click
  on **New** adds a prompt: delete the ones you do not use on the gateway page.
- **Save before you test.** Generate sends the *Content* box as it is, unsaved edits included, but webhooks send
  only the saved text: save first, so that your test asks what your webhook will ask.
- **A webhook reads the prompt's text each time it fires,** so a saved edit applies to the next request. If you
  delete the prompt, the webhook stops working: the gateway log says `Prompt with ID '…' not found.`
- **Back up your prompts:** gateway page, Prompts, **Export Prompts** gives a JSON file; commit it to your repository.
  **Import Prompts** loads it on a fresh machine, but the imported prompts get new IDs: generate your webhook
  addresses again, recreate your gateway rules, and have your code look prompts up by title.

## The system prompt

- Gateway page, Settings, *Hafnia VLM Advanced Settings*, *System Prompt*. It is empty by default.
- When set, it is sent before the prompt with every request, from every way in. A change applies to the next request.
- Use it only for context that holds for every prompt, for example `These clips come from fixed outdoor cameras.`
- It is not part of the prompt export: keep a copy of its text in your repository.
- In Settings, change only the two *Advanced Settings* sections. *Hafnia VLM Settings* and *XProtect Settings*
  connect the gateway and are set up for you.

## Write prompts that give usable answers

- **Keep the default AI model.**
- **Ask about what the clip shows.** Clips are short: webhooks send 4 seconds by default (2 before and 2 after the
  event). Whatever happens outside the clip is invisible to the model.
- **Ask one question per prompt.**
- **For automation, ask for one keyword from a fixed set, and say so plainly:** `Reply with exactly one word:
  VIEW_BLOCKED if something covers the camera, VIEW_CLEAR if not.`
- **Pick keywords that never appear in ordinary sentences,** such as `VANDALISM_CONFIRMED` or `VIEW_BLOCKED`: a
  gateway rule finds its keyword as a whole word anywhere in the answer, so `NO` would also match "there is no
  vandalism". The exact matching rules are in `gateway-rules.md`.
- **For descriptions** (reports, bookmarks you will search later), ask for a short, factual description and say what
  to leave out. The *Road conditions analysis* prompt is an example.
- **If your code parses the answer,** ask for a fixed format and check it in your code: a model can add words.
- **Test by hand before you automate:** run the prompt in Smart Client on clips where the answer should be yes and on
  clips where it should be no, and read the answers in History. Each test that completes costs 1 request.
