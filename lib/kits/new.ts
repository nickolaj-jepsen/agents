/**
 * `turbo run kit-new -- <name>`: scaffolds a kit component, the package `lib/kits/<name>/` (`@agents/kit-<name>`), and
 * registers its stories in `lib/kits/catalog/src/registry.ts` and the catalogue's dependencies. Refuses a name that
 * is not kebab-case or already exists.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kits = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? "";
const fail = (message: string): never => {
  console.error(`kit-new: ${message}`);
  process.exit(1);
};

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name))
  fail(`\`${name}\` is not kebab-case (for example \`status-line\`)`);
const dir = join(kits, name);
if (existsSync(dir)) fail(`lib/kits/${name}/ already exists`);

const words = name.split("-");
const pascal = words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join("");
const camel = pascal[0]?.toLowerCase() + pascal.slice(1);
const title = words.join(" ").replace(/^./, (c) => c.toUpperCase());

const json = (o: unknown) => JSON.stringify(o, null, 2) + "\n";

const files: Record<string, string> = {
  "package.json": json({
    name: `@agents/kit-${name}`,
    version: "0.0.0",
    private: true,
    type: "module",
    exports: { "./*": "./src/*" },
    dependencies: { "@agents/kit-core": "workspace:*" },
    devDependencies: { "@types/node": "catalog:", typescript: "catalog:", vitest: "catalog:" },
  }),
  "tsconfig.json": json({
    extends: "../../../tsconfig.base.node.json",
    include: ["src", "e2e"],
  }),
  "turbo.json": json({
    extends: ["//"],
    tasks: {
      test: { command: ["./node_modules/.bin/vitest", "run"] },
      e2e: {
        command: ["node", "../../tools/drive/run.ts"],
        dependsOn: ["^topo", "@agents/kit-catalog#build"],
      },
      "e2e:update": {
        command: ["node", "../../tools/drive/run.ts", "-u"],
        dependsOn: ["@agents/kit-catalog#build"],
      },
    },
  }),
  "vitest.config.ts": `import { defineConfig } from "vitest/config";

// A string \`tsconfigRaw\` keeps esbuild off the nearest tsconfig.json; tsc owns those.
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  // Turbo runs every package's specs and type-checks at once: on a small runner a 1–4 s spec can pass 5 s.
  test: { include: ["src/**/*.spec.ts"], testTimeout: 20_000 },
});
`,
  "src/contract.ts": `/** The ${name}'s contract. No host imports. */

export type ${pascal}Options = {
  /** What it says. */
  text: string;
};
`,
  "src/terminal.ts": `/** The ${name} as styled lines: the one drawing both terminals paint. */
import { block, inline, type Line } from "@agents/kit-core/lines.ts";
import type { ${pascal}Options } from "./contract.ts";

/** Draws \`text\` wrapped to \`width\` cells. Replace this with what the ${name} draws. */
export function ${camel}({ text }: ${pascal}Options, width: number): Line[] {
  return block(inline(text), width);
}
`,
  "src/stories.ts": `/** The ${name}'s stories. No host imports. */
import type { KitStory } from "@agents/kit-core/stories.ts";
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
  "src/manifest.ts": `import { defineComponent, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "${name}",
  name: "${title}",
  purpose: "What the ${name} is for, in one line.",
  impl: { pi: "${camel}", claude: "${camel}" },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "${name}/src/terminal.ts",
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
  "src/terminal.spec.ts": `import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "@agents/kit-core/lines.ts";
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
for (const harness of ["claude", "pi"])
  files[`e2e/${harness}.scenarios.ts`] = `import { ${camel}Stories } from "../src/stories.ts";
import { ${harness}Scenarios } from "../../catalog/src/e2e/${harness}.ts";

const mine = new Set(${camel}Stories.map((s) => s.component));

export default ${harness}Scenarios("kit-${name}", (component) => mine.has(component));
`;

for (const [file, text] of Object.entries(files)) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
}

// The catalogue lists every component's stories and depends on its package.
const registry = join(kits, "catalog/src/registry.ts");
const source = readFileSync(registry, "utf8");
const lastImport = [...source.matchAll(/^import \{ \w+Stories \} from .*stories\.ts";\n/gm)].pop();
const packages = /^(export const kitPackages: .* = \{\n[\s\S]*?)\};$/m;
const list = /^(export const kitStories: KitStory\[\] = \[[\s\S]*?)\];$/m;
if (!lastImport || !packages.test(source) || !list.test(source))
  fail("lib/kits/catalog/src/registry.ts has no `kitPackages` and `kitStories` to add to");
const at = (lastImport?.index ?? 0) + (lastImport?.[0].length ?? 0);
const next =
  source.slice(0, at) +
  `import { ${camel}Stories } from "@agents/kit-${name}/stories.ts";\n` +
  source.slice(at);
writeFileSync(
  registry,
  next
    .replace(packages, `$1  "${name}": ${camel}Stories,\n};`)
    .replace(list, `$1  ...${camel}Stories,\n];`),
);

const catalogPackage = join(kits, "catalog/package.json");
const catalog = JSON.parse(readFileSync(catalogPackage, "utf8")) as {
  dependencies: Record<string, string>;
};
catalog.dependencies[`@agents/kit-${name}`] = "workspace:*";
catalog.dependencies = Object.fromEntries(
  Object.entries(catalog.dependencies).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(catalogPackage, json(catalog));

console.log(`kit-new: created lib/kits/${name}/ and registered its stories in lib/kits/catalog

Next:
  1. pnpm install   (links the new package)
  2. Draw it in lib/kits/${name}/src/terminal.ts; fill in the story, the manifest and the spec.
  3. pnpm turbo run e2e:update --filter=@agents/kit-${name}
  4. pnpm turbo run test --filter=@agents/kit-catalog   (the parity check fails with "no snapshot" until step 3)`);
