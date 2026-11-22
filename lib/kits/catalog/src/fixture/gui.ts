import type { RowProps } from "./contract.ts";

export const rows = (props: RowProps<"vscode" | "desktop" | "mobile">[]) =>
  props.map((p) => p.text);
