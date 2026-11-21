---
about: Answered questions in prose, then one bold question set between rules with a blockquote recommendation, followed by a long plan of headings and bullets and a closing check.
kind: round
items:
  - label: Q61
    recommended: true
tail: |-
  That covers the set. Here is what we have, for you to check or tell me I got wrong.

  ## Step 1: `loan-core` (small, low risk)

  - **Part rows on jobs.** `jobs: { rows: { sku, qty? } }`, stored on the job, read by the quote tool's parser, shown in the table by tag.
  - **Hold rules.** Set by default at the shop level; the job gets it as a copy. This applies to loan-bike jobs only, not to what a rider wants. Done by hand.
  - **`reserve({ … })`** for a `bike` with a due date at open, set from the sheet and as `--with`.
  - **Add tag help,** as the main way.
  - **`fleet.ts`:** `bike`, `tag`, `slot`, `due`.
  - **`lend()` now takes the lead from the sheet,** later, with the old way still working.
  - **`tags: [bike]`** as a list.
  - **A per-bike file, `.bike.yml`,** read by `lend`.
  - **Dry-run in `shop quote --dry`:** a mechanic's note and the totals show it, with an own `<job>/notes.md` for a large job.
  - **`open()` on the desk,** like `bike.size()` and `question.ask()`.

  ## Step 2: `shop-desk` (medium)

  - `book({ bike, slot, day, rider })`, set by an open job's `rider`.
  - It reads all of the first open and sets the slot or lets it wait for the call; seen in `open({ day })`, that is held at `book.ts`.
  - A job row with a given `slot` flag is kept.

  ## Step 3: `fleet-sync` (large, run with a flag)

  - A new tab is made up of a rack's `slots`: with a tag set, or with `rack(a)`.
  - `rack` (`front`, `rear`, more) and `stand` (like `lift()`, `lower()`, `lock now`). Rack and stand are fixed; slots are free.
  - `desk` is the main one (`open`, `close`, `hold`, and `swap`); close, hold and swap are done first of all in code.
  - Calls are small: `open()` is first, `close()` is next, the rest wait. `open()` on a held bike lets the desk work too.
  - A new check at a `lock()` that sets it up and clears, or on `free()`.
  - `rack bay list` has its own.
  - Left out: an extra bay row, and spare slots.

  ## Step 4: `loan-and-return` (after `fleet-sync`)

  - `fleet/loan/return.ts`: the pair as do and don't with the old log sheet. It sets the one-line rule, "bike is `loaned` for a day or a week, not a year", and `due(day)` for late.
  - A short list of loan cases: a late bike, a rider's name, tag not found, a lost key.
  - Run a tiny test (what you want to try first) and then pick a few: busy day, the 7-day rule, no tag for a bike, same as above.
  - `fleet/loan/return-check.ts` as the hand-off, with the code in `loan.ts`.
  - Set up in the shop; `shop loan list --all` shows a list that starts at one; `shop tag` has a `tags.json` for it.

  ## Tests-first

  - **Setup:** edit to tidy (`rack init`, `bay`, `tag`, and more, `loans.ts`, `hold`).
  - **Do steps 1 and 2:** test-first with bike data, `fleet/test/data/` with the loan sheet, `tag` in place of `bay`, bike-by-bike one at a time.
  - **Then step 3:** `rack` runs the check at build time and moves it to `build` and a small `fix` file; the `-f` flag, `lock` and the old way go.

  ## Parked

  Left in `rack` (Q5), per-bike rows kept in the sheet, the `lock` mode, `free` tab, tag file and `due`.

  ## Not covered

  - How the desk works, stores and sends to a rider's phone, and so the size of step 3.
  - Why a new tag can show a bike's name with what `bike` is.
  - When a mechanic can see what the rack row is open, and what a job does.
  - Rows and tags for each can be set via the old bike's `tag`.

  Have we hit a shared understanding? If yes, I'll write the plan out to `~/shop/plans/loans/` in the `plan.md` file, as set in Q25, with the tests-first step as the first part of `loan-and-return`.
---
**Q59, an open `claim()`:** I think it is safe now, given the new rule. The rule only holds when a bike is a loan. It does not cover a bike that sits in the shop and waits for it, such as one that needs an order of a part or a fix. `fleet.hold()` takes the part and tags "held for this job" when it sits:

