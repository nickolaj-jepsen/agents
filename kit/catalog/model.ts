/**
 * Everything the catalogue knows, as data: `build.ts` turns it into `COMPONENTS.md`, and `problems`
 * is what fails the build. The terminal commands that draw a component are `pi/` and `claude/`.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  exportsIn,
  exportsOf,
  harnesses,
  storyOf,
  type Component,
  type Harness,
  type Support,
} from "./manifest.ts";

export const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = join(here, "..");

type Meta = { component: string; state: string; about?: string; settings?: string };

export type ImplState = {
  state: "exists" | "planned" | "none";
  exports: string[];
  /** Why the harness has none, when it has none. */
  reason?: string;
};

export type HarnessStory = { about?: string; settings?: string };

export type StoryModel = {
  id: string;
  state: string;
  /** Per harness; undefined when that harness has no story with this id. */
  by: Partial<Record<Harness, HarnessStory>>;
  /** Why a harness has no story, shown in its place. */
  missing: Partial<Record<Harness, string>>;
};

export type FeatureModel = {
  id: string;
  label: string;
  support: Record<Harness, Support>;
  story: Partial<Record<Harness, string>>;
};

export type ComponentModel = {
  id: string;
  name: string;
  purpose: string;
  impl: Record<Harness, ImplState>;
  features: FeatureModel[];
  stories: StoryModel[];
};

export type Model = {
  kits: Record<Harness, { file: string; present: boolean }>;
  components: ComponentModel[];
  /** Fails the build. */
  problems: string[];
  /** Printed, never fatal: a component in one kit and not yet in the other. */
  notMirrored: string[];
};

const kitFiles: Record<Harness, string> = {
  pi: join(kitRoot, "pi/ui.ts"),
  claude: join(kitRoot, "claude/ui.tsx"),
};

async function storiesOf(harness: Harness): Promise<Map<string, Meta> | undefined> {
  const file = ["stories.ts", "stories.tsx"]
    .map((f) => join(here, harness, f))
    .find((f) => existsSync(f));
  if (!file) return undefined;
  const mod = (await import(pathToFileURL(file).href)) as { stories: Meta[] };
  return new Map(mod.stories.map((s) => [`${s.component}/${s.state}`, s]));
}

async function manifests(): Promise<Component[]> {
  const dir = join(here, "components");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts"))
    .sort();
  return Promise.all(
    files.map(
      async (f) =>
        ((await import(pathToFileURL(join(dir, f)).href)) as { default: Component }).default,
    ),
  );
}

