/**
 * Where the frame is drawn: a session that draws pi's terminal UI. A headless one (`pi -p`, JSON,
 * RPC) shows none of it, and neither does a session whose mode draws no terminal at all. The
 * editor, the footer, the title and every git call hang off this one answer.
 */
export type SessionMode = "tui" | "rpc" | "json" | "print";

export const liveFrame = (mode: SessionMode | string, hasUI: boolean): boolean =>
  mode === "tui" && hasUI;
