---
about: Seven bold numbered findings with nested bullets and bold side headings precede a single lettered question whose label sits in bold, with a lean in the first and last options.
kind: round
items:
  - label: Q3
    options: [A, B, C]
    recommended: A
---
The survey is done. It ran on 9 plots and found 7 gaps, of which 3 need work and 4 are minor. Here is what to know for each:

1. **No row map for the east orchard.** Pruning was recorded on paper, sheets, notes, photos and a ledger.
   - Pre-pick counts (tree rows, the Open day sheet; late picks; blossom; frost; scab) are loose and bare for Nord. Most of them are in one hand or another, and some are lost to damp.
   - The count sheet (`eastblock.csv` line-by-line) is clean and dated and lists. It has no stamp or total, and it hides a tally gap.
2. **Two rows share one tag, a mix that is the cider and the eating is mixed.** This holds for `Bramley` and the rows near plot 1.1. A press log shows the same fruit on the same day.
3. **Windfalls can't count as the harvest.** I checked this in last year's pick sheets: it holds a gain only when the bin weight is still logged. A strict cut would not count windfalls, so they have to be listed apart from the pressed total. That keeps the count clean for juice as the yield.
4. **Press yield drifts or sags without notice.** The week-by-week sums show that apples did not ripen on 14-10-21 and lose a clean pass. That ought to be flagged, as in #2.
5. **The three cellars agree on a ratio.** Last year's bottling moves to a tank mix, bottle, label as one lot, and as set in `lotkey` rules. Cellar is the tidy side, but it's a `0.2.0.beta` sheet with no sign-off row. Three checks (weight, brix, acid, pH) so a fresh tally can be built, but don't treat it as the final word.
6. **Shop-side prices are fixed, but nobody checks the margin.** Each has an `sku` code pulled from the till list, shelf, `price` with `rrp` ("only valid on bottle size"), and question-and-answer sheets. No sign that anyone chose which of them wins. The only fix would be a new sheet, built from `price`.
7. **Delivery's round is drawn by hand.** It lists the stops in the order the van goes, with notes and a slot for a late order. This one is fine for now.

**The first one is a gap.** A rule keeps the row map, and every other fix depends on it. It lists tree rows in each block, which is what we do with new plots.

**Fixes:**
- Count sheets on paper, photo, map, or ledger/log-book. This is the first step for the map and the tally.
- It's quick work for one pass on rows that fail. Gaps are listed by `row-id` and gaps made by hand.

The raw survey is at `/home/orchard/survey-24/…/east/rows.csv`.

Question 3 is still open, and the lean is (a). Row-by and the row-map fix both come from the first finding.

**Question 3: Who tags the rows, and in which sheet does it live?**

- **(a) Only the farm hand, from tags shown by you and read by me (my recommendation).** Stored in one sheet.
- **(b) Both the team and the hand in the shop sheet.** This adds a second tag and a second count.
- **(c) Row-by-row, by hand or by script from the map.** I'd skip this.
