**Q1. Pick the storage layer?**

| Engine   | Latency | Notes          |
| -------- | ------- | -------------- |
| SQLite   | 1ms     | embedded       |
| Postgres | 5ms     | needs a server |

```ts
const db = open("app.db");
await db.exec("select 1");
```

- **A.** SQLite
- **B.** Postgres
