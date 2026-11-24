/**
 * Everything the catalogue knows, as data; `build.ts` turns it into `COMPONENTS.md` and the kit
 * index, the site's kit loader reads it for the catalogue pages, and `problems` is what fails the build.
 * Screenshots: `crops.ts`.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hasTerminalStory } from "@agents/kit-core/stories.ts";
import { kitStories2 } from "./registry.ts";
import { answers, checkComponent2, drawnOn } from "./schema2.ts";
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
  type LegacyComponent,
  type ComponentV2,
  type Harness,
  type Support,
  type Surface,
  type SurfaceStatus,
} from "@agents/kit-core/manifest.ts";

export const here = dirname(fileURLToPath(import.meta.url));
/** The checkout: `lib/kits/catalog/src` is four folders down. */
export const repoRoot = join(here, "..", "..", "..", "..");

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

/** Why a terminal shows no render of a story that only the graphical clients draw. */
const GUI_ONLY = "only the graphical clients draw this story";

export type StoryModel = {
  id: string;
  state: string;
  /** Per harness; undefined when that harness has no story with this id. */
  by: Partial<Record<Harness, HarnessStory>>;
  /** Whether the graphical clients draw it too. */
  isGui: boolean;
  /** Why a harness has no story, shown in its place. */
  missing: Partial<Record<Harness, string>>;
};

export type FeatureModel = {
  id: string;
  label: string;
  support: Record<Harness, Support>;
  /** The graphical clients' answer; absent while `gui` is `legacy` and the feature has none. */
  gui?: Support;
  story: Partial<Record<Surface, string>>;
};

