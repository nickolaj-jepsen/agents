---
about: A heading repeats a later question's label before the real rule-separated questions, with a table, code fences and bullet lists inside the question bodies, and two questions carry only a bare recommendation.
shape: round Q1[AB*A] Q2[AB*A] Q3[AB*A] Q4[*] Q5[*]
---
Short answer: the two routes fit well enough to the shop rota and van run. For Q1 and Q2, I put `scope` first on the van list. That keeps it in the same form as before.

## Look at van loads

The van loads depend on crate count and weight. That grows with rounds × stops, and that's what bites at scale.

Each route has a van with the same crates, too. Our `crate-scope` hook on `rounds/van` sets the key `scope`: `scope({ round: "rounds/van" })`. So the hook can be set per **stop** (`{ stop, crates }`) instead of per van. Boxes and bags are set at pack time, and the van gets a note to the driver who packs it.

I timed that with real runs (`/home/orchard/.cache/farm/rounds/shop/van-run/7/van-4/-pip-lane-mill-yard/leg-a-3-east-lane/stops/stop-list.json`):

| round / van | stops | pack time | one van's pack list | total drive |
| --- | --- | --- | --- | --- |
| north / small | 2,4 | 0.8 ms | 0.6 ms | 0.4 s, 0.9 ms |
| west / medium | 3,2 | 1.1 ms | 0.9 ms | 3.5 s, 1.2 ms |
| east / large | 6,5 | 2.5 ms | 0.4 ms | 9 s, big load |

- **Load a van** with an empty crate rack. Only a full one is pulled then.
- **A late order** re-packs two more crates onto the van, not moving the pallet.
- **Pack swaps are rare.** `swap()` is called only with crate ids known, so nothing else needs it.
- **Cross-van scans take long.** `load({ van })` has to read all crates, and that is most of the cost at larger runs.
- **Pack hints** matter only when a van stops. We can trim just the tail of the run, in the yard. A hint would do that, but there are two caches, so we leave the hint out.

The other rules, `drop`, `swap` and pack rows as before are; only the van's size rule. The van's rule has a flag on the driver, so "mine" is `driver = me OR stop ∈ my round`.

## Q4: Why no `.of(who)`

Not using `.of` yet. Each van takes three crates and two bags. The van list was also fixed, so an extra layer with `.of` would force the same two rows twice.

But the rule can live in the van file than in the stop file: `rule({ van: "a" })` is set once, and `.of` is a hook. That is just what you want.

---

**Q1. Keep `scope` on the van list, set from the driver's rota and the load?**

This sets `scope: (van) => rows` on van, and the code looks like so:

```ts
export const vanRoute = route({
  name: "van-run",
  crates: list({ size: int, depth: pack() }),
  rota: shape({ driver: text(), stops: array(text()) }),
  scope: (van, ctx) => scope({ van: van.id, round: ctx.round }),
});

// run it twice: all vans
const { rows } = await vanRoute({ van: ids, round: "east" }, { note: "load all vans?" });
```

- `ctx` is `{ van, round, driver, stop }`, the van's data that you can read here (§4).
- The rows are re-set when the van is full, and the pair `{ van, round }` is set on the stop.
- Bags and crates are set once. Each van has a flag too (`pack: { kinds: ["crate"], max: 12 }`), so the flag lines up with it. That matches your Q2 note for swap sizes.

- **A.** On the van, and a van list still needs `scope` to read it.
- **B.** On the van only.

> **Recommended:** A. The van list has the rules that hold true, with a single rule.

---

**Q2. Keep `swap`, `pack` and `drop` as they are used by the van, and treat a van with no stops as an error?**

`@farm/van/rota` would load with `scope: (van, ctx) => scope({ van: van.id })`, set in place. The rota's key `van.*` takes no scope. In the end, such a van is run by hand: it sits on the same rota as a spare van, and both are idle. It costs little and has no risk.

- **A.** As written.
- **B.** Pull them out from the van: that is a big change.

> **Recommended:** A. A van list has a flat rule.

---

**Q3. Give a van a rule hook that sets the load, short of the van-wide `scope`?**

```ts
{ van: id, limit: { crates: { max: 12 } },
  scope: (van, load) => load <= 0 ? scope({ van: van.id }) : all() }
```

- **A.** `scope: (van, load) => rows`, with `van` and the `load` set once.
- **B.** Set van's own as one for all.

> **Recommended:** A. It's the same as for the van, and a van can run with two.

---

**Q4. Ship them both, with the van load only the other vans' own in the rota?**

> **Recommended:** Yes. It helps to cut work down and keep one run in the pack list.

---

**Q5. Ship it as the van's own rule (`own`), with a fresh test that van's drawn from the rota?**

> **Recommended:** Yes.
