---
about: A heading that names the question, two bold lettered options with sub-bullets and a recommendation, then a closing agree-question followed by bullet follow-ups.
shape: round Q8[AB*A]
---
I reviewed the fleet rules, and option A makes a small tweak to pricing:

- **Hire bikes need no deposit for most riders, and that's fine.** loans.csv lists the bikes only when loaned, and there's no row for returns. Day-to-day rows such as "bike / tag / date" are set to go on **the sheet**. No `deposit` field exists for it yet.
- **Prices only show a copy of the shop's rates.** `rates.json` is built from the supplier list each night. It doesn't show the day a part was bought, only "this rate's valid as of last night". For stock that's fine, but each quote row must say so.
- **Moving the stock is a bigger job than I thought.** An export that reads 3 files (`stock/bins/main.csv`) and the job runs with the nightly sync. A mechanic who wants to see the part live that day, should wait for the sync. Neither of these is free of the tally.

## Question 8: what should the shop's rule be to lend out loan bikes?

**A. Fixed fee, set by a clear rule (my recommendation).**
- Store a flat rate as `fee.loan.day`. You get a mix of day or week rates, and it works with the shop's `rates` (base + late fee), `hold` and `cap`, read from the config file.
- `late-fee` adds about ~5 minutes and takes no change to the form.
- The rate has no tax, so re-checking it is easy. Budget ½ day in the sheet, ~1 hour for `fee-calc`.

**B. Daily rate, billed by week.**
- Set a `rate.day.eur` on the bike, and `fee-calc` stays for it.
- Rates are flat, but riders who keep the bike *longer* than the week would pay for a refund or a credit. That's too much work for staff.

**On risk:** neither option can show that a rate was lost from the till, only that bikes weren't returned in. I'd add a flag to the loan: **fee when the bike `status` is later than 3 days out**, with a note so an owner can see why. Day-to-day rows come in to the sheet with a flag set.

Do you agree with A and that fee cap? Two small checks:
- Is the fee already shown in the form, and does the till point to it?
- Should this late rule be shipped as part of this change, or tracked as a ticket and a note that the shop agrees on?
