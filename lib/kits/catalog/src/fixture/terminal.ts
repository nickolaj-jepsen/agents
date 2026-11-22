import type { RowProps } from "./contract.ts";

export const rows = (props: RowProps<"pi" | "claude-terminal">[]) => props.map((p) => p.text);
export const rowsFollow = (top: number) => top;
