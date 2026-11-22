/**
 * Everything the catalogue knows, as data; `build.ts` turns it into `COMPONENTS.md` and
 * `catalog.json` for the site, and `problems` is what fails the build. Screenshots: `crops.ts`.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { kitStories } from "./registry.ts";
import {
  extractKit,
  referencedTypes,
  type ExportApi,
  type KitApi,
  type TypeApi,
} from "./extract.ts";
import {
  exportsOf,
  harnesses,
  isNone,
  surfaces,
  storyOf,
  type Component,
  type Harness,
  type Support,
  type Surface,
  type SurfaceStatus,
} from "@agents/kit-core/manifest.ts";

export const here = dirname(fileURLToPath(import.meta.url));
/** The checkout: `lib/kits/catalog/src` is four folders down. */
export const repoRoot = join(here, "..", "..", "..", "..");

/** The folders of the kit packages (`lib/kits/<name>`) that have scenarios, whose snapshots the catalogue reads. */
export const snapshotRoots = (harness: string): string[] =>
  readdirSync(join(repoRoot, "lib/kits"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(repoRoot, "lib/kits", d.name, "e2e/__snapshots__", harness))
    .filter((dir) => existsSync(dir));
// `lib/kits`: a manifest's `source` is a path under it.
const kitRoot = join(here, "..", "..");

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
  /** Per surface the component is implemented on: `legacy` unless the manifest says `system`. */
  status: Partial<Record<Surface, SurfaceStatus>>;
  /** The file under `lib/kits/` that draws it on a `system` terminal, when the manifest names one. */
  source?: string;
  features: FeatureModel[];
  api: Record<Harness, { exports: ExportApi[]; types: TypeApi[] } | null>;
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
  pi: join(kitRoot, "legacy/src/pi/ui.ts"),
  claude: join(kitRoot, "legacy/src/claude/ui.tsx"),
};

async function storiesOf(harness: Harness): Promise<Map<string, Meta> | undefined> {
  const file = ["stories.ts", "stories.tsx"]
    .map((f) => join(here, harness, f))
    .find((f) => existsSync(f));
  if (!file) return undefined;
  const mod = (await import(pathToFileURL(file).href)) as { stories: Meta[] };
  return new Map(mod.stories.map((s) => [`${s.component}/${s.state}`, s]));
}

const load = async (file: string) =>
  ((await import(pathToFileURL(file).href)) as { default: Component }).default;

/** A kit component's own `manifest.ts` first, then the legacy kits' `components/*.ts`. */
async function manifests(): Promise<{ c: Component; where: string }[]> {
  const folders = readdirSync(kitRoot, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() && d.name !== "catalog" && d.name !== "core" && existsSync(join(kitRoot, d.name, "src/manifest.ts")),
    )
    .map((d) => d.name)
    .sort();
  const dir = join(here, "components");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts"))
    .sort();
  return Promise.all([
    ...folders.map(async (d) => ({
      c: await load(join(kitRoot, d, "src/manifest.ts")),
      where: `${d}/manifest`,
    })),
    ...files.map(async (f) => ({
      c: await load(join(dir, f)),
      where: `components/${f.slice(0, -3)}`,
    })),
  ]);
}

