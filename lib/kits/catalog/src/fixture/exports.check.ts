/** Type-only: `check-types` compiles it, and fails when a drawing's exports leave the manifest. */
import { assertExports, type PartsOf } from "@agents/kit-core/manifest.ts";
import manifest from "./manifest.ts";

assertExports<typeof import("./terminal.ts"), PartsOf<typeof manifest, "terminal">>(true);
assertExports<typeof import("./gui.ts"), PartsOf<typeof manifest, "gui">>(true);
