# @agents/actions

The checkout actions a plugin can offer without owning them: `/open`, `/git` and `/notes` are each registered once, by the plugin that draws the experience (`apps/open` and `apps/notes`), and a plugin that draws a control for one invokes that command instead of registering a second copy.

```ts
import { ACTIONS, invokeAction, type ActionHost } from "@agents/actions/invoke.ts";
```

`src/invoke.ts` is pure: `invokeAction(host, "open")` gives the command to pi's own command path and returns whether any plugin registered it, so a caller can say which control has nothing behind it. `host` is the whole seam: `getCommands()`, pi's list of what is registered, and `sendUserMessage(text, { expandPromptTemplates: true })`, the dispatch that runs a registered extension command.

Dispatch is a command and not a prompt: no turn starts, no prompt is sent, and the draft in the prompt is left as it is, which is what a person clicking a control beside their half-written prompt expects. `ACTIONS` is the list of names in the contract; a name that only a prompt template or a skill has is refused rather than expanded into a prompt to the model.

The experience behind the name is the owner's: the sheet, its rows, the apps `open.json` allows and the words a missing app gets are the same whether the command was typed or a control invoked it, so the two cannot drift. A plugin whose frame offers these controls registers no command of its own, so the ownership of a name does not depend on which plugin loaded first.

```bash
pnpm turbo run test --filter=@agents/actions   # the specs
```

An app's `src/lib` may not import it (the lint rule there allows only the kit and `@agents/launch`); a half that has pi calls it, and the driver's `assets/invoke-action.ts` stands in for such a caller in the screen tests of `apps/open` and `apps/notes`.
