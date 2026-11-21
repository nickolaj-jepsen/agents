---
about: "the emoji form: a label closing its bold, a recommendation after an arrow"
kind: round
items:
  - label: Q1
    title: Storage
    body: Should the cache use SQLite?
    recommended: true
    reason: Yes, it is one file and needs no server.
  - label: Q2
    title: Eviction
    body: Evict by age or by size?
    options:
      - key: A
        text: Age.
      - key: B
        text: Size.
    recommended: A
    reason: A, the simpler rule.
---
❓ **Q1** - **Storage**: Should the cache use SQLite?

➡️ Yes, it is one file and needs no server.

---

❓ **Q2** - **Eviction**: Evict by age or by size?

- **A.** Age.
- **B.** Size.

➡️ A, the simpler rule.
