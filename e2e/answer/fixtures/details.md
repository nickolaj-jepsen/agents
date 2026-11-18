**Q1. Which database should the journal use?**

Writes are small and frequent, and the file travels with the repository.

- **A.** SQLite
  One file, no server, and the dump tooling already reads it.
- **B.** Postgres
  A shared service the whole team can query, at the cost of running one.
- **C.** Flat files
  Nothing to install, but every query is a scan.

> **Recommended:** A. It is the only one that needs no setup.

---

**Q2. Which checks should run?**

- **A.** lint
- **B.** types
- **C.** tests

---

**Q3. Keep the journal?**

- **A.** Keep it
- **B.** Drop it
