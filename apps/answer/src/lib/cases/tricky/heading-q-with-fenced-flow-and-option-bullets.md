---
about: A bulleted preamble full of inline code, then a heading that carries the question, a fenced diagram of arrows, lettered bold option bullets with one marked recommended, a restated recommendation and a closing question.
kind: round
items:
  - label: Q1
    title: How should we log, and what does "clean" mean?
    options:
      - key: A
        text: One log, and it is a table.
        detail: "`log.csv` holds the rows; the code reads `ok / hold lane / retest for ph / ph + cl` as a single question, and the log is 3–5 rows per tank. One tank, one lane, and the tests that would change (the set: ph, free cl, temp, flow) stay small."
      - key: B
        text: "Two logs:"
        detail: '`ph-log` (hourly) + `cl-log` (every two hours). Look at "does this pass the check", but log + log, and the staff will log in turn.'
      - key: C
        text: One log, but the checks are hand-run
        detail: ("run `ph read hold`, then `cl --test`"). Slow, but that's how staff work — it re-reads from the old sheet each time.
      - key: D
        text: No log.
        detail: Rows would grow, they stay, and you'd have to track which tank to test.
    recommended: A
    reason: 'A, with one rule I want to keep while it runs the pool: the check is run *at the tank*, not read from the sheet or from the till, so there is one place the rota and the staff see "this tank has a problem". The log is `ph-cl` (with `ph-cl hold` to test, such as a retest).'
---
On the first question, what I found by checking (so I don't miss what the log can hold):

- `rota/` is the one folder that holds **shifts** (`/rota:shift-list`), **lane holds** (`~/.pool/holds`, with the shared copy in `.pool-sync/`), **bookings** and **levels** (`pool.log-ph-cl.csv`). So the `ph.csv` is the only file that isn't mirrored.
- A *lane* hold is real, not just "a booking": it has `hold.ph.log/id`, the guard has `rota`, and the swap has `slot`. So "lane/hold" is real — what is left to settle is whether it is the right one (first question).
- `chem` 2.0 is out, and this one **has a flag on the `chlorine log` field** for the pool test (`log/ph.md`). So the real fix is a mix of an older log, not a new one.

## Q1 — How should we log, and what does "clean" mean?

My read of what you want is one log with two checks:

```
reading (pH and chlorine from each tank)
  → check log (free chlorine every two hours)
  → pass: all tanks clear logged signed + staff initials
  → warn: low ph | high cl | low flow | cl + ph
  → auto-close lane (ph under limit, chlorine low)
```

Options:

- **A. One log, and it is a table (recommended).** `log.csv` holds the rows; the code reads `ok / hold lane / retest for ph / ph + cl` as a single question, and the log is 3–5 rows per tank. One tank, one lane, and the tests that would change (the set: ph, free cl, temp, flow) stay small.
- **B. Two logs:** `ph-log` (hourly) + `cl-log` (every two hours). Look at "does this pass the check", but log + log, and the staff will log in turn.
- **C. One log, but the checks are hand-run** ("run `ph read hold`, then `cl --test`"). Slow, but that's how staff work — it re-reads from the old sheet each time.
- **D. No log.** Rows would grow, they stay, and you'd have to track which tank to test.

Recommendation: **A**, with one rule I want to keep while it runs the pool: the check is run *at the tank*, not read from the sheet or from the till, so there is one place the rota and the staff see "this tank has a problem". The log is `ph-cl` (with `ph-cl hold` to test, such as a retest).

Does A match your view, or do you want the real one (at close) so the day's last test and log can be read with it in one place the rota?
