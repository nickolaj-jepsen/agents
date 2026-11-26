# @agents/launch

The apps a checkout, a file or a link can be handed to: a built-in table for Linux and macOS, the person's `open.json` laid over it, and the command each app is started with.

```ts
import { choices, preferred, readConfig } from "@agents/launch/apps.ts";
import { loadApps } from "@agents/launch/load.ts";
```

`src/apps.ts` is pure: it takes the text of `open.json` and the output of a probe, and returns data. A harness does the I/O. It reads the file (`configPath` says where) and starts what `choices(apps, installed, target)` returns behind `DETACH`.

`src/load.ts` owns the steps between, in one order for every user, so a menu and a hand-off load the apps the same way: `loadApps(host, times)` reads `open.json`, runs `probeArgv(apps)` and gives its output to `readProbe`, then runs `readyChecks(apps, installed)` and passes the ids that did not exit 0 as `installed.unready`. An app may carry `ready`, arguments that ask its found command whether it is set up (`xdg-terminal-exec --print-id` for the Linux terminal): one whose check fails, or that ran out of time, is in `installed.unready`, so `choices` gives it `unavailable: "not set up"`. `unready` is optional: a caller that runs no checks is unchanged.

`host` is the whole seam: `run(argv, timeoutMs)`, which resolves to a status and what the command printed, and `config()`. The probe gets `times.probeMs`, and each check `times.readyMs`; a caller that names none gets `LOAD_TIMES`, 3000 ms and 1500 ms. A harness that starts its commands with an options object wraps `run` in one line (as `apps/notes` does). What `config.problems` holds is the caller's to say: a menu's rows and a hand-off's notice word it differently.

Ids that a menu's own rows and controls use (`isReservedId`) are refused for an app of `open.json`. A Claude mod and a pi extension share one table that way, and `apps/open` and `apps/notes` are its users. The format of `open.json` is in [its README](../../../apps/open/README.md).

```bash
pnpm turbo run test --filter=@agents/launch   # the specs
```

An app's `src/lib` may import it; the lint rule in `.oxlintrc.json` allows `@agents/launch` and the kit packages and nothing else from outside the lib.
