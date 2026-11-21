---
about: A table of rows with an ellipsis cell comes before a single bold question whose answers are nested bullets that carry no letters and no recommendation.
kind: round
items:
  - label: Q5
---
That fixes it up, and it hides a gap in what #4 shows:

| Block | Rows | `variety` | Grafted `rootstock` |
|---|---|---|---|
| Nord | 8 | **412** (kept trees) | "Elm.Hill A/S", "Pip.Crate A/S", … (6 buyers in "A/S") |
| Syd | 3 | low | "Lund.Pick", … |
| NO | 4 | 31 40 12 | "Fjell.no", … |

Block 8 rows were mapped to Frøken A & Pip Co A/S's rows, so there are **three rows of ripe fruit**, not nine. "Elm.Hill A/S" isn't a grower. The Nord and NO rows need to be mapped to two lots each.

As filed, a pallet row's label reads: "Nord", `pallet` "Elm.Hill A/S", `crate` full, `lot` Frøken A&Pip Co A/S. That makes a tally that can't balance, fed by a count that skips two pallets here.

**Q5: Should the grafted rows be tagged one by one, like this?**

- **`rootstock` has two kinds**: a small list set by hand in `trees.csv`, used by the key `M*` rule. It's not wrong, but this list has a gap.
  - Row: `block` "Bjørn A & Sons Ltd A/S", `age` old, **no `graft`**, yet the tree *is* grafted.
  - Elm/NO: `block` = the north/west plot, `rows`/`trees` as given, `yield` = low.
- **`cultivar`** lists the cold-store row for the old plot ("Elm.Hill"), or is empty.
- A fix for later, not this pass: the "A/S" in `pip.crate.cfg` can also split two rows (Nord, the Syd). Same rule would apply.

Do you agree with this reading? I also found the **same gap of the Nord (10-14) and NO (31 40 12) rows**. Do you want both, or should I keep one in the main sheet (Nord / Sørøya)?
