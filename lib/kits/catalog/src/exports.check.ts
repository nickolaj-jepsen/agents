/**
 * Type-only: the catalogue's claude program (`tsconfig.claude.json`, which can compile `.tsx`)
 * compiles it, and fails when a drawing's exports leave its component's manifest: a stray export,
 * or a declared part that is not there. A component on schema 2 adds its two lines here.
 */
import { assertExports, type PartsOf } from "@agents/kit-core/manifest.ts";
import buttons from "@agents/kit-buttons/manifest.ts";
import detail from "@agents/kit-detail/manifest.ts";
import list from "@agents/kit-list/manifest.ts";
import card from "@agents/kit-card/manifest.ts";
import fields from "@agents/kit-fields/manifest.ts";
import frame from "@agents/kit-frame/manifest.ts";
import sheet from "@agents/kit-sheet/manifest.ts";
import notice from "@agents/kit-notice/manifest.ts";
import band from "@agents/kit-band/manifest.ts";
import prose from "@agents/kit-prose/manifest.ts";
import image from "@agents/kit-image/manifest.ts";

assertExports<
  typeof import("@agents/kit-buttons/terminal.ts"),
  PartsOf<typeof buttons, "terminal">
>(true);
assertExports<typeof import("@agents/kit-buttons/gui.tsx"), PartsOf<typeof buttons, "gui">>(true);
assertExports<typeof import("@agents/kit-frame/terminal.ts"), PartsOf<typeof frame, "terminal">>(
  true,
);
assertExports<typeof import("@agents/kit-frame/gui.tsx"), PartsOf<typeof frame, "gui">>(true);
assertExports<typeof import("@agents/kit-sheet/terminal.ts"), PartsOf<typeof sheet, "terminal">>(
  true,
);
assertExports<typeof import("@agents/kit-sheet/gui.tsx"), PartsOf<typeof sheet, "gui">>(true);
assertExports<typeof import("@agents/kit-list/terminal.ts"), PartsOf<typeof list, "terminal">>(
  true,
);
assertExports<typeof import("@agents/kit-list/gui.tsx"), PartsOf<typeof list, "gui">>(true);
assertExports<typeof import("@agents/kit-detail/terminal.ts"), PartsOf<typeof detail, "terminal">>(
  true,
);
assertExports<typeof import("@agents/kit-detail/gui.tsx"), PartsOf<typeof detail, "gui">>(true);
assertExports<typeof import("@agents/kit-fields/terminal.ts"), PartsOf<typeof fields, "terminal">>(
  true,
);
assertExports<typeof import("@agents/kit-fields/gui.tsx"), PartsOf<typeof fields, "gui">>(true);
assertExports<typeof import("@agents/kit-card/terminal.ts"), PartsOf<typeof card, "terminal">>(
  true,
);
assertExports<typeof import("@agents/kit-card/gui.tsx"), PartsOf<typeof card, "gui">>(true);
assertExports<typeof import("@agents/kit-notice/terminal.ts"), PartsOf<typeof notice, "terminal">>(
  true,
);
assertExports<typeof import("@agents/kit-notice/gui.tsx"), PartsOf<typeof notice, "gui">>(true);
assertExports<typeof import("@agents/kit-band/terminal.ts"), PartsOf<typeof band, "terminal">>(
  true,
);
assertExports<typeof import("@agents/kit-band/gui.tsx"), PartsOf<typeof band, "gui">>(true);
assertExports<typeof import("@agents/kit-prose/terminal.ts"), PartsOf<typeof prose, "terminal">>(
  true,
);
assertExports<typeof import("@agents/kit-prose/gui.tsx"), PartsOf<typeof prose, "gui">>(true);
// The graphical clients show images themselves: the manifest declares no part there, and there
// is no `gui.tsx` to check.
assertExports<typeof import("@agents/kit-image/terminal.ts"), PartsOf<typeof image, "terminal">>(
  true,
);
