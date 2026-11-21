---
about: A bold header announcing open questions above a numbered list whose items are already answered with nested bullets, followed by a to-do bullet list and a closing lone offer.
shape: none
---
The plan is set and the rota ready, but I'd like one more look first. Rules on lanes (`am`, `pm`, `late`, `early`, `split`, `swap`) hang on the same swim the rota day. Note that the rota rows that match that case. Lanes are part of the rota, so "a lane that is held" is only a label, and rota would change the rule. I put a lane hold on the café as the first step, with the till.

This was read only. I made no new plan, rota edits, and left no lane or till. The notes are in the shared notes folder at `.pool/ops/notes/11-21-26-lane-hold/rota.md`.

**The four open questions:**

1. **How lanes map to the rota:** one lane. Rota, café and lane hold are mapped as a `slot` and held on it when a guard swaps. That is only 3 lines, and it is clear that. Swim, class, lap, laps and staff swaps are not.
   - Lanes appear to be a row on the rota's grid, not per guard, so we need a key.
   - An hour's `slot` is also a kind of key: `slot` gives the lane an id it doesn't open. We can build on it.
2. **Lane rope and `gate`:** yes, a lane works as an entry key for what it holds. It shows only the state of lanes. A guard's `gate.open()` sets the lane whether open or not; only the rota says.
   - In the log, the rota has the lane open, and swim classes are shown too.
   - Read the lane rows of the guard's `shift` log, or call `shift`.
3. **Café hours:** the till rota is fixed. Opening and close both use `till`, and the café tab sets the same hours. Run the log only when the pool is open; a day-end log is a small cost.
   - Café hours stay only on Sat and Sun, and hold the same rule. So "stay open in it" would also fit weekdays, not just Sat and Sun.
   - Staff and the day-off rota should show no change.
4. **Log the dose:** it sets the dose, and only that dose. Each swim in a day is set by the tank's log, so a log has to count as pass or the fail case for an hour that isn't logged.
   - The "test at a time" rule is set once a day. It has to go to the log, or mark one more swim it at noon.

**Still to do:**
- **Test log:** there's one gap, the log the chemist didn't write, and it hides one's own. A new test, `log add:ph cl`, would show it.
- **Rota note:** I'd add "a swim lane held on a rota line" to the plan's lane list. It comes from the plan but isn't final.

The rest came from `rota/lanes`, which is where the lane hold, `rota` and guard-swap the code goes to. I told the tool to leave `rota` (`ph`) there; it's at `~/pool/log/rota-ph`.

The next is a step-by-step build log, tied with the tests and the till log. Shall I proceed as planned, run the lane rota first, or write the rota out for you to review?
