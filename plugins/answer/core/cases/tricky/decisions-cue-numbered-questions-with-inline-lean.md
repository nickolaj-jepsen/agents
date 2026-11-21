---
about: A numbered list under a bold decisions heading holds unlabelled yes-or-no questions with the lean written inline in each item and no options, after a long report with bold bullet findings.
kind: round
items:
  - label: 1
    recommended: true
  - label: 2
    recommended: true
  - label: 3
    recommended: true
tail: "Still waiting on you from before: the `tag` run, the lot log, the wax row, and tape stock. If you agree with all, I'll write it up in `lots/bin-tag.md`."
---
Pressing works fine, but my sweet-or-sharp blend is too close to call. I read the sheet on `bin-log-v2` and `press-run-day-1` and two more. The lots show how it goes:

- **Yield on Bramley: low.** Juice runs show no gain at all, as last year.
- **Pick on the slope: `east` and west.** A new row is a short run tagged as `/`, so the crew can walk to it at any time, with no gap at all. Rows don't ripen, so each one has its own date.
- **Bin lids too: wax, tape and tag.** Each bin lid is sealed with `tag lot -`, and a wet lid wouldn't hold this week's tag, so a new tag won't stick. Some crews also use `tag -i`, and re-tag runs only help the old ones. Both the old tag, tape and wax `lot` in the log.

At a busy time, a press is run by the crew for the day to clear the shed. It still has two jobs, but it takes up one full cycle. Hand-fed runs fit only for a day with no rain.

So the fix would be an optional `bin.tag?(lot, row, day, crew)`, plus `ids`, with hand-fed runs as the base and a shared log that holds a `tag` for a given lot. Most of those `tag` calls are one-run's work, so a run-by pass in bulk would save most of it, but that's an extra job and nothing hangs on it.

**What this shows from my last run:**
- **`tag` should stay, not move.** Like a lid, an old tag's wax would hold your own old lot.
- **The log is too long.** Lids, wax and tape make a mess, so a new crew can read the lot. It takes a bit more than two weeks, such as wax, tape and ties.
- **Two rows are still open.** A spare row has the flag too, so we pull the old log from `lots`.

**Decisions for you:**
1. Should we keep the old `tag` log, with hand-fed runs as the base? I recommend yes.
2. Should wax tags be read-only by default, so a crew can't edit it? I recommend yes. Think a lot that sits on a shelf and sells on Monday.
3. If `tag` is set on one or two, should it fall back to hand-fed runs from the old log? I recommend yes, with an extra note the crew that sets the old `tag`.

Still waiting on you from before: the `tag` run, the lot log, the wax row, and tape stock. If you agree with all, I'll write it up in `lots/bin-tag.md`.
