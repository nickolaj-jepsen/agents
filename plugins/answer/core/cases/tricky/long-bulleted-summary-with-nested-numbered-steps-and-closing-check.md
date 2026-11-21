---
about: A long bold-sectioned bulleted summary with a nested numbered list and many inline code spans ends with a confirmation question plus an offer, which stays prose.
kind: none
---
That covers the plan. Here's what the desk gets, for you to see what I built on top of it.

**The plan**
- **Why:** the front desk needs one way to renew, with the rule in one place for the whole branch. A member can still ask a clerk for help with the form.
- **Files:** rules for `desk.ts`, one row for each desk only, plus `desk-lock` (on its own as `lib/desk-lock`, not the rota). `desk-lock` is tied to the desk's `.lib/rc` after the load. Rows from that load; seed and re-seed rows at `boot`.
- **Flag:** a new `lend` key was added for `desk-lock`, set in `conf`.
- **Runs when:**
  1. The desk's page runs on a `shelf/*` route.
  2. Staff open the page `rota.ts`.
  3. An old `list.ts` was left in the card's own tree and has `tag` for the sale.
  4. A new row has a tag set to the desk and runs with `hold` and `lend`. The first one wins, and the other one drops it.
  5. The loan ran fine but late.
  6. The list is not in use.
  7. The card list is marked with `mode: "shared"`.
- **Tests:** unit, desk and rota with `vitest`. No mocks.

**Desk (`desk-lock`)**
- **Scope:** a lock row in the sale desk, not a new one. `lend` rows, steps 0–2, and step 3 can wait on the rota, which I'll note.
- **Row sizes:** 4 shelves and 8 bins of books, 0 pages of rota, 0 fees.
- **Path:** the rows live in a `desk.ts/lend` file, set to the `desk`'s root. Each row in the file is small.
- **Shared desk:** a very small list kept on the sale day rota, plus the desks' own. A page can use it with the `mode: "shared"` flag; in-desk is the rule.
- **Access:** the rows live in a single file here, with a read-only role for the desk and a write-only role for the rota. Both roles are set, and old ones stay.
- **Role tag:** `desk:lend-lock-id` sets the desk row. It has a limit, and an item on its own can see only rows with the same `lib-*`. It has no run-time use on this.

**Sale-day (`sale`, walk-in desk)**
- **Scope:** each row is paired with the desk it was read from. The desk keeps only the rows that match, with a key for each one, so it no longer reads `lend`.
- **Build:** the build step reads the rota, sets the `date` key, and the stock of what a build reads from. It sets the last step to the last one.
- **New row-ids:** `desk`, `desk-id`, and row-tag' lock and `rota` map.
- **Host:** the sale row is set up to `http://sale-api:8080`.
- **Seed:** set by hand from your shell. `seed.ts` sets all the rows.

**Rota**
- **Mode:** in sale-day, on one `desk-lock` row only, with rows as a `rota/day` key and `tag:` set on each row.
- **Rule:** `rota.ts` has a tag in one place and one list only to run all the slots for the day.
- **Where:** on your desk.

**Check the rota**
- **The new row:** rules were set for the ones that use `rota.ts` only. `lend` has it on the desk and on its own. There's `desk-id` for all the options.
- **Also new:** `rota.ts` with tags for `shelf/*` rows, a set of walk-in slots too, and sale-day rows set.

Do we have a shared understanding? If so, should I save this to `desk-notes.md`?