/** The kit's own stories, which a `system` surface draws. */
const systemStories = new Map<string, Meta>(
  kitStories.map((s) => [`${s.component}/${s.state}`, s]),
);

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
    harnesses.map((h) => [h, kits[h].present ? extractKit(kitFiles[h]) : undefined]),
  );
  const stories = Object.fromEntries(
    await Promise.all(harnesses.map(async (h) => [h, await storiesOf(h)] as const)),
  ) as Record<Harness, Map<string, Meta> | undefined>;

  const list = await manifests();
  const seen = new Set<string>();
  const components: ComponentModel[] = list.map(({ c, where }) => {
    if (seen.has(c.id)) problems.push(`${where}: duplicate component id`);
    seen.add(c.id);

    const isSystem = (h: Harness) => c.status?.[h] === "system";
    const status: ComponentModel["status"] = {};
    for (const h of harnesses) if (!isNone(c.impl[h])) status[h] = c.status?.[h] ?? "legacy";
    if (!isNone(c.impl.claude)) status.gui = c.status?.gui ?? "legacy";
    if (c.status?.gui === "system")
      problems.push(`${where}: gui cannot be \`system\` yet: the kit draws terminals only`);
    let sourceApi: KitApi | undefined;
    if (harnesses.some(isSystem)) {
      if (!c.source)
        problems.push(`${where}: a \`system\` surface needs \`source\`, the file that draws it`);
      else if (!existsSync(join(kitRoot, c.source)))
        problems.push(`${where}: source \`${c.source}\` does not exist under lib/kits/`);
      else sourceApi = extractKit(join(kitRoot, c.source));
    }
    const kitOf = (h: Harness) => (isSystem(h) ? sourceApi : apis[h]);
    const fileOf = (h: Harness) => (isSystem(h) ? (c.source ?? "") : kits[h].file);
    const storiesFor = (h: Harness) => (isSystem(h) ? systemStories : stories[h]);

    const impl = {} as Record<Harness, ImplState>;
    const api = {} as ComponentModel["api"];
    for (const h of harnesses) {
      const i = c.impl[h];
      if (typeof i === "object" && !Array.isArray(i)) {
        impl[h] = { state: "none", exports: [], reason: i.none };
        api[h] = null;
        continue;
      }
      const names = exportsOf(i);
      const kit = kitOf(h);
      if (!kit) {
        impl[h] = { state: "planned", exports: names };
        api[h] = null;
        continue;
      }
      const have = names.filter((n) => kit.exports.some((e) => e.name === n));
      for (const n of names)
        if (!have.includes(n))
          problems.push(`${where}: ${h} impl names \`${n}\` but ${fileOf(h)} does not export it`);
      impl[h] = { state: have.length === names.length ? "exists" : "planned", exports: names };
      const picked = kit.exports.filter((e) => have.includes(e.name));
      api[h] = { exports: picked, types: referencedTypes(kit, picked) };
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
          else if (!storiesFor(h)?.has(sid))
            problems.push(
              `${where}: feature \`${f.id}\` is ${s.status} on ${h} but story \`${sid}\` is not in the ${h} stories`,
            );
        }
        if (s.status === "planned" && status[h] === "system")
          problems.push(
            `${where}: feature \`${f.id}\` is planned on ${h}, which is \`system\`: say yes, partial or no`,
          );
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
      for (const id of storiesFor(h)?.keys() ?? []) if (id.startsWith(`${c.id}/`)) storyIds.add(id);
    const storyModels = [...storyIds].map((id): StoryModel => {
      const by: StoryModel["by"] = {};
      const missing: StoryModel["missing"] = {};
      for (const h of harnesses) {
        const meta = storiesFor(h)?.get(id);
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
      status,
      source: c.source,
      features,
      api,
      stories: storyModels,
    };
  });

  return { kits, components, problems, notMirrored };
}

function describe(i: ImplState): string {
  if (i.state === "none") return `not possible: ${i.reason}`;
  return `${i.state}: ${i.exports.map((e) => `\`${e}\``).join(", ")}`;
}

const tableCell = (text: string) => text.replace(/\r?\n/g, " ").replaceAll("|", "\\|");

/** `COMPONENTS.md`: components, per-harness status and features, from the manifests alone. */
export function markdown(model: Model): string {
  const out: string[] = [
    "<!-- Generated by `turbo run catalog` from lib/kits/catalog/src/components/*.ts and lib/kits/*/src/manifest.ts. Do not edit. -->",
    "",
    "# Kit components",
    "",
    "Which component each harness has, and which features each supports. A surface (pi, Claude Code's terminal, the graphical clients) is `system` when it draws the component with the kit's one drawing and `legacy` when it still uses the old per-harness kit; no feature is `planned` on a `system` surface. Support: `yes`, `partial`, `no` (the engine cannot) and `planned` (can, not built yet). The props and renders of each component are on the site's catalogue (`apps/site/`, `/dev/components/`), read from the kit's own doc comments.",
    "",
  ];
  for (const c of model.components) {
    out.push(`## ${c.name}`, "", c.purpose, "");
    for (const h of harnesses) out.push(`- ${h}: ${describe(c.impl[h])}`);
    out.push(
      `- status: ${surfaces.flatMap((x) => (c.status[x] ? [`${x} ${c.status[x]}`] : [])).join("; ")}`,
    );
    out.push("", "| Feature | pi | Claude Code (terminal) |", "| --- | --- | --- |");
    for (const f of c.features) {
      const support = harnesses.map((h) => {
        const { status, note } = f.support[h];
        return `**${status}**${note ? ` — ${note}` : ""}`;
      });
      out.push(`| ${[f.label, ...support].map(tableCell).join(" | ")} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

/** `catalog.json`: the model the site's catalogue pages read, everything but the problems. */
export function siteData(model: Model): string {
  const { kits, components } = model;
  return JSON.stringify({ kits, components }, null, 2) + "\n";
}

export const indexMarkers = { start: "<!-- kit:index:start -->", end: "<!-- kit:index:end -->" };

/**
 * The block of `AGENTS.md` that lists the components a `system` surface draws. The blank rows
 * inside the markers are the formatter's, so `turbo run fmt` leaves the block as written.
 */
export function agentsIndex(model: Model): string {
  const system = model.components.filter(
    (c) => c.source && harnesses.some((h) => c.status[h] === "system"),
  );
  return [
    indexMarkers.start,
    "",
    "## Kit components",
    "",
    "Draw plugin UI with these; add one with `pnpm turbo run kit-new -- <name>`.",
    "",
    ...system.map((c) => `- \`lib/kits/${(c.source ?? "").split("/")[0]}/\`: ${c.purpose}`),
    "",
    indexMarkers.end,
  ].join("\n");
}

/** `AGENTS.md` with its index block replaced by `agentsIndex`; `undefined` without the markers. */
export function withIndex(agents: string, model: Model): string | undefined {
  const a = agents.indexOf(indexMarkers.start);
  const b = agents.indexOf(indexMarkers.end);
  if (a < 0 || b < a) return undefined;
  return agents.slice(0, a) + agentsIndex(model) + agents.slice(b + indexMarkers.end.length);
}
