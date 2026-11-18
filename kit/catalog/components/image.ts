import { defineComponent, no, yes } from "../manifest.ts";

const pi = no("The pi kit has no terminal image component.");

export default defineComponent({
  id: "image",
  name: "Image gallery",
  purpose: "Draws PNG images at their aspect ratios, with optional file links and a caption.",
  impl: { pi: { none: pi.note! }, claude: ["fitImage", "imageGallery"] },
  features: [
    {
      id: "fit",
      label: "Fit landscape, portrait and unknown dimensions without distortion",
      story: { claude: "image/gallery" },
      pi,
      claude: yes("Terminal cells count as two pixels tall; both axes stay within 255 cells"),
    },
    {
      id: "sources",
      label: "Inline PNG bytes or a local file read by the terminal",
      story: { claude: "image/gallery" },
      pi,
      claude: yes(),
    },
    {
      id: "paths",
      label: "A dim file link under each image, including long escaped paths",
      story: { claude: "image/gallery" },
      pi,
      claude: yes(),
    },
  ],
});
