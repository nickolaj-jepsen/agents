import { defineComponent } from "@agents/kit-core/manifest.ts";
import { imageFields, imageNeeds } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "image-gallery",
  name: "Image gallery",
  purpose: "Draws PNG images at their aspect ratios, with optional file links and a caption.",
  contract: { fields: imageFields, needs: imageNeeds },
  parts: {
    imageGallery: {
      drawings: ["terminal"],
      none: {
        gui: "the graphical clients show images themselves, at their own size; a mod draws nothing there",
      },
    },
  },
  features: [
    {
      id: "fit",
      label: "Fit landscape, portrait and unknown dimensions without distortion",
      fields: ["columns", "rows", "cellRatio"],
      needs: ["images"],
      story: "image-gallery/gallery",
    },
    {
      id: "sources",
      label: "Inline PNG bytes or a local file read by the terminal",
      fields: ["images"],
      needs: ["images"],
      story: "image-gallery/landscape",
    },
    {
      id: "paths",
      label: "A dim file link under each image, including long escaped paths",
      needs: ["images"],
      story: "image-gallery/gallery",
    },
    {
      id: "caption",
      label: "A dim caption above the gallery, wrapped to the room",
      fields: ["caption"],
      needs: ["images"],
      story: "image-gallery/gallery",
    },
  ],
} as const);
