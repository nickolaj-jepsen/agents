---
about: Two numbered runs introduced by bold code-formatted headings with arrows, followed by bullet sections of explanation, ending with a single offer question.
shape: none
---
`lanes` is now done and `rota` and `till`, all three clean. On the rota of the week, `lane sort` and `lane hold:sat` pass, and guard swaps and café on lane. In the old rota, 3 of the part-time slots are covered by the same guard. That is odd or intended.

**`lanes`: 4 slots → 9**
1. A lane is a strip with a rope, which a guard, a club and a lane rope can share.
2. Lane use is checked at the desk and then at the gate.
3. A swim ticket is a day pass, sold from the till and the web page.
4. Rota and shift swap the same lane too, with the one-at-a-time rule.
5. Open and close the lane gate before and after the swim when asked.
6. Lane rope.
7. A pH test reads the pool log in a small way, at the start and at the end.
8. Chlorine.
9. The late shift and the part-time rota.

**`rota`: 2 slots → 6**
1. The rota: a guard's `shift` is set when a swim is open.
2. The dose, pH and flow are all checked in one; heat, `cl` and `ph` are fixed.
3. The pool's `open`/`on`/`off` and `hold`.
4. `lane hold swap`.
5. Café.
6. The late slot.

**How I tested this**
- Each lane rule is tied to the rota it maps to. Those that build on one another (lane holds and guard swaps) were run 7 times more than an old rule.
- Café sales, rota swaps, are run with the old log.
- Each chemistry test's log has the dose before it ran.
- The lane files are tied to a shift log, read from the rota files.

**What you should check**
- **The lane rule from last week had to be fixed.** It used the old `lock` and `hold`, which `swap` reads. I set `lock` and `hold.set()` the same `rota` option as well. Each part reads the lane's slot, and I wrote a one-line patch to it. This is in the old file, with the dose and the till in the same one.
- **New test for `till`:** the test the café `till` runs for the late shift.
- **What I saw:** in the old docs, the lane rows and "A lane is a strip" are not right. The rows say "a rope or a lane gate". The rota and `rota-log.md` no longer depend on them.
- **A note on my setup:** `rota.md` is on in your shared notes, so my first run used your `pool-*` rules. My first run to test also used the `pool-*`, `lane-hold` and `hold-and-do-all-*` rules. None of those are set on the new files.

I wrote the notes so you can read the new rules: `lane-hold` and `swim-slot` (the two I used), `rota-swap` and `till-log` (old ones), and `ph-log`. Want me to run them?
