---
about: A single question whose bold title holds a trailing lean sentence, with lettered bold-marker bullets, then a separate bold recommendation line naming one option and a bare closing word.
shape: round Q10[ABC*C]
---
**Q10. Step 4: the first-pass tally (rows, bins, lots) read-in `[crop].toml` and `rows.py`. I'd keep this one too.**

The `tally()` call the sum of all bins stored in each row, and the bin list shows what we bring the press ("pick, sort, wash (up to six bins) and crates… most of one and two, all day"). In turn the sum used the first pass. That gives a tidy total, and that total is the real one, not a tally-up. The count only shifts when a row's bin moves.

Our team can't skip the tally. The best way is a small one: the press crew gets a `lot` tag that run is `sum(4, bins)`, with the bins set by `bin-id` from each row. That fixes the row's count, keeps the bin-by sums, and adds a tag column on each row.

- **(a)** Add to the bin sheet so the totals match.
- **(b)** Keep the old sum as an opt flag (`--old-sum`, etc.) and warn once. That is too much for the first pass.
- **(c)** Drop it, as is: the old sum stays here, and a tag shows as soon as you look at the row.

**My recommendation: (c).** This path is small, safe, and based on bins, and the cost is a one-line check with no new flags. If you're weighing the press day first, do (a) then.

Agree?
