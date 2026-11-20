---
tagline: "Appends language-server errors to `edit` and `write` results."
featured: false
requires:
  - "A JSON file of language servers, named by `PI_LSP_SERVERS`"
order: 11
---

Set `PI_LSP_SERVERS` before starting pi. It takes a path to a JSON file, not a server name:

```bash
export PI_LSP_SERVERS=/path/to/servers.json  # use the file you created
pi                                       # edit or write a matching file
```

For example, with `typescript-language-server` on PATH:

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": { ".ts": "typescript", ".tsx": "typescriptreact" }
  }
}
```

An unset, unreadable or invalid JSON file disables the plugin. Subagents use the same configuration.
