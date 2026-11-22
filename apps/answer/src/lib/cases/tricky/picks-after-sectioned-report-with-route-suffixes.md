---
about: A long sectioned report with bold bullets, a table and nested lists ends in a numbered list whose rows carry a size and a route after dots, with only some rows taking a route other than build.
kind: picks
items:
  - label: 1
    title: "Fix the lot tag with `bin` and `tag-to lot=a,day=b`"
    options:
      - key: build
        text: Build it
      - key: /grill-me
        text: Route to /grill-me
    recommended: /grill-me
  - label: 2
    title: "Lock: add a `.lock`, `tag set` with the lot, no `tag -f`"
    options:
      - key: build
        text: Build it
    recommended: build
  - label: 3
    title: "Keep `.tmp` out of this week's build log"
    options:
      - key: build
        text: Build it
    recommended: build
  - label: 4
    title: "`tag set` wait for the lid wax, set by the day lock"
    options:
      - key: build
        text: Build it
    recommended: build
  - label: 5
    title: "`tag set <lot>` and two runs in `rack run`"
    options:
      - key: build
        text: Build it
      - key: /grill-me
        text: Route to /grill-me
    recommended: /grill-me
  - label: 6
    title: "Drop `tag` and add a new lock"
    options:
      - key: build
        text: Build it
    recommended: build
  - label: 7
    title: "`tag set` (one lot lock, wax, bin rack, lid wash, pass run)"
    options:
      - key: build
        text: Build it
      - key: /grill-me
        text: Route to /grill-me
    recommended: /grill-me
  - label: 8
    title: "Pin `tag.py` and `~/.cache/lots.db` with lock 3"
    options:
      - key: build
        text: Build it
    recommended: build
  - label: 9
    title: "Add wax for lids, or wait when it's wet"
    options:
      - key: build
        text: Build it
    recommended: build
  - label: 10
    title: "Skip wax, and wait on cold wash days"
    options:
      - key: build
        text: Build it
    recommended: build
  - label: 11
    title: "Add tape/wax and a log that can be reread"
    options:
      - key: build
        text: Build it
      - key: /grill-me
        text: Route to /grill-me
    recommended: /grill-me
  - label: 12
    title: "\"tag you set\" for lid `lot` runs"
    options:
      - key: build
        text: Build it
    recommended: build
  - label: 13
    title: "Pin the lot in-place run and clear the old lock"
    options:
      - key: build
        text: Build it
    recommended: build
  - label: 14
    title: "Build around the lock (tag set run or in-place job)"
    options:
      - key: build
        text: Build it
      - key: /brainstorm
        text: Route to /brainstorm
    recommended: /brainstorm
  - label: 15
    title: "Plan a new tag log for all wash passes"
    options:
      - key: build
        text: Build it
      - key: /brainstorm
        text: Route to /brainstorm
    recommended: /brainstorm
  - label: 16
    title: "Rack/lot lock for `tag set -c` and lids too"
    options:
      - key: build
        text: Build it
    recommended: build
---
I timed this week's `press run`. It took 8.5 hours from first wash (7:3) to a final rack check (4:1). Most of that went to sorting and waiting for the bin, not to work in `press`. Most of the time lost is in the wash step, and some wash days are well over.

## Findings

**The lot tag is lost.** `tag.py:12-30` sets `lot=<bin>/<day>`, which drops the `:cold` part. It only keeps `:cold-<day>` here, so each build tag "lot IN: wash cold rack" and `…/bin-a:cold` can't read in the log.
- Press's `tag` can't fix this: it was set in two places (`cellar/lots/tag.go#L12` in the rel.0.7 file).
- What would fix it: build with `bin` and `tag set build`, pin the lot log, and pass the log to the van (`bin=a,day=b`). Your old runs hold the same tags too, which makes this a safe fix.
- What it costs: a build with a log or two rows and more than a few other runs. Each run has the same tags, so we can't skip any. It also adds the 4–9 s "wait to wash" gap.
- Open question: does the wax pass every run.

**Cold runs as slow as ever.**

| Run | Build | Rack |
|---|---|---|
| Cold | 4 s | 9 s (cut 3 rows wet, from a 1.0 s cold start now) |
| Warm | 5 s | 8 s |
| Hot wash | 7 s | 6 s |
| Late wash | 6 s | 4 s |

