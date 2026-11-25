# @agents/launch

The apps a checkout, a file or a link can be handed to: a built-in table for Linux and macOS, the person's `open.json` laid over it, and the command each app is started with.

```ts
import { choices, preferred, readConfig } from "@agents/launch/apps.ts";
```

`src/apps.ts` is pure: it takes the text of `open.json` and the output of a probe, and returns data. A harness does the I/O. It reads the file (`configPath` says where), runs `probeArgv(apps)` and gives its output to `readProbe`, then starts what `choices(apps, installed, target)` returns behind `DETACH`. An app may carry `ready`, arguments that ask its found command whether it is set up (`xdg-terminal-exec --print-id` for the Linux terminal): `readyChecks(apps, installed)` lists the commands to run, and the harness passes the ids of those that did not exit 0 as `installed.unready`, so `choices` gives them `unavailable: "not set up"`. `unready` is optional: a caller that runs no checks is unchanged. Ids that a menu's own rows and controls use (`isReservedId`) are refused for an app of `open.json`. A Claude mod and a pi extension share one table that way, and `apps/open` is the first user. The format of `open.json` is in [its README](../../../apps/open/README.md).

```bash
pnpm turbo run test --filter=@agents/launch   # the specs
```

An app's `src/lib` may import it; the lint rule in `.oxlintrc.json` allows `@agents/launch` and the kit packages and nothing else from outside the lib.
