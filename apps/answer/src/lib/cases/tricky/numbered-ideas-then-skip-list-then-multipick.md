---
about: A numbered list of ideas, each with long inline code and prose, followed by a bulleted skip list and a closing line that recommends several numbers at once before the question.
kind: round
items:
  - label: Q1
    title: Which do you want?
    options:
      - key: 1
        text: Skip the sweep when nobody's booked.
        detail: "Your rota grid has a slot per lane. So when an `.ics` export lands and lists it as held, the sweep fires anyway and waits on the gate so long. The log can show why: there's an `.ics` at the pool root but `holds` isn't read by the rota loader. In that case the gate would trip with a \"stale\" flag. This costs 4 lines to add (~/pool rota 2 in ~/ops) and needs no schema."
      - key: 2
        text: Skip the sweep when you're in a closed session.
        detail: "`lane hold` has no flag, and guard-on-your-shift lets it fire a blank sweep, so you can't tell you're in the lock. Check 9 `lane hold` and 3 `rota swap` entries. It can read `$SHIFT` when the first lane opens and write `⤵1` in the log for each rota swap. It's a small patch, and it also gates `swap` calls from lane one, hand-then-lock and pairs."
      - key: 3
        text: Warn that the lane gets busy for the pool.
        detail: There's no guard for it in the rota, but there does look like 9/9 lanes held. A `retest` flag could hold the clock for pairs that take 4 s or more over the dose cycle. You could run 3 swims `pool-ph` check, pick the `slot`, `pool build` or `just retest`. If you pick one, there's a lag on the day and this can be seen.
      - key: 4
        text: Batch by shift pair.
        detail: |-
          When the rota has two guards on a lane, the merge rule is this:
          - day-night pair swaps, for example `rota/am…pm`
          - hold the early cover first when the roster is short, such as split-shift or part-time cover

          It only matters when cover is thin.
      - key: 5
        text: Add a lane picker.
        detail: "`⇡`/`⇣` are only as good as your lane map. A picker that sits on `lanes` could widen the grid, or add a small step, when the lane count is lower than a full row. Then \"in use\" tags stay in sync. This idea is optional; I'd only add it if you've asked guards by hand."
      - key: 6
        text: Small nudge for the late rota.
        detail: It runs only on Sundays. Swap and set-to-the-rota logic would clear it fast when you close the late shift. It's a small win.
    recommended: [1, 2, 6]
    reason: I recommend 1, 2 and 6 as the small wins. They're safe and they cost almost nothing. Item 3 depends on how often you swim in winter.
    unlabelled: true
---
Six are the ones I think are worth it, ranked first. The rest came from the rota sheet and the café till log:

1. **Skip the sweep when nobody's booked.** Your rota grid has a slot per lane. So when an `.ics` export lands and lists it as held, the sweep fires anyway and waits on the gate so long. The log can show why: there's an `.ics` at the pool root but `holds` isn't read by the rota loader. In that case the gate would trip with a "stale" flag. This costs 4 lines to add (~/pool rota 2 in ~/ops) and needs no schema.

2. **Skip the sweep when you're in a closed session.** `lane hold` has no flag, and guard-on-your-shift lets it fire a blank sweep, so you can't tell you're in the lock. Check 9 `lane hold` and 3 `rota swap` entries. It can read `$SHIFT` when the first lane opens and write `⤵1` in the log for each rota swap. It's a small patch, and it also gates `swap` calls from lane one, hand-then-lock and pairs.

3. **Warn that the lane gets busy for the pool.** There's no guard for it in the rota, but there does look like 9/9 lanes held. A `retest` flag could hold the clock for pairs that take 4 s or more over the dose cycle. You could run 3 swims `pool-ph` check, pick the `slot`, `pool build` or `just retest`. If you pick one, there's a lag on the day and this can be seen.

4. **Batch by shift pair.** When the rota has two guards on a lane, the merge rule is this:
   - day-night pair swaps, for example `rota/am…pm`
   - hold the early cover first when the roster is short, such as split-shift or part-time cover
   
   It only matters when cover is thin.

5. **Add a lane picker.** `⇡`/`⇣` are only as good as your lane map. A picker that sits on `lanes` could widen the grid, or add a small step, when the lane count is lower than a full row. Then "in use" tags stay in sync. This idea is optional; I'd only add it if you've asked guards by hand.

6. **Small nudge for the late rota.** It runs only on Sundays. Swap and set-to-the-rota logic would clear it fast when you close the late shift. It's a small win.

I'd skip these:
- **Lane rope audit:** 4 lanes only, but the rest stay the same.
- **A lock/unlock chime:** you have `.pool/chime/off` and `chime on` set, so there's no extra work to add.
- **Towels:** it's not in your rota.
- **A tab in the café:** you know that already.
- **Heat-map view:** it adds colour, and you have a plain table.

I recommend 1, 2 and 6 as the small wins. They're safe and they cost almost nothing. Item 3 depends on how often you swim in winter. Which do you want?
