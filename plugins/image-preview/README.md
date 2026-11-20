---
tagline: "Show PNG images read by tools directly in the terminal transcript, with their aspect ratio preserved and a clickable file path."
featured: false
requires:
  - "A terminal with Kitty, Ghostty or iTerm2 image support; other terminals show the image's fallback text"
order: 12
---

In the terminal, `Read` shows a PNG below its tool row or folded tool group. `SendUserFile` shows local PNG attachments with their caption and a clickable path; non-image attachments appear as paths.

If a PNG doesn't appear, check terminal image support. In tmux enable `allow-passthrough` and `focus-events`. A `Read` result over 2 MiB needs an absolute source path so the terminal can load the file instead. Without image support the preview falls back to text and the path.
