---
tagline: "Appends language-server errors to `edit` and `write` results."
featured: false
requires:
  - "A JSON file of language servers, named by `PI_LSP_SERVERS`"
order: 11
---

pi only; subagents have it too. Appends language-server errors to `edit` and `write`
results; it declares no tools, so it costs no context until an edit breaks something.
Servers come from the JSON file `PI_LSP_SERVERS` names (the pi leaf writes it from
`fireproof.agents.lspServers`); with it unset or empty the plugin does nothing.
