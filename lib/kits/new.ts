/**
 * `turbo run kit-new -- <name>`: scaffolds a kit component, the package `lib/kits/<name>/` (`@agents/kit-<name>`: the
 * terminal drawing, the graphical one and the stories of both), and registers its stories in
 * the catalogue. Refuses a name that
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
    devDependencies: {
      "@agents/drive": "workspace:*",
      "@types/node": "catalog:",
      typescript: "catalog:",
      vitest: "catalog:",
    },
  }),
  "tsconfig.json": json({
    extends: "../../../tsconfig.base.node.json",
    include: ["src", "e2e"],
    exclude: ["src/**/*.tsx"],
  }),
  "turbo.json": json({
    extends: ["//"],
    tasks: {
      test: { command: ["./node_modules/.bin/vitest", "run"] },
      e2e: {
        command: ["node", "../../tools/drive/drive.ts", "test", `kit-${name}`],
        dependsOn: ["$TURBO_EXTENDS$", "@agents/kit-catalog#build"],
      },
      "e2e:update": {
        command: ["node", "../../tools/drive/drive.ts", "test", `kit-${name}`, "--update"],
        dependsOn: ["$TURBO_EXTENDS$", "@agents/kit-catalog#build"],
      },
      "media:vscode": {
        command: [
          "nix",
          "run",
          "../../..#media",
          "--",
          "node",
          "../../tools/drive/drive.ts",
          "record",
          `kit-${name}`,
          "--harness",
          "vscode",
        ],
        outputs: [
          `$TURBO_ROOT$/apps/site/media/kit/${name}/vscode-*`,
          `$TURBO_ROOT$/apps/site/media/kit/${name}/media-vscode.json`,
        ],
        dependsOn: ["$TURBO_EXTENDS$", "@agents/kit-catalog#build"],
      },
      media: {
        command: [
          "nix",
          "run",
          "../../..#media",
          "--",
          "node",
          "../../tools/drive/drive.ts",
          "record",
          `kit-${name}`,
        ],
        outputs: [
          `$TURBO_ROOT$/apps/site/media/kit/${name}/**`,
          `!$TURBO_ROOT$/apps/site/media/kit/${name}/vscode-*`,
          `!$TURBO_ROOT$/apps/site/media/kit/${name}/media-vscode.json`,
        ],
        dependsOn: ["$TURBO_EXTENDS$", "@agents/kit-catalog#build"],
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
  "README.md": `# @agents/kit-${name}

What the ${name} draws, in one line.

\`\`\`ts
import { ${camel} } from "@agents/kit-${name}/terminal.ts";
\`\`\`

\`src/terminal.ts\` draws the component as styled lines for a width, \`src/gui.tsx\` in native controls for Claude Desktop and VS Code (the same names and props, less the width), \`src/contract.ts\` has its props and results, and \`src/stories.ts\` one set of model data per state, drawn by the catalogue on the surfaces the manifest supports. \`e2e/\` plays the stories in pi, Claude Code and VS Code and holds their snapshots.

\`\`\`bash
pnpm drive ls kit-${name}                                    # the stories
pnpm drive live kit-${name} <story> --harness pi --watch     # one in a real session
\`\`\`

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
`,
  "src/contract.ts": `/** The ${name}'s contract. No host imports. */
import { modelFields } from "@agents/kit-core/manifest.ts";

export type ${pascal}Options = {
  /** What it says. */
  text: string;
};
export const fields = modelFields<${pascal}Options>()(["text"]);
`,
  "src/terminal.ts": `/** The ${name} as styled lines: the one drawing both terminals paint. */
import { block, inline, type Line } from "@agents/kit-core/lines.ts";
import type { ${pascal}Options } from "./contract.ts";

/** Draws \`text\` wrapped to \`width\` cells. Replace this with what the ${name} draws. */
export function ${camel}({ text }: ${pascal}Options, width: number): Line[] {
  return block(inline(text), width);
}
`,
  "src/gui.tsx": `/** The ${name} on the graphical surfaces: the same contract as \`terminal.ts\`, in native controls. */
import { span } from "@agents/kit-core/lines.ts";
import { spans, type Gui } from "@agents/kit-core/paint/gui.tsx";
import type { ${pascal}Options } from "./contract.ts";

/**
 * The same name and props as \`terminal.ts\`'s, less the width: the host sizes and scrolls.
 * A control's \`hit\` becomes a Button's \`onPress\` calling \`g.press(hit)\`.
 */
export function ${camel}(g: Gui, { text }: ${pascal}Options): JSX.Element {
  return spans(g, [span(text)]);
}
`,
  "src/stories.ts": `/** The ${name}'s data stories. No host imports. */
import type { Story } from "@agents/kit-core/stories.ts";
import type { ${pascal}Options } from "./contract.ts";

export const ${camel}Stories: Story<${pascal}Options>[] = [
  {
    component: "${name}",
    state: "default",
    about: "The ${name} as it first stands",
    settings: "${camel}({text})",
    model: { text: "A first line of text, long enough to wrap" },
  },
];
`,
  "src/manifest.ts": `import { defineComponent } from "@agents/kit-core/manifest.ts";
import { fields } from "./contract.ts";

export default defineComponent({
  schema: 2,
  id: "${name}",
  name: "${title}",
  purpose: "What the ${name} is for, in one line.",
  contract: { fields, needs: {} },
  parts: { ${camel}: {} },
  features: [
    {
      id: "default",
      label: "What the first story shows",
      fields: ["text"],
      story: "${name}/default",
    },
  ],
});
`,
  "src/terminal.spec.ts": `import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "@agents/kit-core/lines.ts";
import { ${camel}Stories } from "./stories.ts";
import { ${camel} } from "./terminal.ts";

describe("every ${name} story", () => {
  test.each(${camel}Stories.map((s) => ({ id: \`\${s.component}/\${s.state}\`, story: s })))(
    "$id fits every width",
    ({ story }) => {
      for (let width = 24; width <= 130; width++)
        for (const l of ${camel}(story.model, width))
          expect(widthOf(l), \`\${width}: \${textOf(l)}\`).toBeLessThanOrEqual(width);
    },
  );
});
`,
};
for (const [harness, factory] of [
  ["claude", "claudeScenarios"],
  ["pi", "piScenarios"],
  ["vscode", "vscodeKitScenarios"],
]) {
  files[`e2e/${harness}.scenarios.ts`] =
    `import { ${factory} } from "../../catalog/src/e2e/${harness}.ts";

export default ${factory}("kit-${name}", (component) => component === "${name}");
`;
}

for (const [file, text] of Object.entries(files)) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
}

// The catalogue knows the component's manifest, data stories, and drawing adapters.
const addTo = (file: string, insert: [marker: string, value: string][]) => {
  const path = join(kits, "catalog/src", file);
  let source = readFileSync(path, "utf8");
  for (const [marker, value] of insert) {
    if (!source.includes(marker)) fail(`${file} is missing scaffold marker: ${marker.trim()}`);
    source = source.replace(marker, () => marker + value);
  }
  writeFileSync(path, source);
};

const alias = `kit${pascal}`;
const manifestImport = `import ${alias}Manifest from "@agents/kit-${name}/manifest.ts";\n`;
addTo("registry.ts", [
  [
    'import type { ComponentV2 } from "@agents/kit-core/manifest.ts";\n',
    manifestImport + `import { ${camel}Stories } from "@agents/kit-${name}/stories.ts";\n`,
  ],
  ["export const kitStories2: Story[] = [\n", `  ...${camel}Stories,\n`],
  ["const manifests2: readonly ComponentV2[] = [\n", `  ${alias}Manifest,\n`],
  ["export const kitPackages: Record<string, KitStory[]> = {\n", `  "${name}": of2("${name}"),\n`],
  ["export const kitStories: KitStory[] = [\n", `  ...of2("${name}"),\n`],
]);

const model = `${pascal}Options`;
for (const [file, drawing, map, adapter] of [
  [
    "terminal2.ts",
    "terminal.ts",
    "terminal2: Record<string, (story: Story, width: number) => Line[]>",
    `(s, width) => ${alias}(s.model as ${model}, width)`,
  ],
  [
    "adapters.tsx",
    "gui.tsx",
    "gui2: Record<string, (g: Gui, story: Story) => JSX.Element>",
    `(g, s) => ${alias}(g, s.model as ${model})`,
  ],
] as const) {
  addTo(file, [
    [
      'import type { Story } from "@agents/kit-core/stories.ts";\n',
      `import { ${camel} as ${alias} } from "@agents/kit-${name}/${drawing}";\n` +
        `import type { ${model} } from "@agents/kit-${name}/contract.ts";\n`,
    ],
    [`export const ${map} = {\n`, `  "${name}": ${adapter},\n`],
  ]);
}

addTo("exports.check.ts", [
  ['import { assertExports, type PartsOf } from "@agents/kit-core/manifest.ts";\n', manifestImport],
]);
const checks = join(kits, "catalog/src/exports.check.ts");
writeFileSync(
  checks,
  readFileSync(checks, "utf8") +
    `assertExports<typeof import("@agents/kit-${name}/terminal.ts"), PartsOf<typeof ${alias}Manifest, "terminal">>(true);\n` +
    `assertExports<typeof import("@agents/kit-${name}/gui.tsx"), PartsOf<typeof ${alias}Manifest, "gui">>(true);\n`,
);

// The catalogue imports the kit and the site reads it: each depends on the new package.
for (const file of [
  join(kits, "catalog/package.json"),
  join(kits, "../../apps/site/package.json"),
]) {
  const pkg = JSON.parse(readFileSync(file, "utf8")) as {
    devDependencies: Record<string, string>;
  };
  pkg.devDependencies[`@agents/kit-${name}`] = "workspace:*";
  pkg.devDependencies = Object.fromEntries(
    Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(file, json(pkg));
}

console.log(`kit-new: created lib/kits/${name}/ and registered its stories in lib/kits/catalog (registry and drawing adapters)

Next:
  1. pnpm install   (links the new package)
  2. Draw it in lib/kits/${name}/src/terminal.ts and src/gui.tsx (the same names and props); fill in
     the stories, the manifest (parts, fields and capabilities) and the spec.
  3. pnpm turbo run e2e:update --filter=@agents/kit-${name}
  4. pnpm turbo run test --filter=@agents/kit-catalog   (the parity check fails with "no snapshot" until step 3)`);
