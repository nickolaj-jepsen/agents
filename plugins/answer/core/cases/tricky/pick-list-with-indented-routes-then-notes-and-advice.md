---
about: A numbered list of ideas where each bold title is followed by an indented description and a short effort-and-route sentence, then plain bullets and an advice line.
shape: picks 1[build*build] 2[build*build] 3[build*build] 4[build*build] 5[build*build] 6[build,/grill-me*/grill-me] 7[build,/brainstorm*/brainstorm]
tail: "- Some of the code that makes the \"Add…\" fires on its own, and the fix is it: look in `views/` or `part-list/` where the form it opens.\n- I didn't change the sort order. It was lifted from the old view, a one-off file with shared state code (the rows are not all reset), so that needs to change.\n- A \"quick add\" row or a two-step form would need to go in a no-op path via `add`. The `add` call goes through the same hook in `list.ts`. Both are fine for now; the rest wait.\n\nStart with 1: it fixes a real bug and it is a small change. It starts with an `if` on the `row` in `list.add()`, with a call to `render` in `list`."
---
7 ideas, saved to `~/.shop/notes/jobs/bench/order-parts-by-brand-day/ideas.md`

1. **Open parts, and make the order form's "Add…" do more**
   "Add…" runs `addRow()` but skips the stock, so the list does little. Fix it with Open parts, one tab, per job and brand, and bind a key on a row open it.
   Small, build it.
2. **Show only the bike's tag in each row**
   On a wide screen (the one the mechanic uses), the tag, bin and brand show a "name" row; only the stock line shows "qty".
   Small, build it.
3. **A loan-bike tag on each job: size, frame, due date**
   You can add the size, and tag a bike "(loan)" that can be matched with the due date.
   Small, build it.
4. **Align the supplier list's price with the shop rate**
   In cases where the price and tax are both shown on the order line, which `price.ts`'s parser and loop doesn't handle.
   Small to medium, build it.
5. **Jump to a job's notes from the list**
   Show a `[done/open]` tag or a rider's question in a row with a flag on the job.
   Small, build it.
6. **A single view for parts and orders**
   `views/stock.ts` uses this as a tab, but the shop's layout is split, the loans and `part-list tab` each differ.
   Medium, grill first.
7. **Warn a mechanic when the stock runs low on a part**
   `low stock list` would open on the part row where the bar is, as the shop's wall chart does.
   Large, brainstorm first.

- Some of the code that makes the "Add…" fires on its own, and the fix is it: look in `views/` or `part-list/` where the form it opens.
- I didn't change the sort order. It was lifted from the old view, a one-off file with shared state code (the rows are not all reset), so that needs to change.
- A "quick add" row or a two-step form would need to go in a no-op path via `add`. The `add` call goes through the same hook in `list.ts`. Both are fine for now; the rest wait.

Start with 1: it fixes a real bug and it is a small change. It starts with an `if` on the `row` in `list.add()`, with a call to `render` in `list`.
