---
about: A long explanation with a code fence and a nested numbered list of statements is followed by a bold question label whose answer is a numbered list of restated statements and a closing recommendation.
kind: round
items:
  - label: Q1
    title: Shall we go with this?
    body: |-
      1. Loan-lock desk is kept as is, and rules are re-read live.
      2. `rota.ts` is the desk's own.
      3. Each desk shares its lists.
      4. `tag` has a hard rule for sale and reads `tag` from it.
    recommended: true
    reason: 'yes. Points 1 and 2 are what we call "the safe path for desk and shelf" mean, and 3 and 4 are the low-risk ones.'
    unlabelled: true
---
It works out like this: a card after an item hold is just a copy-on request, which has 6 steps left. So, an entry with `reads: [loan.md, rota.md]` reads like this:

```text
call run({ path: "/lend/fix", note: "..." })
  → read all loan's due dates, set desk's rule = use own rule
  → desk.ts    = use the desk's own (but not the rota's own)
  → rota.ts = use the loan's rule (two copies)
  → cmd: sync + load all rows.ts, sort, no ledger-run --out list.ts
  → one more step: run all (read, sort, check due dates and fines now)
```

The new desk is part of the shelf's list. The old desk has a fixed copy, only the rest of that card's data.

What matters is that two kinds of reads fall out of this: the loan list and the rota list. That sets up:

1. **Lending is a read lock.** Rules are fixed, but the desk can read them all, so it acts as if staff read from a shelf.
   - Rules named `desk` and `shelf` can each make the desk re-read of the list's own rows:
     - a card is the same one with a tag in a sale list;
     - a list that sits under `sale/shelf/<id>/` in the main tree;
     - a card that has the same name.
   - A page that has a `hold` slot can at best set a flag for the same row.
2. **`rota.ts` is the desk's own.** For an entry that's set once only. The desk can edit, as needed. It has a rule that's local.
3. **Each desk has shared state.** Each reads `hold.ts` at two points than the list was in the old tree. It doesn't see one, so `desk` is a loose word. It reads a card at a time (the same one), so an in-memory copy is safe.
4. **Tags are safe by design, as for sale stock.**
   - Only lists with a `tag` are hand-fed, so `tag` is read for each, and you get the way an entry should look.
   - `list.ts` from an entry is the same rule for `tags: ["kids"]`.
   - `scope: own` on the desk still limits what can be seen at once. The set comes from the shelf, so `tag` should name a path (e.g. `sale/<id>/`) that has the stock, and should read `tag` from it.

This is part of the plan. An item's tag is set to the desk's own, so a copy can lag. The desk gets the stock with the shelf's own as is.

**Q. Shall we go with this?**
1. Loan-lock desk is kept as is, and rules are re-read live.
2. `rota.ts` is the desk's own.
3. Each desk shares its lists.
4. `tag` has a hard rule for sale and reads `tag` from it.

> **Recommended:** yes. Points 1 and 2 are what we call "the safe path for desk and shelf" mean, and 3 and 4 are the low-risk ones.
