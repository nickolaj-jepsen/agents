import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

const pi = no(
  "pi has no terminal image component: it shows the alt text, and the path as plain dim text.",
);

export default defineComponent({
  id: "image-gallery",
  name: "Image gallery",
  purpose: "Draws PNG images at their aspect ratios, with optional file links and a caption.",
  impl: {
    pi: { none: pi.note! },
    claude: ["fitImage", "imageGallery", "fileUrl"],
    gui: { none: "the graphical clients show images themselves; a mod draws nothing there" },
  },
  status: { pi: "system", claude: "system" },
  source: "image/src/terminal.ts",
  features: [
    {
      id: "fit",
      label: "Fit landscape, portrait and unknown dimensions without distortion",
      story: { claude: "image-gallery/gallery" },
      pi,
      claude: yes("Terminal cells count as two pixels tall; both axes stay within 255 cells"),
      gui: no("the host shows the image at its own size"),
    },
    {
      id: "sources",
      label: "Inline PNG bytes or a local file read by the terminal",
      story: { claude: "image-gallery/gallery" },
      pi,
      claude: yes(),
      gui: no("the host shows the image itself"),
    },
    {
      id: "paths",
      label: "A dim file link under each image, including long escaped paths",
      story: { claude: "image-gallery/gallery" },
      pi,
      claude: yes("the path wrapped to the room, each row a link to its `file://` address"),
      gui: no("the host shows the image itself"),
    },
  ],
});
