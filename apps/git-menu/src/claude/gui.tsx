/** The menu pane on Desktop and VS Code: the same kit components, drawn with native controls. */
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import { captionFrame } from "@agents/kit-frame/gui.tsx";
import { span } from "@agents/kit-core/lines.ts";
import { list } from "@agents/kit-list/gui.tsx";
import { emptyState } from "@agents/kit-notice/gui.tsx";
import { detailOf, menuRows, MORE } from "./screen.ts";
import type { Menu } from "./types.d.ts";

/** What the pane says in place of rows, as a graphical surface says it: whole sentences. */
const says = (m: Menu): string | undefined => {
  if (m.error) {
    return m.kind === "notes"
      ? "No notes yet. Plans and notes saved in this checkout's store show up here."
      : m.error;
  }
  if (m.rows === null) return m.kind === "notes" ? "Looking for notes" : "Asking git";
  return undefined;
};

/**
 * The toolbar line under the host's own title, then the rows or what stands in for them.
 * @param isAll Whether the rest of a long list is shown.
 */
export function guiMenu(g: Gui, m: Menu | null, isAll: boolean): JSX.Element {
  if (!m) return emptyState(g, "No menu open.");
  const detail = detailOf(m);
  const words = says(m);
  return captionFrame(
    g,
    { title: m.title, caption: detail ? [span(detail, { role: "dim" })] : undefined },
    {
      hostTitle: m.title,
      body:
        words !== undefined
          ? emptyState(g, words)
          : list(
              g,
              { groups: [{ label: "", rows: menuRows(m.rows ?? []) }], rail: false },
              { more: { isAll, hit: MORE } },
            ),
    },
  );
}
