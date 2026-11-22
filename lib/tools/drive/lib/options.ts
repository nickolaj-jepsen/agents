/**
 * What the flags of `drive` set for a run: one object, read wherever a run needs a flag. Setting it also hands it to the processes the run starts (vitest's workers, the
 * fresh process that replays a scenario for live mode) through a single internal variable, so the
 * flags reach them; nothing here is meant to be set by hand.
 */

export type Options = {
  /** Keep a run's folder and logs when it ends or fails to start, and say where. */
  keep?: boolean;
  /** Print how long each phase of a VS Code start took. */
  timing?: boolean;
  /** Accept the screens as the new snapshots. */
  update?: boolean;
  /** Draw a PNG beside every snapshot. */
  png?: boolean;
  /** Sessions at once per harness, in place of the CPU-based default: one number for both, or each. */
  jobs?: number | { claude?: number; pi?: number };
  /** Where run folders are made, in place of `/tmp`. */
  tmp?: string;
  /** `shot`, `sweep` and `compare` of VS Code: device pixels per CSS pixel. */
  scale?: number;
  /** `test`: the package whose scenarios run, and the pattern that picks tests. */
  package?: string;
  filter?: string;
};

const INTERNAL = "AGENTS_DRIVE_OPTIONS";

const inherited = (): Options => {
  try {
    return JSON.parse(process.env[INTERNAL] ?? "{}") as Options;
  } catch {
    return {};
  }
};

export const options: Options = inherited();

/** Sets `o` for this process and the ones it starts. */
export function setOptions(o: Options) {
  Object.assign(options, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));
  process.env[INTERNAL] = JSON.stringify(options);
}
