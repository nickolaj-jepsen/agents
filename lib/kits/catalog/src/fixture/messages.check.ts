/**
 * Every way the schema says no, as the errors a caller sees. Not part of the build:
 * `fixture.spec.ts` compiles it with `tsconfig.fixture.json` and checks each message.
 */
import { assertExports, type PartsOf } from "@agents/kit-core/manifest.ts";
import type { RowProps } from "./contract.ts";
import manifest from "./manifest.ts";

assertExports<typeof import("./bad/stray.ts"), PartsOf<typeof manifest, "terminal">>(true);
assertExports<typeof import("./bad/missing.ts"), PartsOf<typeof manifest, "terminal">>(true);

export const onVscode: RowProps<"vscode"> = { key: "a", text: "A", focused: true };
export const onUnion: RowProps<"pi" | "vscode"> = { key: "a", text: "A", hovered: true };
export const onDesktop: RowProps<"desktop"> = { key: "a", text: "A", detailLines: 2 };

import { modelFields } from "@agents/kit-core/manifest.ts";
import type { Row } from "./contract.ts";
export const partial = modelFields<Row>()(["key", "text"]);
