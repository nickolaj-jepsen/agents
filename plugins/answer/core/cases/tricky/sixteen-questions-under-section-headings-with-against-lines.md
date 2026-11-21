---
about: A long multi-question round with section headings, italic rationale lines, rules between questions, options sometimes placed before and sometimes after the rationale, and a recommendation line under each.
kind: round
items:
  - label: Q1
    recommended: true
  - label: Q2
    options: [A, B, C]
    recommended: A
  - label: Q3
    recommended: true
  - label: Q4
    options: [A, B, C]
    recommended: A
  - label: Q5
    options: [A, B]
    recommended: A
  - label: Q6
    options: [A, B, C, D]
    recommended: A
---
Ideas and pick lists are set for sale in this first round. Each question also has the default with my recommendation, so you can say yes if you don't want to. Two things I noticed in my first pass:
- `/sale` was a loan tab and you've left it in two places.
- A list that only shows the stock can't tell your own rota.
- The same desk is shared with two others.

## Part 1: sort what ships first

**Q1. Add a short "who are you asking" note to `desk.ts`?**

Show a name, tag, date or title, so what shelf has it. Read `src/lib/desk/{lend,hold}` first, then `src/rota`, then the page `ui/desk` or `ui/rota` rows.

*Why:* the new row was one of the desk's `desk.ts` and still works with a clerk, so a late slip does not break.

> **Recommended:** Yes. It's the main row, and Q3 adds a new row to fix it up.

---

**Q2. Use `docs/lib/desk.md` as the base, and sort the new rows back to the file?**

- **A.** Keep the file as it is, no new rows.
- **B.** Add a rule row by hand ("desk row: new row").
- **C.** Pull an open row from `docs/rows`.

*Why A:* `desk.md` is read by staff, not by tools, so it's safe to read from a shelf.

> **Recommended:** A. Plus: both fix the plan and still run well, so a late row isn't the thing. B would also go late on one more.

---

**Q3. Add a short "book sale" note to `ui/sale.ts`?**

Show who the host, the day set with one shelf, and say it's open or why not. "Sale: open day" is fine.

*Why:* it's ideal for lists that need no lock, such as `loose-box`.

> **Recommended:** Yes. It's the only check that tells us you can sort what sale is live.

---

**Q4. When do the desk rows run that sync?**

There are 3 rows now: 4 shelves, two `rota/`, and 3 tags.

- **A.** When a card is set up, as the first step of using it.
- **B.** Sync every 3 days.
- **C.** Sale days only.

*Why A:* `rota.ts` and `desk-lock.ts` are large and can be read all at once then.

> **Recommended:** A. You want to set up new-card rows, and look at the whole desk as it stands. Option B would age badly.

## Part 2: sort that new work

**Q5. Move the shared tags in `~/lib/desk/rules`, and set new ones in `rules.md`?**

*Why:* it has two desk's own (3 weeks so far) and `/sale`, read on one from this list.

- **A.** Share the shared tags with two desks only.
- **B.** Add a read-only copy.

> **Recommended:** A. The tag has no rule on any desk in this plan, since a duplicate would go stale.

---

**Q6. How should the sign-in run?**

- **A.** Round-by-round lists based on my recommendation, as in this round, with one ask for the major decisions once the list is full.
- **B.** The one-question card only.
- **C.** The desk list only.
- **D.** An open round with no list.

*Why A:* Quick checks and no full grill. 80% of your picks are a plain A or yes, so most of it will go fast.

> **Recommended:** A. The point in the one-by-one grill is what lets that run so far. You also ask for a rest stop in the same round.
