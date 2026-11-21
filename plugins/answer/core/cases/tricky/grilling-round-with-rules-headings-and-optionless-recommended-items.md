---
about: A long grilling round of many bold question items under headings, separated by rules, where some items have lettered options and a recommendation line and others have only a recommendation.
kind: round
items:
  - label: Q33
    options: [A, B, C]
    recommended: A
  - label: Q34
    options: [A, B]
    recommended: A
  - label: Q35
    options: [A, B]
    recommended: A
  - label: Q36
    options: [A, B, C]
    recommended: A
  - label: Q37
    recommended: true
  - label: Q38
    options: [A, B]
    recommended: A
  - label: Q39
    recommended: true
  - label: Q40
    recommended: true
  - label: Q41
    options: [A, B]
    recommended: A
  - label: Q42
    options: [A, B]
    recommended: A
  - label: Q43
    recommended: true
  - label: Q44
    recommended: true
  - label: Q45
    recommended: true
  - label: Q46
    recommended: true
  - label: Q47
    options: [A, B]
    recommended: A
---
Nine open questions on the fleet booking tool. What I found from the code: `book --hold` is set only by the rider's tag type (`rider.tag.type`, `bike.tag.size`), so it skips the `hold` flag. The rest are open.

## `loans`

**Q33. Do the front-rear pair `lend(a)` and `lend(b)` match?**

```ts
bike: { front: lend(a), rear: lend(b), tag: bay }
```

- **A.** `front` and `rear`. `front` is the main wheel of a bike's `lend()`, and rear is a spare part too.
- **B.** `bike` and `rack`. Both no tag, but are sold and "held" on an open row to the same job.
- **C.** `slot` and `bay`.

> **Recommended:** A. It fits the loan rules, and it keeps the code short.

---

**Q34. Does an idle (bare) tag open with no options, and does a tag that sets options hold them back at once?**

A bike tag with no options via `tag` is valid. A tag that allows options at `open`.

- **A.** It starts with `{}`. A bike tag that has `{}` can't be an open one, and a tag that needs options gives it `tag` and tells it so.
- **B.** Options are set at the rack, `{ opts: [a, { b }] }`. Each bike tag with its options are then set at once.

> **Recommended:** A. Bike tags that have no hold can't set any of options, and A stops that from happening.

---

**Q35. Does a rack's `tag` hold the bike's own size, or a flag that tells which?**

- **A.** The first one. A bay is set once, and each tag is set once and for `bay`, so the bay-by-bay rule would keep the same one. `@shop/fleet` can read both and match.
- **B.** The second, as a wheel set. Each is set and given by size, and doesn't hold that, so `@shop/fleet` has a way.

> **Recommended:** A. The rack has a fixed way to make it work, and sets `tag` at that point.

---

**Q36. Does the shop's bay get a spare key when a bike goes out, by the same rule for each?**

- **A.** The desk has an idea of open bikes set with tags. Each one `tag(id, bay)` from the bay list and sets the key spec. The shop's flag is `held`.
- **B.** `tag` calls an own `key()`, as an extra step, and the desk sees what no tag would.
- **C.** Mixed: A for the rack, B for the rest.

> **Recommended:** A. The desk and the `open` call share a rule, so `key()` would only add more.

---

**Q37. Does a bike wait in the shop queue, then fit, then ship?**

> **Recommended:** Yes. An order's tag was set once, so any job with no tag fails, and a bike that waits in an empty bay has the part still on order.

## `tag-as-job`

**Q38. Is "bike is on loan now" part of a rider's state, and not a bike flag?**

- **A.** A job's state has a `status()` view. The desk reads it with the same rule that sets the tag row.
- **B.** A new tag set, `loan`, plus `due` and `late`.

> **Recommended:** A. What a bike is and the state of it live in one row, and a flag that lies hurts.

---

**Q39. Does a loan bike show up as open, with no sign of any rider?**

> **Recommended:** Yes. It is set on the job, the desk can see a `rider` field with open, and `rider` tells what keeps it open. A bike can show `rider` if it is held now.

---

**Q40. Count the part's stock on an order that ships with two items?**

> **Recommended:** Yes. `stock` can only be counted with each part, which makes the count much simpler for the shop.

## `rack-bay`

**Q41. With no bay tag, does a rack's slot work as `bay` does, so a tag can read it?**

- **A.** It works on the rack bay's slot. The desk can read it, and that is all we need.
- **B.** The tag can wait for the bike.

> **Recommended:** A. Under B, `tag` would fire in `bay` mode, which is the part we need to skip.

---

**Q42. Does `tag` run on an in-store job, with `bay` no longer set?**

- **A.** Yes. Read from the bay the job names.
- **B.** Fall back to `tag` if empty, and warn the desk.

> **Recommended:** A, on the basis that a rider's tag works as one. I'd keep that as the shop's first rule and switch to B otherwise.

## `fees`

**Q43. Are late fees per-bike only in this round, with the rest of the fee sheet shown only?**

A fee rule that is built from one row. An edit to the rate's size can't change the shop's rate, and the sheet must show a rider's fee as a row.

> **Recommended:** Yes. A flat-rate fee can read a `fees.ts` file, to be used with the shop rates today.

---

**Q44. Ship the fee sheet now, as a `fees.ts` file?**

> **Recommended:** Yes. It lets us ship the feature to catch a bug, and starts by adding a rule that checks the rate first.

---

**Q45. Does each row work with a tag or a bay for a bike row: a rider, a job, an order and an item?**

> **Recommended:** Yes, with `tags: [bike]` for now. An order reads it for an item's flag, an item doesn't. It fits your Q14 rule and not a new one.

---

**Q46. Is it a fair way to treat each tag as an order, with `tag` as a way to show it?**

> **Recommended:** Yes. Write "a bike on the rack bay", and a bike tag can be set up as usual.

---

**Q47. Do loan bikes get tags?**

This is the one I can't settle: it hangs on what your loan rules are. A rental shop's loan sheet is the one rule, and once a 3 is set as a flag.

- **A.** Yes, with a `tag.ts` flag.
- **B.** In, as a bike tag `tag` (so one per rack), for loans only.

> **Recommended:** A, as a one-off bike is what you meet in the shop when you ask for loans.
