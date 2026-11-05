---
title: e-commerce data agent
tag: shipped
when: "2026"
published: 2026-07-18
summary: "An agent and its MCP servers built from scratch with ADK and Next.js: live SSE streaming, multi-session sidebar, file upload."
---

An agent and its MCP servers, built from scratch with ADK and Next.js. You ask a question about a store's data in plain language, and the agent works out which tools to call.

![e-commerce data agent: the chat view](../images/e-commerce-data-agent-1.png)

Replies stream in over SSE, so you watch the agent work instead of waiting on a spinner. The sidebar keeps multiple sessions, so a long investigation doesn't get lost when you start a new question.

![e-commerce data agent: the multi-session sidebar](../images/e-commerce-data-agent-2.png)

==The hard part wasn't the model, it was deciding what the tools should be.== You can also upload a file and ask about that instead.

![e-commerce data agent: uploading a file](../images/e-commerce-data-agent-3.png)

![e-commerce data agent: a finished answer](../images/e-commerce-data-agent-4.png)
