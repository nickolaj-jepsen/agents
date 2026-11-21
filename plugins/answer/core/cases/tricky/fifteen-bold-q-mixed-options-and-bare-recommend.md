---
about: A long analysis with bullets and horizontal rules, followed by bold questions where some have lettered options and a recommendation, some have only a bare recommendation line, and one has a quoted draft and a bullet list between the question and its options, ending with a pointer to later questions.
kind: round
items:
  - label: Q1
    options: [A, B, C]
    recommended: A
  - label: Q2
    recommended: true
  - label: Q3
    options: [A, B]
    recommended: A
  - label: Q4
    options: [A, B]
    recommended: A
  - label: Q5
    options: [A, B, C]
    recommended: A
  - label: Q6
    recommended: true
tail: "Wait for the next round, then I will work on Q4 and Q12: the rota's lane list (a lane count of day two. late shift), and see the \"hold\" tag log."
---
Booking is live; here's what I did, then the first round of questions.

## What I found

**Why booking is slow.** `just lane-sync` runs it with the `rota/` folder as a base dir, so it has no built-in lock. Each run takes one lane; the rota just runs `lane hold build` and doesn't touch rope, ph-log, till-log, pump or flow. That's 4.9 staff hours: 3.4 hours of lane time and 1.5 hours of café time, give or take. Look at build time notes too: the rota is in the log, the lanes are fixed, and day cover from the rota. Two things:
- The lane rows and rota rows are both in the log, so the first-run pass hits the rota.
- A new rota would need a patch.

**Why there are no new rows.** The log was edited (`log.yml: "rota"`), but the rota was not. Only `lane` and `till` have a copy still.

**Lanes with no lock at all:** lane-one, lane-two, lane-five and lane-six, which are rota-only. Each was in the log, so we can keep a copy still. One has a rope cut and one has a lock in a drawer.

**My rule set, for your review:**
- `/lanes/` gets a 1, with the rota rows "ok".
- The rota file is about 5,4 rows with a mix of part-time lane slots.
- The rota marks "In use" as a lane flag, with one flag per lane for a swim hour.
- On the web page the guard's first line has the lane (pre-fill: "go to how the lane works" text).
- The lane rows sit on the rota grid as well.
- The "hold" tag on the lane map is the tool.
- On the rota tab, the late rows move the guard's slot, and the "swap shift" and the lane hold read as one line rather than as two.

---

**Q1. Should lanes be held in one block of time, with the rota files `lane-a` and `lane-b` kept apart?**

- **A.** One block in the rota, followed by a copy of the rows (`lane/`, `till/`, `log/`, `rota.csv`). A new rule runs the rota, and the lane rows sit on the rota build.
- **B.** A lane row held on rota and swap to an old `rota` file, which the build runs on. Each rota rests on a swap.
- **C.** Run both, but limit it to rota only.

> **Recommended:** A. It's the safe way, the lane rows are all set, and one block is enough for a guard rota. `lane/old/` would be kept from rota and till.

---

**Q2. Should `rota/old/swap.csv` go away (we need it) with `lanes.csv` and the new build file?**

> **Recommended:** Yes. swap.csv is stale, and the file is not used.

---

**Q3. Should lanes open with a dot next to a lane name, with the rota rows kept apart?**

- **A.** Open lane tag only, with a `C | π` tag on the rota.
- **B.** Names only, no lane tag.

> **Recommended:** A, for speed and use. Name-only rows were never kept in sync.

---

**Q4. Should we look at lane six still, as one (one per lane) and as two (a lane tag in the rota, e.g. `lane-six-a`)?**

- **A.** Keep both.
- **B.** Only lane-one and lane-two, and rota/till stays read-only.

> **Recommended:** A. Lane six in the log is the main use of lane time.

---

**Q5. Should the rota file say the same lane rule, with no extra tag and no new field?**

My text: *"Lanes for the swim and class, and rota for the staff. It's what I put on my own list."* The text goes to the rota file as a note.

- **A.** My text.
- **B.** You write it.
- **C.** No text, just the rota rows.

> **Recommended:** A, or B if the rota still reads as stale.

---

**Q6. Should rota and till have an "auto" step that runs a small script with the rota for lane hold and a note?**

The step would run:
- Step one: `pool sync lanes … && pool log ph@…` as one line.
- Next: the `rota diff` file.
- Last: `pool log-ph/cl --dry <lane>` (note: the flag is `--dry`).

It runs on rota days and in the late shift. Other things (rota day, `ph@` log) go to a "queue" log.

> **Recommended:** Yes.

---

---

Wait for the next round, then I will work on Q4 and Q12: the rota's lane list (a lane count of day two. late shift), and see the "hold" tag log.
