# UI kit

Use the [component catalogue](catalog/COMPONENTS.md) to check what Claude Code and pi can draw. The [rendered catalogue](https://nickolaj-jepsen.github.io/agents/dev/) adds terminal screenshots and props; use the [layout reference](../skills/agent-plugin-dev/references/style.md) to pick a pattern.

## Edit the source

- **pi:** Import `kit/pi/ui.ts` by relative path. The shipped loader doesn't resolve tsconfig aliases.
- **Claude Code:** Edit `kit/claude/ui.tsx`, not a mod's copy. A packaged mod can't import outside its folder. Tests use `expectNative` from the copied `checks.tsx`.

```bash
just kit-sync            # update the checked-in Claude copies and shared story samples
just kit-sync docfix     # create the kit copy for a mod that doesn't already have one
just test                # check copies, component manifests, and unit tests
```

Claude types are only available after `just dev-setup`; check changes in a mod with `npx tsc -p plugins/<name>/claude` as well.

Use `buttonRow` for a pi footer that mixes clickable actions and keyboard-only hints. It returns the rendered rows and the hit ranges of the buttons. Keep a single row by dropping lower-priority hints, or let the row wrap.

## Add a component or story

1. Export the component from the applicable kit. Document props and non-obvious defaults on the exported types or parameters: the catalogue reads their JSDoc.
2. Add or update the [component manifest](catalog/components/). For each harness, name the export and the story that demonstrates each supported feature. Use the manifest's unsupported status and give the reason if the harness can't implement it.
3. Add matching `<component>/<state>` stories in [pi](catalog/pi/stories.ts) and [Claude](catalog/claude/stories.ts), plus their [scenarios](../e2e/kit/). Use the same [samples](catalog/samples.ts) and [sizes](../e2e/kit/sizes.ts) so the result can be compared.
4. Replay and inspect the changed story:

   ```bash
   E2E_PNG=1 just e2e kit   # compare snapshots and write pictures
   just catalog            # replay stories and regenerate crops and catalogue data
   ```

If the snapshot change is intended, accept it with `E2E_UPDATE=1 just e2e kit`. Commit the resulting snapshots and regenerated `catalog/COMPONENTS.md`. The site data and crops are generated, not committed. Use `npm run catalog -- --check` to validate the model without replaying, or `npm run catalog -- --no-shots` to rebuild from existing screenshots.
