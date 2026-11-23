/** The image gallery's stories: the model as data. No host imports. */
import type { GuiExt, StageExt, Story } from "@agents/kit-core/stories.ts";
import type { ImageGallery } from "./contract.ts";

/** What a story is: a gallery, whatever its width. */
export type ImageModel = Omit<ImageGallery, "columns">;

/** Small valid PNGs: a landscape and a portrait. */
const LANDSCAPE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAYAAAA5DDySAAAAdklEQVR42u3ZsRGAIAwFUIZxAAtHsLO2ZyVXYyHcAAu5Q8wrfpm78JrkQtqOXFtZ1r2Z2esTAAAAAAAAEBjg7w98qgfQo4FyncMCAAAAAADeAPQYMyMBPrEJAgAAAAAAAJMC2AQBAHARAgAAQFwAP0MAAIQGuAEhKJcojry0RgAAAABJRU5ErkJggg==";
const PORTRAIT_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAABACAYAAAAAqrdiAAAAaElEQVR42u3Yuw2AMAwFwAzDABSMkI4laJmJIRgxbODwEUoiXfFK+xrbUpKWdStRpjmHqdUnAGAA4GuDWj0AMALQdJP387gdAOBHIJrxJ8CrTQYAOgGcCgDAqQAAmr8PAAD/RQBAL8AFPqSooo9jlH0AAAAASUVORK5CYII=";

const LONG_PATH = `/home/me/${"a-very-long-directory-name/".repeat(4)}a picture #1 日本語.png`;

export const imageStories: Story<ImageModel, StageExt, GuiExt>[] = [
  {
    component: "image-gallery",
    state: "landscape",
    about: "One inline PNG with a clickable local path",
    settings: "imageGallery({images: [image], columns: width, rows: 15})",
    model: {
      images: [
        {
          key: "landscape",
          source: { png: LANDSCAPE_PNG },
          size: { width: 64, height: 36 },
          alt: "[image] landscape.png",
          path: "/home/me/a picture #1.png",
        },
      ],
      rows: 15,
    },
  },
  {
    component: "image-gallery",
    state: "gallery",
    about: "Landscape, portrait and unknown dimensions, a caption and an extreme escaped path",
    settings: "imageGallery({images, columns: width, rows: 12, caption})",
    model: {
      images: [
        {
          key: "landscape",
          source: { png: LANDSCAPE_PNG },
          size: { width: 64, height: 36 },
          alt: "[image] landscape.png",
          path: "/home/me/landscape.png",
        },
        {
          key: "portrait",
          source: { png: PORTRAIT_PNG },
          size: { width: 24, height: 64 },
          alt: "[image] portrait.png",
          path: "/home/me/portrait.png",
        },
        {
          key: "unknown",
          source: { png: LANDSCAPE_PNG },
          size: null,
          alt: "[image] 日本語 ＡＢ.png",
          path: LONG_PATH,
        },
      ],
      rows: 12,
      caption:
        "Generated images with a very long caption that wraps instead of pushing the gallery beyond the terminal width.",
    },
    ext: { terminal: { extreme: true } },
  },
];
