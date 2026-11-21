---
about: A long status report with a table, bullet lists and a numbered list of steps, ending in a single offer question that is not a decision to catch.
shape: none
---
That plan was what you wanted to see. It is saved in `~/.pool/ops/plans/rota-log/lane-hold/v2/decisions.md`, which lists the chemistry sign-offs we agreed. The lane map is linked to it in `lane-map.md`. Nothing else changes at open.

**What we agreed**

| Area | Plan |
|---|---|
| Hours | Open to swimmers. I will log them with the guard rota and the lane/hold list for your go/no-go. Once that, rota/lane lists show your hours. |
| Rota | Guards move to the late lane from the first shift; an extra guard covers it in-hours for swim. The rota runs in March. |
| Lane holds | There's one rule with the `hold -f` flag. The lane-hold file is only a small log. |
| Chemistry | Tests start from a tank in the plant room, followed by dose of the log the last day. The first dose logs it if it's low; `ph-log build` runs it. |
| Café | A day sheet for the till rota, with a small cash tab for the day end. You keep the float; I log what was sold. |
| Storage | Read-only logs; `~/pool`, `~/cafe` and `~/ops` read-only with write access to the rota. `rota`, `.lane`, `till` and `.cafe` stay on the same disk. The `/var` log is `/var/pool-log/<lane>/`, and there's no write there. |
| `!` | Printed in the log. `/log` stays on the tank. |
| Tests | Pass and fail logs run the check at close. There's a one-shot test for Q2 and a one-shot test from rota. Test 1 is a lane `lane-hold` check on the till. |
| Release | Ready for May dose, a rota file lock, and you run one at the desk. I log the same line and you check it. I wait on the till; `lane-hold swap` is for your own rota. |

**What I will do now (stop if you are away)**
- I'll build the `lane hold`/`guard swap#rota` list in the order of dose. Those hours are about 3.4% of your pool week, so it'd stay small.
- Lane, hold, swap and café (about 0.7% of the week's hours) get a `/log` line each in the shared folder.
- If run in `~` or `/`, the tool adds a read-only lock and stops the run so.
- The log runs as one, with `.pool/log/**`, which are the real files. Skip them to save about 0.3% of the day.
- This plan's last step is the log, and `~/pool` marks it as a staff `rota+hold:` line. Read-only logs need no lock, so a late swap can't change it without notice.
- Once I build, I test with `pool -e <lane>` in the plant room. Your shift only sees the output from the last test in the log.

**What build does first:**
1. Read the rota files.
2. Run version 0.0.0 with the `pool -n` flag, with no real writes.
3. Run the lane tests and the first build.
4. Build the lane list and the hold file, with the late-swap log.
5. Run the dose log, test 0 and the café check, and check the swap log.
6. Check the lock on `rota`, `~/pool` and this plan, with the rota open.

One note from you: `/pool/ops` is left open to your user. The café and the `till` log are covered by me.

Shall I proceed with that plan, or do you want to review it first?