- It reads the tag name and sets the job row too.
- The shop log has it.
- It is safe when stock is held in it.

So the rule is: the way to use it can only be a tag, and the desk can see so the loan list is full.

**Q60, tag rules:** I ran it twice, and it has no gap. Still, if an order of an order is in the middle of a job in it is set with `hold`. The two do not need that, so the first `quote()` and the `order()` are on the same footing. Safe for the shop to ship.

---

**Q61. Should `lend()` be a call on the front desk only after the check?**

> **Recommended:** yes, as written.

---

That covers the set. Here is what we have, for you to check or tell me I got wrong.

## Step 1: `loan-core` (small, low risk)

- **Part rows on jobs.** `jobs: { rows: { sku, qty? } }`, stored on the job, read by the quote tool's parser, shown in the table by tag.
- **Hold rules.** Set by default at the shop level; the job gets it as a copy. This applies to loan-bike jobs only, not to what a rider wants. Done by hand.
- **`reserve({ … })`** for a `bike` with a due date at open, set from the sheet and as `--with`.
- **Add tag help,** as the main way.
- **`fleet.ts`:** `bike`, `tag`, `slot`, `due`.
- **`lend()` now takes the lead from the sheet,** later, with the old way still working.
- **`tags: [bike]`** as a list.
- **A per-bike file, `.bike.yml`,** read by `lend`.
- **Dry-run in `shop quote --dry`:** a mechanic's note and the totals show it, with an own `<job>/notes.md` for a large job.
- **`open()` on the desk,** like `bike.size()` and `question.ask()`.

## Step 2: `shop-desk` (medium)

- `book({ bike, slot, day, rider })`, set by an open job's `rider`.
- It reads all of the first open and sets the slot or lets it wait for the call; seen in `open({ day })`, that is held at `book.ts`.
- A job row with a given `slot` flag is kept.

## Step 3: `fleet-sync` (large, run with a flag)

- A new tab is made up of a rack's `slots`: with a tag set, or with `rack(a)`.
- `rack` (`front`, `rear`, more) and `stand` (like `lift()`, `lower()`, `lock now`). Rack and stand are fixed; slots are free.
- `desk` is the main one (`open`, `close`, `hold`, and `swap`); close, hold and swap are done first of all in code.
- Calls are small: `open()` is first, `close()` is next, the rest wait. `open()` on a held bike lets the desk work too.
- A new check at a `lock()` that sets it up and clears, or on `free()`.
- `rack bay list` has its own.
- Left out: an extra bay row, and spare slots.

## Step 4: `loan-and-return` (after `fleet-sync`)

- `fleet/loan/return.ts`: the pair as do and don't with the old log sheet. It sets the one-line rule, "bike is `loaned` for a day or a week, not a year", and `due(day)` for late.
- A short list of loan cases: a late bike, a rider's name, tag not found, a lost key.
- Run a tiny test (what you want to try first) and then pick a few: busy day, the 7-day rule, no tag for a bike, same as above.
- `fleet/loan/return-check.ts` as the hand-off, with the code in `loan.ts`.
- Set up in the shop; `shop loan list --all` shows a list that starts at one; `shop tag` has a `tags.json` for it.

## Tests-first

- **Setup:** edit to tidy (`rack init`, `bay`, `tag`, and more, `loans.ts`, `hold`).
- **Do steps 1 and 2:** test-first with bike data, `fleet/test/data/` with the loan sheet, `tag` in place of `bay`, bike-by-bike one at a time.
- **Then step 3:** `rack` runs the check at build time and moves it to `build` and a small `fix` file; the `-f` flag, `lock` and the old way go.

## Parked

Left in `rack` (Q5), per-bike rows kept in the sheet, the `lock` mode, `free` tab, tag file and `due`.

## Not covered

- How the desk works, stores and sends to a rider's phone, and so the size of step 3.
- Why a new tag can show a bike's name with what `bike` is.
- When a mechanic can see what the rack row is open, and what a job does.
- Rows and tags for each can be set via the old bike's `tag`.

Have we hit a shared understanding? If yes, I'll write the plan out to `~/shop/plans/loans/` in the `plan.md` file, as set in Q25, with the tests-first step as the first part of `loan-and-return`.
