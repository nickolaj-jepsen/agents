const imageExtension = /\.(png|jpe?g)$/i;
const unsafePath = /[\x00-\x1f\x7f\\]/;

/** Accept local Markdown destinations, not network URLs (including file://host). */
export function localImagePath(destination: string): string | null {
  if (/^file:\/\/\//i.test(destination)) destination = destination.slice(7);
  else if (/^[\w+.-]+:|^\/\//.test(destination)) return null;
  try {
    const path = decodeURIComponent(destination);
    return imageExtension.test(path) &&
      !unsafePath.test(path) &&
      !path.startsWith("//") &&
      !/^[\w+.-]+:/.test(path)
      ? path
      : null;
  } catch {
    return null;
  }
}

/** Inline Markdown links and image embeds, outside code. Bare paths are not requests to draw. */
export function* imageLinks(markdown: string): Generator<string> {
  let fence = "";
  const visible: string[] = [];
  for (const line of markdown.split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        marker &&
        marker[1]![0] === fence[0] &&
        marker[1]!.length >= fence.length &&
        !marker[2]?.trim()
      )
        fence = "";
      continue;
    }
    if (marker) {
      fence = marker[1]!;
      visible.push("");
    } else {
      visible.push(/^(?: {4}|\t)/.test(line) ? "" : line);
    }
  }
  // Consume escapes and code spans before looking for links. Allow an angle-bracket destination
  // with spaces, or a bare destination with escaped punctuation and one level of parentheses.
  const tokens =
    /\\[^\n]|(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)|!?\[(?:\\.|[^[\]\\\n])*\]\(\s*(?:<([^<>\n]+)>|((?:\\.|\([^()\n]*\)|[^\s()\\<>])+))(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)/g;
  const seen = new Set<string>();
  for (const match of visible.join("\n").matchAll(tokens)) {
    const target = match[2] ?? match[3];
    if (!target) continue;
    const path = localImagePath(target.replace(/\\([!-/:-@[-`{-~])/g, "$1"));
    if (path && !seen.has(path)) {
      seen.add(path);
      yield path;
    }
  }
}
