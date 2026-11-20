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
        "A turn ends on three questions. Pick in the transcript, move with the focused control bar, and fill the prompt from the live review.",
      project: "orders-api",
      start: { hermetic: true, plugins: ["answer"], turns },
      steps: [
        { sleep: 400 },
        slow(ask),
        { press: "Enter" },
        { wait: "Q1/3", timeout: 20_000 },
        { sleep: 1800 },
        { type: "/answer" },
        ...keys("Enter", "Alt+a"),
        { wait: /r review/ },
        { sleep: 2000 },
        { press: "b" },
        { sleep: 1600 },
        { press: "j" },
        { sleep: 1600 },
        { press: "a" },
        { sleep: 1600 },
        { press: "j" },
        { sleep: 1600 },
        { press: "a" },
        { sleep: 1600 },
        { press: "r" },
        { wait: /Answers\s+3 of 3 answered/ },
        { sleep: 2500 },
        poster,
        { wait: "❯ Fill prompt" },
        { press: "Enter" },
        { sleep: 2500 },
      ],
    },
    {
      harness: "pi",
      caption:
        "In fullscreen pi, choose directly on the question cards or use the key guide. Fill prompt puts the reviewed reply above your draft.",
      project: "orders-api",
      start: { hermetic: true, plugins: ["answer"], turns },
      steps: [
        { sleep: 400 },
        slow(ask),
        { press: "Enter" },
        { wait: "alt+a answer", timeout: 20_000 },
        { sleep: 1800 },
        { press: "Alt+a" },
        { wait: "esc prompt" },
        { sleep: 2000 },
        { press: "b" },
        { sleep: 1200 },
        { press: "j" },
        { wait: "❯ Q2/3" },
        { press: "a" },
        { sleep: 1200 },
        { press: "j" },
        { wait: "❯ Q3/3" },
        { press: "a" },
        { press: "r" },
        { wait: "❯ Review answers  3/3" },
        { sleep: 2500 },
        poster,
        { press: "Enter" },
        { sleep: 2500 },
      ],
    },
  ],
  stills: {
    asked: {
      caption: "Questions appear in the transcript, with a collapsed review after the last card.",
      project: "orders-api",
      start: { hermetic: true, plugins: ["answer"], turns },
      steps: [{ type: ask }, { press: "Enter" }, { wait: "Q1/3" }],
    },
    form: {
      caption:
        "The active question has an accent heading and pointer. The key guide stays in place as you move between cards.",
      project: "orders-api",
      start: { hermetic: true, plugins: ["answer"], turns },
      steps: [
        { type: ask },
        { press: "Enter" },
        { wait: "Q1/3" },
        { type: "/answer" },
        ...keys("Enter", "Alt+a"),
        { wait: /r review/ },
      ],
    },
    pi: {
      caption:
        "In fullscreen pi, the cards stay in the transcript and the key guide stays above the prompt.",
      harness: "pi",
      project: "orders-api",
      start: { hermetic: true, plugins: ["answer"], turns },
      steps: [
        { type: ask },
        { press: "Enter" },
        { wait: "alt+a answer" },
        { press: "Alt+a" },
        { wait: "esc prompt" },
      ],
    },
  },
  vscode: {
    form: {
      caption: "VS Code uses native controls in the transcript, with each option’s detail visible.",
      scenario: "form",
    },
    chosen: {
      caption: "A chosen option stays selected on the card and updates the review.",
      scenario: "chosen",
    },
  },
});
