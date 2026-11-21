/**
 * `turbo run kit-new -- <name>`: scaffolds a kit component, `kit/<name>/`, and registers its stories in
 * `kit/stories.ts`. Refuses a name that is not kebab-case or already exists.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kit = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? "";
const fail = (message: string): never => {
  console.error(`kit-new: ${message}`);
  process.exit(1);
};

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name))
  fail(`\`${name}\` is not kebab-case (for example \`status-line\`)`);
const dir = join(kit, name);
if (existsSync(dir)) fail(`kit/${name}/ already exists`);

const words = name.split("-");
const pascal = words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join("");
const camel = pascal[0]?.toLowerCase() + pascal.slice(1);
const title = words.join(" ").replace(/^./, (c) => c.toUpperCase());

const files: Record<string, string> = {
  "contract.ts": `/** The ${name}'s contract. No host imports. */

export type ${pascal}Options = {
  /** What it says. */
  text: string;
};
`,
  "terminal.ts": `/** The ${name} as styled lines: the one drawing both terminals paint. */
import { block, inline, type Line } from "../lines.ts";
import type { ${pascal}Options } from "./contract.ts";

/** Draws \`text\` wrapped to \`width\` cells. Replace this with what the ${name} draws. */
export function ${camel}({ text }: ${pascal}Options, width: number): Line[] {
  return block(inline(text), width);
}
`,
  "stories.ts": `/** The ${name}'s stories. No host imports. */
import type { KitStory } from "../stories.ts";
import { ${camel} } from "./terminal.ts";

export const ${camel}Stories: KitStory[] = [
  {
    component: "${name}",
    state: "default",
    about: "The ${name} as it first stands",
    settings: "${camel}({text})",
    lines: (width) => ${camel}({ text: "A first line of text, long enough to wrap" }, width),
  },
];
`,
  "manifest.ts": `import { defineComponent, yes } from "../catalog/manifest.ts";

export default defineComponent({
  id: "${name}",
  name: "${title}",
  purpose: "What the ${name} is for, in one line.",
  impl: { pi: "${camel}", claude: "${camel}" },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "${name}/terminal.ts",
  features: [
    {
      id: "default",
      label: "What the first story shows",
      story: "${name}/default",
      pi: yes(),
      claude: yes(),
    },
  ],
});
`,
  "terminal.spec.ts": `import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "../lines.ts";
import { ${camel}Stories } from "./stories.ts";

describe("every ${name} story", () => {
  test.each(${camel}Stories.map((s) => ({ id: \`\${s.component}/\${s.state}\`, story: s })))(
    "$id fits every width",
    ({ story }) => {
      for (let width = 24; width <= 130; width++)
        for (const l of story.lines(width))
          expect(widthOf(l), \`\${width}: \${textOf(l)}\`).toBeLessThanOrEqual(width);
    },
  );
});
`,
};

mkdirSync(dir);
for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);

const registry = join(kit, "stories.ts");
const source = readFileSync(registry, "utf8");
const list = /^(export const kitStories: KitStory\[\] = \[.*)\];$/m;
const lastImport = [...source.matchAll(/^import .*stories\.ts";\n/gm)].pop();
if (!list.test(source) || !lastImport) fail("kit/stories.ts has no `kitStories` list to add to");
const at = (lastImport?.index ?? 0) + (lastImport?.[0].length ?? 0);
const next =
  source.slice(0, at) +
  `import { ${camel}Stories } from "./${name}/stories.ts";\n` +
  source.slice(at);
writeFileSync(registry, next.replace(list, `$1, ...${camel}Stories];`));

console.log(`kit-new: created kit/${name}/ and registered its stories in kit/stories.ts

Next:
  1. Draw it in kit/${name}/terminal.ts; fill in the story, the manifest and the spec.
  2. pnpm turbo run kit-sync
  3. pnpm turbo run e2e:update --filter=@agents/e2e-kit -- -t '${name}/'
  4. pnpm turbo run test --filter=@agents/kit   (the parity check fails with "no snapshot" until step 3)`);
