---
about: Bold numbered paragraph steps where half are instructions with a code fence and half are questions, followed by a bullet pair and a bold-led guess. A list that mixes instructions with questions is prose.
kind: none
---
Both lane sheets are stale, so I need you to run one more. To read the pool's live log I can read `cron` here, but the rota needs to be pulled in.

**1. Run this** (read-only: it lists the pool's rota):
```
! grep -r lanes /var/pool | sed -n '/^lane:/,/^guard:/p'
```
I'm looking for `lane-hold-id`, `guard-swap-key` and `pool-chem-log`.

**2. Paste the lane list into the chat** and ping me. I'll then run `lane check` (read-only) to see how many lanes are held in it.

**3. What does the "full lane" label show?** Paste a few rows. For example:
- "You are in lane four…"
- "Lane open due to cover, the lane rope is down…"
- "Rota slot taken for Saturday"
- a list of lanes that are held

A few lines each is enough.

**4. If it is held, what next?**
- Is the lane held now?
- Can you see the rota?
- Do you mean lane (am or pm), and which rota first?

Take this path:
- **Fast path:** the lane stays open, run for the first two guards. The rota works the rest on the day shift and swap.
- **Safe path:** the full rota. Once the lane is held, and this adds no extra cover.
- **My guess** may be it works: it doesn't say *what* is held for (swim or class), and it gives no sign that a hold was set. I'll note that in the rota so it's next to the list.

Once we've seen it, **drop the rota file in**. That is all.
