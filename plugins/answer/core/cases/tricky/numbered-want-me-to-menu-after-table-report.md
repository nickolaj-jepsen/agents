---
about: A report with a heading, a comparison table with an empty header cell, bold paragraphs and a closing lead-in followed by a numbered menu of actions.
kind: round
items:
  - label: Q1
    options: [1, 2, 3]
    unlabelled: true
---
Swapped it in — and the catch is that it doesn't roll any faster.

## Your test bike, front wheel, tyre pressure sweep

`bench.py --runs 3` (8 laps, rig warm), bench.py 0.6.0, same rig:

| | Stock tyre (psi) | Low-drag tyre (psi) |
|---|---|---|
| Rides | **12/12** | **12/12** |
| Tag | — | `low-drag` |
| Test laps | 40 | 40 |
| Rolling time | 52 | 50 (−3.4%) |
| Cadence | 71 rpm | 73 rpm |
| Notes | slow | quick |
| Weight | 0.8 kg | 9.0 kg (−2 g) |
| **Cost total** | 48 eur | **44 eur (−4 eur)** |

Run to run noise of 4 is well within the ×3 span your earlier runs showed, and a 2 rpm gap is noise as well. So the choice is a trade on weight and wear, and the 4 gain on the rig is **6 min** of the shop's 8-bike test run under a wet road.

Short read by-bike:

**The 0.6.0 tyre is fit to ride** — it still shows 12/12 in each rig your team ran (set up 2 × 3). No drift from the tape.

**The open question is cost: no wear data.** Take the tyre off the rim, check your ~1 mm margin like you did 9 (twice) — a fair test. The math is plain: at 0.5 mm per ride, the 1 ride you do is worth ~a tenth of a mm. A set is 6 mm.

## Where this leaves us

The setup is wired from the ground up: `tyre.cfg`, 5 bars, `low-drag` → live, i.e. bench.py 0.6.0. I left `low-drag.txt` out so it doesn't hide it.

Cost is the one wall — 8 riders left at 0%, and the plan is kept in `~/shop` for later. Want me to:

1. Compare `lowdrag.8-front-rear-new-set.csv` to the 9.0 batch?
2. Wire the loan rig so `/shop/rigs/bench/low-drag-set` is ready to run?
3. Or move on to week 4 tubeless, which is the run your whole team would then be on?