export async function loadModel(): Promise<Model> {
  const problems: string[] = [];
  const notMirrored: string[] = [];
  const kits = Object.fromEntries(
    harnesses.map((h) => [
      h,
      { file: relative(kitRoot, kitFiles[h]), present: existsSync(kitFiles[h]) },
    ]),
  ) as Model["kits"];
  const apis = Object.fromEntries(
    harnesses.map((h) => [h, kits[h].present ? exportsIn(kitFiles[h]) : undefined]),
  );
  const stories = Object.fromEntries(
    await Promise.all(harnesses.map(async (h) => [h, await storiesOf(h)] as const)),
  ) as Record<Harness, Map<string, Meta> | undefined>;

  const list = await manifests();
  const seen = new Set<string>();
  const components: ComponentModel[] = list.map((c) => {
    const where = `components/${c.id}`;
    if (seen.has(c.id)) problems.push(`${where}: duplicate component id`);
    seen.add(c.id);

    const impl = {} as Record<Harness, ImplState>;
    for (const h of harnesses) {
      const i = c.impl[h];
      if (typeof i === "object" && !Array.isArray(i)) {
        impl[h] = { state: "none", exports: [], reason: i.none };
        continue;
      }
      const names = exportsOf(i);
      const kit = apis[h];
      if (!kit) {
        impl[h] = { state: "planned", exports: names };
        continue;
      }
      const have = names.filter((n) => kit.has(n));
      for (const n of names)
        if (!have.includes(n))
          problems.push(
            `${where}: ${h} impl names \`${n}\` but ${kits[h].file} does not export it`,
          );
      impl[h] = { state: have.length === names.length ? "exists" : "planned", exports: names };
    }
    if (
      harnesses.every((h) => impl[h].state !== "exists") &&
      harnesses.some((h) => kits[h].present)
    )
      problems.push(`${where}: no kit exports this component`);

    const ids = new Set<string>();
    const features = c.features.map((f): FeatureModel => {
      if (ids.has(f.id)) problems.push(`${where}: duplicate feature id \`${f.id}\``);
      ids.add(f.id);
      const story = {} as FeatureModel["story"];
      for (const h of harnesses) {
        const sid = storyOf(f, h);
        if (sid !== undefined) story[h] = sid;
        const s = f[h];
        if (s.status === "yes" || s.status === "partial") {
          if (impl[h].state === "none")
            problems.push(
              `${where}: feature \`${f.id}\` is ${s.status} on ${h}, which has no implementation`,
            );
          if (sid === undefined)
            problems.push(
              `${where}: feature \`${f.id}\` is ${s.status} on ${h} but names no story`,
            );
          else if (!stories[h]?.has(sid))
            problems.push(
              `${where}: feature \`${f.id}\` is ${s.status} on ${h} but story \`${sid}\` is not in the ${h} stories`,
            );
        }
        if ((s.status === "partial" || s.status === "no") && !s.note)
          problems.push(
            `${where}: feature \`${f.id}\` is ${s.status} on ${h} and needs a note saying why`,
          );
      }
      return { id: f.id, label: f.label, support: { pi: f.pi, claude: f.claude }, story };
    });

    const a = impl.pi.state;
    const b = impl.claude.state;
    if ((a === "exists") !== (b === "exists") && (a !== "none" || b !== "none"))
      notMirrored.push(
        a === "exists"
          ? `${c.id}: in pi, claude is ${b === "none" ? "not possible" : "planned"}`
          : `${c.id}: in claude, pi is ${a === "none" ? "not possible" : "planned"}`,
      );

    const storyIds = new Set<string>();
    for (const h of harnesses)
      for (const id of stories[h]?.keys() ?? []) if (id.startsWith(`${c.id}/`)) storyIds.add(id);
    const storyModels = [...storyIds].map((id): StoryModel => {
      const by: StoryModel["by"] = {};
      const missing: StoryModel["missing"] = {};
      for (const h of harnesses) {
        const meta = stories[h]?.get(id);
        if (meta) {
          by[h] = { about: meta.about, settings: meta.settings };
          continue;
        }
        missing[h] =
          impl[h].state === "none"
            ? (impl[h].reason ?? "not possible")
            : !kits[h].present
              ? `the ${h} kit is not built yet`
              : `the ${h} kit has no story with this id`;
      }
      return { id, state: id.slice(c.id.length + 1), by, missing };
    });

    return {
      id: c.id,
      name: c.name,
      purpose: c.purpose,
      impl,
      features,
      stories: storyModels,
    };
  });

  return { kits, components, problems, notMirrored };
}

function describe(i: ImplState): string {
  if (i.state === "none") return `not possible: ${i.reason}`;
  return `${i.state}: ${i.exports.map((e) => `\`${e}\``).join(", ")}`;
}

/** `COMPONENTS.md`: components, per-harness status and features, from the manifests alone. */
export function markdown(model: Model): string {
  const out: string[] = [
    "<!-- Generated by `npm run components` from kit/catalog/components/*.ts. Do not edit. -->",
    "",
    "# Kit components",
    "",
    "Which component each harness has, and which features each supports. Status: `yes`, `partial`, `no` (the engine cannot) and `planned` (can, not built yet). Run `/kit` in a session to draw one, or `npm run e2e kit` to replay its stories.",
    "",
  ];
  for (const c of model.components) {
    out.push(`## ${c.name}`, "", c.purpose, "");
    for (const h of harnesses) out.push(`- ${h}: ${describe(c.impl[h])}`);
    out.push("", "Features:", "");
    for (const f of c.features) {
      const cell = (h: Harness) => {
        const s = f.support[h];
        return `${h} ${s.status}${s.note ? ` (${s.note})` : ""}`;
      };
      out.push(`- ${f.label}: ${cell("pi")}; ${cell("claude")}`);
    }
    out.push("");
  }
  return out.join("\n");
}
