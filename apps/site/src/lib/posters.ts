/**
 * The home page's pictures: a plugin's poster, cropped to the part that shows the plugin (its pane,
 * form, menu or draft) and shown at 1:1, so the terminal text stays readable in a tile. A plugin or
 * harness with no entry shows its whole poster, as `postersOf` gives it.
 */
import { mediaUrl, postersOf, type Harness, type Plugin } from "./content.ts";

interface Crop {
  /** A still in the plugin's media folder to use instead of the video's poster. */
  still?: string;
  /** The part to show, in the source image's pixels. */
  rect: { x: number; y: number; w: number; h: number };
}

/** Crop coordinates are in source pixels. Check the home page crops after rerecording a demo. */
const R = (x: number, y: number, w = 620, h = 260): Crop["rect"] => ({ x, y, w, h });
const CROPS: Record<string, Partial<Record<Harness, Crop>>> = {
  // The review: the answers so far above the prompt, and the form that fills it.
  answer: { claude: { rect: R(0, 372) }, pi: { rect: R(8, 384) } },
  // The poster is pi's empty startup screen; the still has the stashed-draft line beside the editor.
  // A short crop, centred in the plate, so it is the stash and the editor and not black.
  "claude-compat": { pi: { still: "stashed.png", rect: R(0, 586, 640, 120) } },
  // Panes start at their own left rule (x 722), so no neighbouring pane shows.
  docfix: {
    claude: { rect: R(724, 30, 508) },
    pi: { still: "pi.png", rect: R(20, 207, 652, 290) },
  },
  exa: { pi: { rect: R(16, 84, 620, 280) } },
  "git-menu": { claude: { still: "git.png", rect: R(724, 16, 508, 190) } },
  "linear-issue": { claude: { rect: R(724, 30, 508) } },
  spellfix: { claude: { rect: R(0, 470, 640) } },
  "transcript-tweaks": { pi: { rect: R(16, 324, 620, 244) } },
};

export interface Look {
  h: Harness;
  src: string;
  /** The source image's size. */
  width: number;
  height: number;
  /** The shown part, if cropped. */
  rect?: Crop["rect"];
}

export function looksOf(p: Plugin): Look[] {
  return postersOf(p).map((look) => {
    const c = CROPS[p.name]?.[look.h];
    if (!c) return look;
    return {
      ...look,
      src: c.still ? mediaUrl(`apps/site/media/${p.name}/${c.still}`) : look.src,
      rect: c.rect,
    };
  });
}
