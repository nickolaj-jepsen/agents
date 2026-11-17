---
tagline: "Appends language-server errors to `edit` and `write` results."
featured: false
requires:
  - "A JSON file of language servers, named by `PI_LSP_SERVERS`"
order: 11
---

pi only; subagents have it too. It declares no tools, so it costs no context until
an edit breaks something.

Servers come from the JSON file `PI_LSP_SERVERS` names, which the pi leaf writes from
`fireproof.agents.lspServers`. With it unset or empty, the plugin does nothing.
