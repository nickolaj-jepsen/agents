/**
 * The built-in You should know card has no extension point, so the Linear button is spliced
 * into the tree it draws, found by its labels. These read and rebuild that tree.
 */
import type { RenderElement, RenderNode } from "claude-code";

export const ANCHOR = "Chat in main session";
export const LEARN_MORE = "Learn more";

type Element = Exclude<RenderNode, string>;

export const isElement = (node: RenderNode | undefined): node is Element =>
  typeof node === "object" && node !== null;

export const childrenOf = (node: Element): RenderNode[] =>
  "children" in node && Array.isArray(node.children) ? node.children : [];

export const isButton = (node: RenderNode, label: string) =>
  isElement(node) && node.type === "Button" && node.props.label === label;

export const isDismiss = (node: RenderNode) =>
  isElement(node) && node.type === "Button" && node.props.role === "dismiss";

/** The nodes from `root` down to the first node `match` accepts, both included; undefined when none does. */
export function pathTo(
  root: RenderNode,
  match: (node: RenderNode) => boolean,
): RenderNode[] | undefined {
  if (match(root)) return [root];
  if (!isElement(root)) return undefined;
  for (const child of childrenOf(root)) {
    const path = pathTo(child, match);
    if (path) return [root, ...path];
  }
  return undefined;
}

/** `root` with `target` (by identity) swapped for `replacement`. */
export function replace(root: RenderNode, target: RenderNode, replacement: RenderNode): RenderNode {
  if (root === target) return replacement;
  if (!isElement(root) || childrenOf(root).length === 0) return root;
  return {
    ...root,
    children: childrenOf(root).map((c) => replace(c, target, replacement)),
  } as Element;
}

/**
 * `tree` with `button` beside the anchor button: in a copy of the anchor's wrapper, before the
 * dismiss button when one shares a row with it. Undefined when the tree holds no anchor.
 */
export function insertButton(tree: RenderNode, button: RenderElement): RenderNode | undefined {
  const toAnchor = pathTo(tree, (n) => isButton(n, ANCHOR));
  const anchor = toAnchor?.at(-1);
  if (!toAnchor || !anchor || toAnchor.length < 2) return undefined;
  const toDismiss = pathTo(tree, isDismiss);

  // The row is the deepest node above both buttons; without a dismiss, the anchor's parent.
  let depth = toAnchor.length - 2;
  if (toDismiss) {
    depth = 0;
    while (depth + 2 < toAnchor.length && toAnchor[depth + 1] === toDismiss[depth + 1]) depth++;
  }
  const row = toAnchor[depth] as Element;
  const wrapper = toAnchor[depth + 1] as RenderNode;
  const kids = childrenOf(row);
  const dismissAt =
    toDismiss?.[depth + 1] === undefined ? -1 : kids.indexOf(toDismiss[depth + 1] as RenderNode);
  const at = dismissAt >= 0 ? dismissAt : kids.indexOf(wrapper) + 1;
  const copy = replace(wrapper, anchor, button);
  const newRow = { ...row, children: [...kids.slice(0, at), copy, ...kids.slice(at)] } as Element;
  return replace(tree, row, newRow);
}

/** The card's text, one line per Text, Markdown or Code, buttons left out. */
export function cardText(node: RenderNode): string {
  const lines: string[] = [];
  const flat = (n: RenderNode): string =>
    typeof n === "string" ? n : isElement(n) ? childrenOf(n).map(flat).join("") : "";
  const walk = (n: RenderNode) => {
    if (typeof n === "string") lines.push(n);
    else if (!isElement(n) || n.type === "Button") return;
    else if (n.type === "Text") lines.push(flat(n));
    else if (n.type === "Markdown") lines.push(n.props.text);
    else if (n.type === "Code") lines.push(n.props.source);
    else childrenOf(n).forEach(walk);
  };
  walk(node);
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

export const hasButtons = (node: RenderNode) =>
  pathTo(node, (n) => isElement(n) && n.type === "Button") !== undefined;

export function hotkeysIn(node: RenderNode): Set<string> {
  const taken = new Set<string>();
  const walk = (n: RenderNode) => {
    if (!isElement(n)) return;
    if (n.type === "Button" && typeof n.props.hotkey === "string") taken.add(n.props.hotkey);
    childrenOf(n).forEach(walk);
  };
  walk(node);
  return taken;
}
