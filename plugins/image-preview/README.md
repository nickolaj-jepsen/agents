---
tagline: "Show PNG images read by tools directly in the terminal transcript, with their aspect ratio preserved and a clickable file path."
featured: false
requires:
  - "A terminal with Kitty, Ghostty or iTerm2 image support; other terminals show the image's fallback text"
order: 12
---

- `Read` results draw below a standalone tool row or a folded tool group. Several reads in one group each get their own preview.
- `SendUserFile` draws local PNG attachments and their caption. Non-image files keep a plain path entry, while attach-only results and failed uploads keep Claude's normal output.
- Previews fit the terminal without distortion. Read previews use at most 40 columns and 15 rows; sent files use at most 80 columns and 30 rows.
- The terminal reads attachment files directly, so large images do not pass through the plugin as base64. `Read` results use inline bytes up to 2 MiB and fall back to their source file when it has an absolute path.
- JPEG, GIF and WebP results keep Claude's normal renderer. The shared `imageGallery` and `fitImage` helpers in the Claude UI kit can draw PNG sources for other mods.

Image support depends on the terminal. Inside tmux, inline images need `allow-passthrough` and `focus-events` enabled; unsupported terminals show each image's `alt` text and path instead.
