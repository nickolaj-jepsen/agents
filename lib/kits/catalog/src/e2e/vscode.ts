/**
 * The kit's graphical stories in VS Code's Claude Code extension: a scenario per story that has a
 * `gui.tsx` drawing, named `<component>/<state>`, each drawn by the dev-only catalogue mod. Like the
 * other `vscode.scenarios.ts` it has no snapshots; it is for looking
 * (`pnpm drive goto kit-prose prose/blocks --harness vscode --size 420x800`) and for the site's
 * pictures (`nix run .#media -- record kit-prose --harness vscode`). Each kit package plays the
 * stories of its own components (`<package>/e2e/vscode.scenarios.ts`).
 */
import { fileURLToPath } from "node:url";
import { vscodeScenarios, type VscodeScenario } from "@agents/drive/lib/vscode-scenario.ts";
import { storyId, stories } from "../claude/stories.ts";

/** The catalogue mod, built (`pnpm turbo run build`). */
const catalog = fileURLToPath(new URL("../../dist", import.meta.url));

/** One stubbed reply, so the session starts: it starts on the first prompt or slash command. */
const reply = { turns: [{ text: "Hello from the stub." }] };

/** The scenarios of `plugin` (`kit-<name>`): the graphical stories whose component `owns` says is its. */
export const vscodeKitScenarios = (plugin: string, owns: (component: string) => boolean) =>
  vscodeScenarios({
    plugin,
    harness: "vscode",
    scenarios: Object.fromEntries(
      stories
        .filter((s) => s.gui && owns(s.component))
        .map((s): [string, VscodeScenario] => [
          storyId(s),
          {
            about: s.about,
            // The catalogue mod alone, in place of the checkout's plugins.
            start: { ...reply, plugins: [], env: { CLAUDE_CODE_PLUGIN_DIRS: catalog } },
            steps: [
              { type: `/kit ${s.component} ${s.state}` },
              { press: "Enter" },
              { wait: `Drew ${storyId(s)}`, timeout: 30_000 },
            ],
          },
        ]),
    ),
  });
