/** The band's own helpers, for its drawings and its view model. No host imports. */
import type { MeaningName } from "@agents/kit-core/icons.ts";
import type { StatusBandStatus } from "./contract.ts";

/** The meaning each status marks the band with on a graphical surface. */
export const statusMeaning = (status: StatusBandStatus): MeaningName => `state:${status}`;
