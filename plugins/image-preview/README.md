---
tagline: "Preview local PNG and JPEG images in the Claude Code terminal transcript."
featured: false
requires:
  - "A terminal with inline graphics for pictures; other terminals show a readable image label"
  - "ImageMagick (`magick` on PATH) for JPEG previews"
order: 12
---

`Read` previews local images, including relative paths. A folded tool group shows one thumbnail and counts the rest. Press `Ctrl+O` to see each image in the detailed transcript.

A completed assistant reply can preview one explicit local Markdown link or image, such as `[Chart](./chart.png)`. Bare paths, code examples, and remote URLs do not get previews. `SendUserFile` keeps its attachments and captions, and previews supported images unless the tool used attach-only mode.

Full previews fit within 144 columns and 42 rows; thumbnails fit within 24 columns and 6 rows. If images do not render in tmux, enable `allow-passthrough` and `focus-events`. Terminals without inline graphics show the image label and path. Failed JPEG conversion leaves the original output intact. Bash output and graphical clients are unchanged.
