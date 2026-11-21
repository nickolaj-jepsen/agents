---
about: Unlettered bold bullets of causes come first, then a bold stance line, then the lettered bold options as bullets, an advice line, and a closing question that asks two things.
shape: round Q1[AB*A]
---
The delay on `quotes` was due to a bug in my first pass. Day-5 job of the wheel truing, based on `quotes` and bench at noon. Each job then took longer, so the `stock` and `part-sync` jobs I didn't touch and the old queue-by-queue run. The cost is small. The final call is resting on you.

**Causes:**
- **Slow part-sync job.** `stock` reads all suppliers' lists now, and a call to `sync.ts` can't skip that step. The change breaks the wheel order of the shop's own queue.
- **Cache too wide.** With more than 8 loan bikes, the cache re-reads all rows only once, so each run hits the full table. It runs well in tests, and only fails the first time when the cache holds a stale row.
- **Time out, late sync.** That fix would leave the queue with no gap. The job waits for the shop it has the lock on, and only a restart that ties to the last sync. Late rows are fed only by the shop's own run in the queue.

**Your lean: fix the sync in the job.** When the job runs, it ran well with a cold cache. The cache keeps the old rows, and the tags the cache doesn't know are missing. Then the desk can see a late bike to the shop it sold what the quote says. The 1 fix is a small change, not one with 5 files and a 5 step plan.

- **A. Guard the sync job with `lock`.** The lock is tied to the sync job's 5-minute window. That keeps the run at one time, and the call (`sync -f now`) can then drop the rest of at the same time. The change is small and clear, and the code would be a one-line fix in `sync.ts`.
- **B. The job re-reads the list on a timer,** for the next 30 s. This is simple, and the fix is to the shop's side. But the desk still only sees the list at the same time, now or later.

I'd pick **A**, since that is what you said you wanted, and B leans hard on the timer for it. The fix should also cover the new large `sync -f` job with and without `lock`. If that holds up, B is the fallback.

**Open known gaps, not blockers:**
- Late bikes can leave a gap when a loan goes to the desk's list, which the day-end job doesn't look at.
- Slow rows show up as the shop's data grows. They are fine with that limit at 3 s, so it should work.

Which option do you want for the sync, and should I also run the job on `main` for a day-0 run the whole week?
