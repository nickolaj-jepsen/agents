---
tagline: "Appends language-server errors to `edit` and `write` results."
featured: false
requires:
  - "A JSON file of language servers, named by `PI_LSP_SERVERS`"
order: 11
---

The plugin also runs in pi subagents. Set `PI_LSP_SERVERS` to the JSON file of server configurations; when unset or empty, the plugin does nothing.
