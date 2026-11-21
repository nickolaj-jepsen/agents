---
about: A closing explanation with a bold-led numbered list of reasons and an extra paragraph of an alternative, ending in a bold recommendation sentence, with no question anywhere.
shape: none
---
That's fair. It's also the only rule that fits the pool rota. If the rota is full, the lane you want is held as soon as the gate opens.

**Why lanes need the lock gate.** For `lane lock(...)` to hold in the swim rota the guard is on, it has to show "busy" on an open lane slot. In practice only these can do that:

1. **The desk.** Hand-held would need a card or a `key`. That is a risk, which lets two guards in. It's the same one (`open-lane.ts:42`).
2. **A lane tag.** There's `tag` with `hold` set already. But `lanes.ts:88` has it so you'd have to wrap the whole gate-check rota for you.
3. **The clock**, which is the real one. Each lane has one, and the guard has the same. It's off-the-shelf but needs a small patch, with a gap that's very short.

**Last one, if a fourth idea suits you.** The code path is `gate.ts:57`: it hangs on how each lane was last read, which no tool can see. You can wrap the call and add a small copy of your own. It would hold the lock when a swim ends and clear it with every `await`, `for each` loop and old-style `then`. That would work and keep the rota your own. But it's not quite right: you'd also need to clear the lock when a guard leaves, or `.then` calls would hold an open lane. That's the lane's worst case, shown by logs. I'd only try it if you see the lag is high.

**My recommendation:** go with the clock and keep the rest quiet. The clock is the first slot we hit it with this week, and an old-style desk rota works as the fallback if it comes to that.
