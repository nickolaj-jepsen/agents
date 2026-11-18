---
tagline: "Turns a thought, or something Claude Code flagged, into a Linear issue you approve before it's filed."
featured: true
requires:
  - "A Linear MCP server, connected and signed in"
order: 1
---

- `/linear [what to file]` drafts from your note, or from the recent conversation
  when the note is empty.
- The You should know card gets a **Linear issue** button (usually `3`) once you
  press Learn more, which drafts from what the card flagged. The digit is the
  terminal's; the desktop app and VS Code have the button only.
- The draft fills in title, description, team, priority, status and labels. Every
  field is editable.
- An open issue that already covers it adds a **Comment on KEY-123** choice. In
  the desktop app and VS Code it is a folded row: **Open** shows the comment it
  would add, with **Comment on this**.
- **Create**, or **Create & open** in the browser. In the desktop app and VS
  Code they sit in a toolbar over the form, and **Create** is filled once the
  draft can be filed. The description is shown whole, and a label is removed
  by pressing its button.
- `Esc` hides the draft to a row above the prompt. `8` reopens it, and `9`
  pressed twice discards it. In the desktop app and VS Code that row has
  **Open** and **Discard** buttons, and a filed issue's row has **Open**,
  **Copy link** and **Dismiss**.
