---
tagline: "`exa_search` and `exa_fetch` tools over Exa."
featured: false
requires:
  - "An Exa key in the file `PI_EXA_KEY_FILE` names"
order: 10
---

Before starting pi, point to a file containing your key:

```bash
export PI_EXA_KEY_FILE=/path/to/exa-key  # use an existing key file
pi                                     # start the session with the tools
```

Both tools fail if the variable is unset or the file is unreadable or empty. Subagents can use them too. Results are capped to a share of the model's context.
