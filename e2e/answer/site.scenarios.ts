import type { Turn } from "../lib/harness.ts";
import type { Step } from "../lib/scenario.ts";
import { poster, site, slow } from "../lib/site.ts";

/** One step per key: a key sent before the last one settled can be lost. */
const keys = (...names: string[]): Step[] => names.map((press) => ({ press }));

const QUESTIONS = `Before I add rate limiting to the orders API, three things to settle.

**Q1. Where should the limit be enforced?**

- **A.** At the gateway, for every service.
- **B.** In the app, per route.
- **C.** Both.

> **Recommended:** B. The routes differ: \`GET /orders\` is cheap, \`POST /orders\` is not.

---

**Q2. Which callers does it apply to?**

- **A.** Everyone.
- **B.** Only callers without an API key.

---

**Q3. What does a limited caller get back?**

- **A.** \`429\` with a \`Retry-After\` header.
- **B.** \`503\`.
`;

const turns: Turn[] = [{ text: QUESTIONS }];
const ask = "Add rate limiting to the orders API";

export default site({
  plugin: "answer",
  demo: [
    {
      caption:
        "A turn ends on three questions. The form takes one at a time, with a letter, a click or the recommendation, and writes your reply into the prompt.",
      project: "orders-api",
      start: { hermetic: true, turns },
      steps: [
        { sleep: 400 },
        slow(ask),
        { press: "Enter" },
        { wait: /Answer 3 questions/, timeout: 20_000 },
        { sleep: 1800 },
        ...keys("Alt+a", "Enter"),
        { wait: /r: review/ },
        { sleep: 2000 },
        { press: "b" },
        { sleep: 1600 },
        { press: "Enter" },
        { sleep: 1600 },
        { press: "a" },
        { sleep: 1600 },
        { press: "Enter" },
        { sleep: 1600 },
        { press: "a" },
        { sleep: 1600 },
        { click: "r: review" },
        { wait: "fill the prompt" },
        { sleep: 2500 },
        poster,
        { click: "fill the prompt" },
        { sleep: 2500 },
      ],
    },
    {
      harness: "pi",
      caption:
        "pi has the same form from the same parser: the row above the prompt, one question at a time, and your reply written into the editor.",
      project: "orders-api",
      start: { hermetic: true, plugins: ["answer"], turns },
      steps: [
        { sleep: 400 },
        slow(ask),
        { press: "Enter" },
        { wait: /Answer 3 questions/, timeout: 20_000 },
        { sleep: 1800 },
        { press: "Alt+a" },
        { wait: /1-9/ },
        { sleep: 2000 },
        // A number picks and goes on; the last one ends on the review.
        { press: "2" },
        { sleep: 1600 },
        { press: "1" },
        { sleep: 1600 },
        { press: "1" },
        { wait: "fill the prompt" },
        { sleep: 2500 },
        poster,
        { press: "Enter" },
        { sleep: 2500 },
      ],
    },
  ],
  stills: {
    asked: {
      caption: "When a turn ends on questions, a row above the prompt offers the form.",
      project: "orders-api",
      start: { hermetic: true, turns },
      steps: [{ type: ask }, { press: "Enter" }, { wait: /Answer 3 questions/ }],
    },
    form: {
      caption:
        "One question per screen: numbered options, the recommendation marked, a note under any answer.",
      project: "orders-api",
      start: { hermetic: true, turns },
      steps: [
        { type: ask },
        { press: "Enter" },
        { wait: /Answer 3 questions/ },
        ...keys("Alt+a", "Enter"),
        { wait: /r: review/ },
      ],
    },
    pi: {
      caption: "pi has the same form from the same parser, with the same keys.",
      harness: "pi",
      project: "orders-api",
      start: { hermetic: true, plugins: ["answer"], turns },
      steps: [
        { type: ask },
        { press: "Enter" },
        { wait: /Answer 3 questions/ },
        { press: "Alt+a" },
        { wait: /1-9/ },
      ],
    },
  },
});
