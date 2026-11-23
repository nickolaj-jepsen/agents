/** The notice and the empty state on the graphical surfaces: the same model, in native controls. */
import {
  meaning,
  roleProps,
  rowOf,
  spans,
  typeProps,
  type GuiSurface,
  type Gui,
} from "@agents/kit-core/paint/gui.tsx";
import { can } from "@agents/kit-core/surfaces.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import type { EmptyStateProps, NoticeProps } from "./contract.ts";
import { view } from "./model.ts";

/** What `notice` is given on a graphical surface; a field only a terminal has is not in it. */
export type NoticeGui = NoticeProps<GuiSurface>;

/** What `emptyState` is given on a graphical surface. */
export type EmptyStateGui = EmptyStateProps<GuiSurface>;

/**
 * The words in their type role. One plain span is a single `Text` carrying its role's colour;
 * spans of several styles are nested runs.
 */
function said(g: Gui, v: ReturnType<typeof view>, wrap?: "truncate-end"): JSX.Element {
  const { Text } = g.els;
  const [only] = v.text;
  if (v.text.length === 1 && only && !only.bold && !only.italic && !only.underline)
    return (
      <Text
        wrap={wrap}
        {...typeProps(v.type, { isSized: can(g, "textSize"), isToned: false })}
        {...roleProps(only.role)}
      >
        {only.text}
      </Text>
    );
  return spans(g, v.text, { type: v.type, wrap });
}

/**
 * One line telling the person what just happened: an icon for the state it is in (success,
 * warning, error, pending) and its words in a type role, at the inset. The surface wraps it, or
 * with `isCut` cuts it at the edge.
 */
export function notice(g: Gui, n: NoticeGui): JSX.Element {
  const { Box } = g.els;
  const v = view({ ...n, isEmpty: false }, g.surface);
  return (
    <Box flexDirection="column" paddingX={tokens.gui.across.inset}>
      {rowOf(
        g,
        {},
        // One line of its own: the icon and the words never wrap under each other.
        <Box
          flexDirection="row"
          flexWrap="nowrap"
          alignItems="center"
          columnGap={tokens.gui.across.sm}
        >
          {v.mark ? meaning(g, v.mark) : null}
          <Box flexShrink={1}>{said(g, v, v.rows === "cut" ? "truncate-end" : undefined)}</Box>
        </Box>,
      )}
    </Box>
  );
}

/**
 * What a list says when there is nothing in it: a caption-role line at the inset, wrapped by the
 * surface. `words` is the fuller sentence a graphical surface says in its place.
 */
export function emptyState(g: Gui, e: EmptyStateGui): JSX.Element {
  const { Box } = g.els;
  const v = view({ ...e, isEmpty: true }, g.surface);
  return (
    <Box flexDirection="column" paddingX={tokens.gui.across.inset}>
      {said(g, v)}
    </Box>
  );
}
