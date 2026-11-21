---
about: A report of statements, a table and bullet findings that ends with a numbered list of open items, where only some of the items read as questions.
kind: round
items:
  - label: 1
  - label: 2
  - label: 3
---
I drafted a patch for the `quote expiry job` rule and ran it on bikehub.no. The results are a mixed bag, and the specs don't cover it.

## Summary

I replayed all quotes against the `staging` data set. The 4 workshop jobs had no labour line, so only the 2 remaining rows are listed:

| Job | Status | Rows past the cutoff |
|---|---|---|
| Brake bleed (front rear) | open | **3 `expired` / `ttl_days = 14`** |
| Gear tune (week 4) | with the cutoff | 12 |
| Wheel true (rear hub) | with the cutoff | 7 |

With the cutoff, every quote now stays valid for 14 days instead of the old 0.2 hold factor, which lets the front desk chase customers to confirm. Moving the hold into a setting is a small change, but the date logic still clashes with the spare parts lead time, so I'm leaving it.

## The changes I made this week

- **`quote_expiry_days`:** read once as long as the quote stays open, and the desk still has to wait for a stock check. The specs cover this.
- **`calendar`:** the shared hours table. At 8:00 on bikehub.no, with no walk-ins, the desk shows closed (`slot 1` and two). That is 2 hours in 3 days. It clashes with holiday.json now, so my guess is a stale cache; I can't prove it yet. The specs don't agree with this.
- **Order lead for the 3-day window:** match with the supplier, check `parts/lead` v 2.x now. So 3 days is enough for stock, and not a hard rule.

## The scope

It's checked in as `quotes` on branch `fix/quote-expiry-job`, in the worktree `../bike-shop-api`. Nothing is left open.

- **`hold: 7` and a `lead 2`.** The hold window uses the 7-day rule from the old 14-day rule, so the desk sees the stock sooner. The quote total is higher than the estimate.
- **`/loans` as a `route` only**, with `/fleet` kept for staff.
- **Hours stored in the shop's `hours.yml`**, so `$(today)` is used in for the schedule. I tried 2 ways and kept the simple one.

## Status of bikehub.no

- The fleet page is still stale. Nobody has touched it yet, and fixing it this week would remove the old bikes.
- The tag `1.4.0-2` is live.
- The shop owner has signed off here.

## Still open

1. **Rebook and open the slot?** Ask it now, or leave it until the wheel order lands. That is the desk's call (the loan bike list), so it won't need a new rule.
2. **hours.json edits:** decide on the rule for walk ins, and say what `shop/hours` should do when a day is closed, e.g. a bank holiday or later than 3 pm.
3. **Tyre stock:** wire `parts/tyres` and map to `sku`. stock.json has it too, so we need not make a new one. That leads back to a parts call, which means that stock is the only source of the count.