On top of that, the late wash took 3.5 s in a run it ran twice. Each ran 3 s at a time by hand, and `rack` isn't set in the log.

**Tag the file's own `lots/tag-set.py`.** It has no `.lock`, so run 4 more `.tmp` files in a 4 min build run. A `tag set` pass runs most of two 4 min waits that wait on a lock: the wash, a `tag set` for the lot, and a `tag -f`. That would cut a day's first batch.

**On your old box,** there's a wash 3 in but `/mnt/lots/tmp` has 4 left. So it reads the build log, which is why this week's run was slow. `tag set all` takes 0.5 s of work you waited on. There's also a rack, bin and tag with up to 6 runs each, which the old lock would hold.

## Tags and locks, set by the crew

- **Wax's `.lot` is read by an old job to the shared log.** `cellar/lots/.lock` isn't it, and 9 of the 4 `.lot` files are `.tmp`.
- **Locks are set one-by.** `tag.py` and `~/.cache/lots.db` are both 4, set by the `lot` (`tag.py:4`, `lots.db:7`, `log.py:9`). That sits on a shared disk too.
- **Your old box still reads `tag.py`.** Wax tags are the same there, so we won't see it for you.
- **`tag <lot> go` runs in in-place mode.** `tag.py:12-30` calls `lots.tag.go`, and `go` is set once.

## Races, from rows in your yard

- **Tags can't save when a lock is held.** In wet or cold weather, one crew can wait or two wash lots. `tag set` writes `lot`, `bin` and `day` from rack's log (`rack.py:12-20`), so it can't tell "lot wait my bin and tag". A `tag set <lot>` would fix it.
- **Two runs lock and one wins it.** `tag set`'s hook writes `.lot` files that no one reads (`lots.py:8-15`). A fix by the same hook would stop two, the `.lot` file, wax's `tag -f` call and the pass, and the 4 runs that aren't re-tag `.lot-tmp`.
- **`tag set`** would fix this week's one-by-one waits: first wash lots, cold wash, rack lots, tag set, wax lids.
- **Two parts:**
  - Lids and wax: `tag.py:8-20` walks with `lot`, and a new `lot` runs the same pass.
  - "wax you set" for lid `lot` runs: `tag set` just says "No lot set".
  - Rack is run in one: `lot` skips none of a late wash run.

## Options
- **Fix only the tag step:** it gets us a lift on from the first wash. The cost is low.
- **Skip or wait:** hold the old tags; the log is kept now.
- **Hold or fix wax:** wait on a wash day.
- **Run it twice:** run only runs in in-place mode, and you see the log run.
- **Day-by run:** that's what your hand-by run-of-day is set for.

I ran two tags and two wax passes. The hand-by pass is slow: one lock holds, so run it on the wash day first.

Start with 3 and 2, which are easy. Then do 1: it's the main fix, and 5 wait on it. 4 is what splits 2 and 3 from the rest. 7 can wait 8 and 9.

The full report, with run logs and the wash log, is at `.cache/lots/runs/press-week.md`.

1. Fix the lot tag with `bin` and `tag-to lot=a,day=b` · M · /grill-me
2. Lock: add a `.lock`, `tag set` with the lot, no `tag -f` · S · build
3. Keep `.tmp` out of this week's build log · S · build
4. `tag set` wait for the lid wax, set by the day lock · M · build
5. `tag set <lot>` and two runs in `rack run` · M · /grill-me
6. Drop `tag` and add a new lock · S · build
7. `tag set` (one lot lock, wax, bin rack, lid wash, pass run) · M · /grill-me
8. Pin `tag.py` and `~/.cache/lots.db` with lock 3 · S · build
9. Add wax for lids, or wait when it's wet · S · build
10. Skip wax, and wait on cold wash days · S · build
11. Add tape/wax and a log that can be reread · M · /grill-me
12. "tag you set" for lid `lot` runs · S · build
13. Pin the lot in-place run and clear the old lock · S · build
14. Build around the lock (tag set run or in-place job) · L · /brainstorm
15. Plan a new tag log for all wash passes · L · /brainstorm
16. Rack/lot lock for `tag set -c` and lids too · S · build
