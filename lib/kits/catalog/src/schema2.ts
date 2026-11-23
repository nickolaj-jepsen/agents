/**
 * What the catalogue checks of a component on schema 2 (`schema: 2`), and what it derives from
 * its manifest: each feature's answer on each surface, the surfaces that draw each story, and
 * the view model's snapshot per story. Pure: the specs feed it the fixture, `model.ts` every
 * component that opted in.
 */
import {
  answerOf,
  type ComponentV2,
  type FeatureV2,
  type Support,
} from "@agents/kit-core/manifest.ts";
import { isPlain, type Story } from "@agents/kit-core/stories.ts";
import {
  drawings,
  surfaceNames,
  surfaces,
  type CapName,
  type Drawing,
  type Surface,
} from "@agents/kit-core/surfaces.ts";

/** The drawing of a surface (`terminal` or `gui`). */
export const drawingOf = (s: Surface): Drawing => surfaces[s].drawing;

/** A feature's answer on every surface, from the table. */
export const answers = (f: FeatureV2): Record<Surface, Support> =>
  Object.fromEntries(surfaceNames.map((s) => [s, answerOf(f, s)])) as Record<Surface, Support>;

/** The surfaces that draw a story: those where a feature that names it is `yes` or `partial`. */
export function drawnOn(c: ComponentV2, storyId: string): Surface[] {
  return surfaceNames.filter((s) =>
    c.features.some((f) => f.story === storyId && answerOf(f, s).status !== "no"),
  );
}

const capNames = (): Set<string> =>
  new Set(Object.keys(surfaces.pi).filter((k) => k !== "drawing"));

/**
 * Everything wrong with a component's manifest, as sentences. `stories` are its stories.
 * @param where How the component is named in a message.
 */
export function checkComponent2(
  c: ComponentV2,
  stories: readonly Story[],
  where: string = c.id,
): string[] {
  const problems: string[] = [];
  const known = capNames();
  const needOf = (field: string) => (c.contract.needs as Record<string, string>)[field];

  // Parts: each drawing has some, and says why where a part is not in it.
  for (const [name, part] of Object.entries(c.parts)) {
    const has = part.drawings ?? drawings;
    for (const d of has)
      if (!drawings.includes(d)) problems.push(`${where}: part \`${name}\` names drawing \`${d}\``);
    for (const d of drawings.filter((d) => !has.includes(d)))
      if (!part.none?.[d])
        problems.push(`${where}: part \`${name}\` is not in ${d}, and says no \`none\` reason`);
    for (const d of drawings.filter((d) => has.includes(d)))
      if (part.none?.[d])
        problems.push(
          `${where}: part \`${name}\` is in ${d} and also has a \`none\` reason for it`,
        );
  }
  // A drawing with no part is allowed when each part says why (the check above): the host draws
  // it itself, as the graphical clients draw an image. A component with no parts draws nothing.
  if (Object.keys(c.parts).length === 0) problems.push(`${where}: the component has no parts`);

  // Fields: every one belongs to a feature, and a gated one to a feature that needs what it needs.
  const covered = new Set<string>();
  const ids = new Set<string>();
  for (const f of c.features) {
    if (ids.has(f.id)) problems.push(`${where}: duplicate feature id \`${f.id}\``);
    ids.add(f.id);
    for (const n of f.needs ?? []) {
      const cap = n.split(":", 1)[0] ?? "";
      if (!known.has(cap))
        problems.push(`${where}: feature \`${f.id}\` needs unknown capability \`${cap}\``);
    }
    for (const field of f.fields ?? []) {
      if (!c.contract.fields.includes(field)) {
        problems.push(
          `${where}: feature \`${f.id}\` covers \`${field}\`, which is not a model field`,
        );
        continue;
      }
      covered.add(field);
      const need = needOf(field);
      if (need && !f.needs?.includes(need as never))
        problems.push(
          `${where}: feature \`${f.id}\` covers \`${field}\`, which needs \`${need}\`, and does not list it, so its answers would say yes where the host cannot`,
        );
    }
  }
  for (const field of c.contract.fields) {
    if (covered.has(field)) continue;
    const need = needOf(field);
    problems.push(
      need
        ? `${where}: capability-gated field \`${field}\` (needs \`${need}\`) belongs to no feature`
        : `${where}: model field \`${field}\` belongs to no feature`,
    );
  }
  for (const field of Object.keys(c.contract.needs))
    if (!c.contract.fields.includes(field))
      problems.push(`${where}: \`${field}\` has a need but is not a model field`);

  // Stories: data, the component's own, and drawn somewhere because a feature names them.
  const seen = new Set<string>();
  for (const s of stories) {
    const id = `${s.component}/${s.state}`;
    if (seen.has(id)) problems.push(`${where}: duplicate story \`${id}\``);
    seen.add(id);
    if (s.component !== c.id) problems.push(`${where}: story \`${id}\` is another component's`);
    if (!isPlain(s))
      problems.push(`${where}: story \`${id}\` is not plain data (a function or a class)`);
    if (drawnOn(c, id).length === 0)
      problems.push(`${where}: story \`${id}\` is drawn on no surface: no feature names it`);
  }
  for (const f of c.features) {
    if (!f.story) {
      problems.push(`${where}: feature \`${f.id}\` names no story`);
      continue;
    }
    if (!seen.has(f.story))
      problems.push(
        `${where}: feature \`${f.id}\` names story \`${f.story}\`, which does not exist`,
      );
  }
  return problems;
}

/** `COMPONENTS.md`'s rows for a component of schema 2: the answers, as the old table had them. */
export const featureSupport = (f: FeatureV2) => answers(f);

export type ViewModel = (model: never, surface: Surface) => unknown;

/**
 * A story's view model on all five surfaces, surfaces with the same decisions grouped: the
 * snapshot that is the parity check across the surfaces. Runs without mounting anything.
 * @param view `<component>/src/model.ts`'s `view(model, surface)`: pure, plain data out.
 */
export function modelSnapshot(story: Story, view: (model: never, surface: Surface) => unknown) {
  const byView = new Map<string, Surface[]>();
  const views = new Map<string, unknown>();
  for (const s of surfaceNames) {
    const v = view(story.model as never, s);
    const key = JSON.stringify(v);
    byView.set(key, [...(byView.get(key) ?? []), s]);
    views.set(key, v);
  }
  return Object.fromEntries(
    [...byView].map(([key, group]) => [group.join(", "), views.get(key)]),
  ) as Record<string, unknown>;
}

/** The snapshot as the file holds it: JSON, one story per file, stable to read in a diff. */
export const modelSnapshotText = (story: Story, view: ViewModel) =>
  `${JSON.stringify(modelSnapshot(story, view), null, 2)}\n`;

export type { CapName };
