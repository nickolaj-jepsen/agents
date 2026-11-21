---
about: A revised list where an earlier option is withdrawn so the lettered options start at B, preceded by unlettered bold bullets, and ends with a bare which-question.
shape: round Q1[BCD*B]
---
I've gone over the idea. Option A costs more than I thought when I read it.

Pairing only works if the loan bikes live in one shared list, and some of your jobs hang on the same bike at a time:

- **per-bike** is set up by how the shop's tag file maps to each bike's slot (`tags.json` in `fleet/loan-bikes/tags.json`). With one shared tag, all the bikes match, so "mark this bike" from the desk would clash.
- **`per-bay`** keys the shop's rack by listing the bike that is free. With two jobs it would read the bay's slot and pick the first free, so bay+slot would open in the same one.
- **`by-tag`** adds a prompt to the front desk's list. On a busy week that would hide what you want open.

On top of that the rule you asked a day-by-day check for in the first round. There's also a risk with bikes that are part of day-by-day loans, so `per-bay`, the free-slot pick and the loan sheet would all need to point to `shop +fleet-id`.

So I'd rather pick a simpler option:

- **B. Bay tags (my recommendation).** It keeps every tag clear. `/open bay` and the desk open a new tab and set it to the bay the bike's tag is in, the way `fleet-tag --open` does. If that bay is in the shop's front area (`bay-front-main-1`), it shows up as a tab. Nothing more needed. Per-bay would pull in tags from your old rack, so the sheet would get a new column for each.
- **C. A tab.** Rack-by with all new tags. Tag-by and `by-tag` would then need work to match the rack, which doesn't help much.
- **D. Leave it as is now.**

Which do you want?