export type ComponentModel = {
  id: string;
  name: string;
  purpose: string;
  impl: Record<Harness, ImplState>;
  /** The exports of `gui.tsx`, or why the graphical clients cannot have it; absent without `impl.gui`. */
  guiImpl?: ImplState;
  /** Per surface the component is implemented on: `legacy` unless the manifest says `system`. */
  status: Partial<Record<Surface, SurfaceStatus>>;
  /** The file under `lib/kits/` that draws it on a `system` terminal, when the manifest names one. */
  source?: string;
  features: FeatureModel[];
  api: Record<Harness, { exports: ExportApi[]; types: TypeApi[] } | null>;
  /** `gui.tsx`'s exports, as `api` has the terminals'. */
  guiApi?: { exports: ExportApi[]; types: TypeApi[] } | null;
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

/** The legacy kits: pi's is all that is left; Claude Code draws every component with the kit. */
const kitFiles: Record<Harness, string | undefined> = {
  pi: join(kitRoot, "legacy/src/pi/ui.ts"),
  claude: undefined,
};

async function storiesOf(harness: Harness): Promise<Map<string, Meta> | undefined> {
  const file = ["stories.ts", "stories.tsx"]
    .map((f) => join(here, harness, f))
    .find((f) => existsSync(f));
  if (!file) return undefined;
  const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { stories: Meta[] };
  return new Map(mod.stories.map((s) => [`${s.component}/${s.state}`, s]));
}

const load = async <T>(file: string): Promise<T> =>
  ((await import(/* @vite-ignore */ pathToFileURL(file).href)) as { default: T }).default;

/** A kit component's own manifest, or an entry for the remaining legacy pi kit. */
async function manifests() {
  const folders = readdirSync(kitRoot, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        d.name !== "catalog" &&
        d.name !== "core" &&
        existsSync(join(kitRoot, d.name, "src/manifest.ts")),
    )
    .map((d) => d.name)
    .sort();
  const dir = join(here, "components");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts"))
    .sort();
  return Promise.all([
    ...folders.map(async (d) => ({
      c: await load<ComponentV2>(join(kitRoot, d, "src/manifest.ts")),
      legacy: false as const,
      where: `${d}/manifest`,
    })),
    ...files.map(async (f) => ({
      c: await load<LegacyComponent>(join(dir, f)),
      legacy: true as const,
      where: `components/${f.slice(0, -3)}`,
    })),
  ]);
}

export async function loadModel(): Promise<Model> {
  const problems: string[] = [];
  const notMirrored: string[] = [];
  const kits = Object.fromEntries(
    harnesses.map((h) => [
      h,
      {
        file: kitFiles[h] ? relative(kitRoot, kitFiles[h]) : "",
        present: kitFiles[h] !== undefined && existsSync(kitFiles[h]),
      },
    ]),
  ) as Model["kits"];
  const apis = Object.fromEntries(
    harnesses.map((h) => [h, kitFiles[h] && kits[h].present ? extractKit(kitFiles[h]) : undefined]),
  );
  const stories = Object.fromEntries(
    await Promise.all(harnesses.map(async (h) => [h, await storiesOf(h)] as const)),
  ) as Record<Harness, Map<string, Meta> | undefined>;

  const list = await manifests();
  const seen = new Set<string>();
  const components: ComponentModel[] = list.map(({ c, where, legacy }) => {
    if (seen.has(c.id)) problems.push(`${where}: duplicate component id`);
    seen.add(c.id);
    if (!legacy) {
      const own = kitStories2.filter((s) => s.component === c.id);
      problems.push(...checkComponent2(c, own, where));
      const folder = where.split("/")[0] ?? c.id;
      const apiOf = (file: string) =>
        existsSync(join(kitRoot, folder, file))
          ? extractKit(join(kitRoot, folder, file))
          : undefined;
      return modelOf2(c, own, folder, {
        terminal: apiOf("src/terminal.ts"),
        gui: apiOf("src/gui.tsx"),
      });
    }

    const status: ComponentModel["status"] = {};
    for (const h of harnesses) if (!isNone(c.impl[h])) status[h] = "legacy";
    if (!isNone(c.impl.claude)) status.gui = "legacy";

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
      const kit = apis[h];
      if (!kit) {
        impl[h] = { state: "planned", exports: names };
        api[h] = null;
        continue;
      }
      const have = names.filter((n) => kit.exports.some((e) => e.name === n));
      for (const n of names)
        if (!have.includes(n))
          problems.push(
            `${where}: ${h} impl names \`${n}\` but ${kits[h].file} does not export it`,
          );
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
      return {
        id: f.id,
        label: f.label,
        support: { pi: f.pi, claude: f.claude },
        story,
      };
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
      return { id, state: id.slice(c.id.length + 1), by, isGui: false, missing };
    });

    return {
      id: c.id,
      name: c.name,
      purpose: c.purpose,
      impl,
      status,
      features,
      api,
      stories: storyModels,
    };
  });

  return { kits, components, problems, notMirrored };
}

/**
 * A component of schema 2, in the catalogue's terms: its parts as the exports, its answers
 * derived from the table (pi, Claude Code's terminal, and VS Code for the graphical clients,
 * a note saying where Desktop or mobile differ). Its API is what the parts export, read from
 * `terminal.ts` and `gui.tsx` with the legacy extraction.
 */
