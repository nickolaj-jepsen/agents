---
tagline: "Preview local PNG and JPEG images in the Claude Code terminal transcript."
featured: false
requires:
  - "A terminal with inline graphics for pictures; other terminals show a readable image label"
  - "ImageMagick (`magick` on PATH) for JPEG previews"
order: 12
---

`Read` previews local images in the terminal transcript, as does `SendUserFile` unless it uses attach-only mode. Folded tool groups show one thumbnail; press `Ctrl+O` to see all images.

An assistant reply can preview a local Markdown link or image, such as `[Chart](./chart.png)`. Bare paths, code blocks and remote URLs don't preview.

If images don't appear in tmux, enable `allow-passthrough` and `focus-events`.
