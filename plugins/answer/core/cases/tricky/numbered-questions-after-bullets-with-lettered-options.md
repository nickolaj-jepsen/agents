---
about: Bulleted findings lead into bold numbered questions, where one has a recommendation line above lettered options with the recommended one marked inline, and another has only a recommendation line.
kind: round
items:
  - label: 1
    title: What's on the rota?
    body: Is it a fix for the desk team who you (a rule you don't want, a late slip, a lost card), or is this a tool for the sale crew?
  - label: 2
    title: How far should the new tag go?
    body: My view is that the test run is key here, not just the page's own tests.
    options:
      - key: A
        text: Today's tag row only, no new list.
      - key: B
        text: Tags + rows + labels.
      - key: C
        text: B, and a link to `@lib/sale-tag-kit` too (or a fork) is next.
    recommended: B
    reason: the three files are in scope — one row, `row.ts` (card tab / card row), and `tag.ts` for tags.
  - label: 3
    title: Whom is it for?
    body: You at the front desk with the rota, or also staff that have no tools (kids, the helpers, a lone aide on a van)?
    recommended: true
    reason: both, but the desk view is what most users see.
tail: Tell me just 1 and 2 if 3 is easy.
---
Reading the plan and checking the three desk files: `src/loan-desk.ts`, `src/loan-desk/ui/{hold,renew,fine}.ts`, and `web/src/lib/desk/ui/{card/form.ts,list.ts,row.ts,tab/bar.ts}`.

What the catalogue ↔ loan list does here today, and how it is wider than the old one:

- **Catalogue.** It adds a field as one entry (`isbn` key). There's `shelf` as `Shelf { kind: {row, bay, tier, side, face} }` and *skip the last*, so the desk can read the row and fill it. It then lets Open/closed — the lamp stamps this one as the desk spot. The list does fire an on-load hook (`init`), so this is fine, but only hook-first (the list reads the shelf, not fills it).
- **Reserve the stack.** `hold` maps to `queue` (3 slots) on the day the card is shown, no more.
- **Page row.** `row.ts` has `list-item row hold`/`tab` (a bit like what we want) and shows the list with a note.
- **Timer.** The page wait's long 2 s (`wait.ts`) to fill the list, with one cache set as the guard.
- **Print.** Print only has the *sale tag* list. The text of the tag, the price and tag's id sits only in the tag file; a clerk who is at the desk or on the floor can see none of it.

Now I want your take on the plan:

**1. What's on the rota?** Is it a fix for the desk team who you (a rule you don't want, a late slip, a lost card), or is this a tool for the sale crew?

**2. How far should the new tag go?** My view is that the test run is key here, not just the page's own tests.
> **Recommended:** the three files are in scope — one row, `row.ts` (card tab / card row), and `tag.ts` for tags.
- **A.** Today's tag row only, no new list.
- **B.** Tags + rows + labels (recommended).
- **C.** B, and a link to `@lib/sale-tag-kit` too (or a fork) is next.

**3. Whom is it for?** You at the front desk with the rota, or also staff that have no tools (kids, the helpers, a lone aide on a van)?
> **Recommended:** both, but the desk view is what most users see.

Tell me just 1 and 2 if 3 is easy.