export function modelOf2(
  c: ComponentV2,
  own: readonly { state: string; about: string; settings?: string }[],
  folder: string,
  sources: { terminal?: KitApi; gui?: KitApi } = {},
) {
  const parts = (d: "terminal" | "gui") =>
    Object.entries(c.parts)
      .filter(([, p]) => (p.drawings ?? ["terminal", "gui"]).includes(d))
      .map(([name]) => name);
  /** A drawing no part is in (`none`): the host draws it, and the parts say why. */
  const impl = (d: "terminal" | "gui"): ImplState =>
    parts(d).length
      ? { state: "exists", exports: parts(d) }
      : {
          state: "none",
          exports: [],
          reason: Object.values(c.parts)
            .map((p) => p.none?.[d])
            .find(Boolean),
        };
  const features = c.features.map((f): FeatureModel => {
    const a = answers(f);
    const gui = a.vscode;
    const others = (["desktop", "mobile"] as const).filter(
      (s) => a[s].status !== gui.status || a[s].note !== gui.note,
    );
    return {
      id: f.id,
      label: f.label,
      support: { pi: a.pi, claude: a["claude-terminal"] },
      gui: others.length
        ? {
            status: gui.status,
            note: [
              gui.note,
              ...others.map((s) => `${s}: ${a[s].status}${a[s].note ? `, ${a[s].note}` : ""}`),
            ]
              .filter(Boolean)
              .join("; "),
          }
        : gui,
      story: f.story ? { pi: f.story, claude: f.story, gui: f.story } : {},
    };
  });
  const apiOf = (d: "terminal" | "gui") => {
    const kit = sources[d];
    if (!kit) return null;
    const picked = kit.exports.filter((e) => parts(d).includes(e.name));
    return { exports: picked, types: referencedTypes(kit, picked) };
  };
  return {
    id: c.id,
    name: c.name,
    purpose: c.purpose,
    impl: { pi: impl("terminal"), claude: impl("terminal") },
    guiImpl: impl("gui"),
    status: {
      pi: "system",
      claude: "system",
      ...(parts("gui").length ? { gui: "system" as const } : {}),
    },
    source: `${folder}/src/terminal.ts`,
    features,
    api: { pi: apiOf("terminal"), claude: apiOf("terminal") },
    guiApi: apiOf("gui"),
    stories: own.map((s): StoryModel => {
      const on = drawnOn(c, `${c.id}/${s.state}`);
      const meta = { about: s.about, settings: s.settings };
      // As the terminal recorders do (`hasTerminalStory`): a story either terminal draws is played
      // in both, and one only the graphical clients draw is in neither.
      const isTerminal = hasTerminalStory({ surfaces: on });
      return {
        id: `${c.id}/${s.state}`,
        state: s.state,
        by: isTerminal ? { pi: meta, claude: meta } : {},
        isGui: on.includes("vscode"),
        missing: isTerminal ? {} : { pi: GUI_ONLY, claude: GUI_ONLY },
      };
    }),
  } satisfies ComponentModel;
}

function describe(i: ImplState): string {
  if (i.state === "none") return `not possible: ${i.reason}`;
  return `${i.state}: ${i.exports.map((e) => `\`${e}\``).join(", ")}`;
}

const tableCell = (text: string) => text.replace(/\r?\n/g, " ").replaceAll("|", "\\|");

/** `COMPONENTS.md`: components, per-harness status and features, from the manifests alone. */
export function markdown(model: Model): string {
  const out: string[] = [
    "<!-- Generated by `pnpm turbo run build` from lib/kits/catalog/src/components/*.ts and lib/kits/*/src/manifest.ts. Do not edit. -->",
    "",
    "# Kit components",
    "",
    "Which component each harness has, and which features each supports. A surface (pi, Claude Code's terminal, the graphical clients: Claude Desktop and VS Code) is `system` when it draws the component with the kit's one drawing and `legacy` when it still uses the old per-harness kit; no feature is `planned` on a `system` surface. Support: `yes`, `partial`, `no` (the engine cannot) and `planned` (can, not built yet). The props and renders of each component are on the site's catalogue (`apps/site/`, `/dev/components/`), read from the kit's own doc comments.",
    "",
  ];
  for (const c of model.components) {
    out.push(`## ${c.name}`, "", c.purpose, "");
    for (const h of harnesses) out.push(`- ${h}: ${describe(c.impl[h])}`);
    if (c.guiImpl) out.push(`- gui: ${describe(c.guiImpl)}`);
    out.push(
      `- status: ${surfaces.flatMap((x) => (c.status[x] ? [`${x} ${c.status[x]}`] : [])).join("; ")}`,
    );
    out.push(
      "",
      "| Feature | pi | Claude Code (terminal) | Desktop and VS Code |",
      "| --- | --- | --- | --- |",
    );
    for (const f of c.features) {
      const cell = ({ status, note }: Support) => `**${status}**${note ? ` — ${note}` : ""}`;
      const support = [...harnesses.map((h) => cell(f.support[h])), f.gui ? cell(f.gui) : "legacy"];
      out.push(`| ${[f.label, ...support].map(tableCell).join(" | ")} |`);
    }
    out.push("");
  }
  return out.join("\n");
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
