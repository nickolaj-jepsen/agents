import { fileURLToPath } from "node:url";
import type { Turn } from "../lib/harness.ts";
import { site, type SiteScenario } from "../lib/site.ts";

/** A small TypeScript project; the language server comes from the media shell. */
const setup: SiteScenario["setup"] = (ctx) => {
  ctx.write(
    "tsconfig.json",
    JSON.stringify(
      { compilerOptions: { strict: true, target: "es2022", module: "esnext" } },
      null,
      2,
    ),
  );
  ctx.write(
    "src/cart.ts",
    "export interface Item {\n  name: string;\n  price: number;\n  qty: number;\n}\n",
  );
  ctx.initRepo();
};

const BROKEN = `import type { Item } from "./cart.ts";

export function total(items: Item[]): number {
  return items.map((item) => item.price * item.qty).join(", ");
}
`;
const FIXED = BROKEN.replace(
  'items.map((item) => item.price * item.qty).join(", ")',
  "items.reduce((sum, item) => sum + item.price * item.qty, 0)",
);

const turns: Turn[] = [
  {
    text: "I'll add a `total()` helper next to the `Item` type.",
    toolCall: { name: "write", arguments: { path: "src/total.ts", content: BROKEN } },
  },
  {
    text: "The write came back with an error from the language server: `total` returns a string, not a `number`. Fixing that.",
    toolCall: { name: "write", arguments: { path: "src/total.ts", content: FIXED } },
  },
  {
    // pi draws a write as its diff and hides the rest of the result, so read what the model was
    // given from the session's own file, which sits beside the project folder.
    text: "Fixed. To see what the first write returned, I'll read it back from the session file.",
    toolCall: {
      name: "bash",
      arguments: {
        command: "grep -rho 'LSP errors i[n][^\"]*' ../sessions | sed 's/\\\\n/\\n/g'",
      },
    },
  },
  { text: "The first write's result carried the server's error; the second came back clean." },
];

export default site({
  plugin: "lsp",
  stills: {
    errors: {
      caption:
        "A write that breaks the types comes back with the language server's errors appended, which pi's screen hides and the model reads; here read back from the session file.",
      harness: "pi",
      project: "shop-cart",
      setup,
      start: {
        hermetic: true,
        plugins: ["lsp"],
        turns,
        env: { PI_LSP_SERVERS: fileURLToPath(new URL("./servers.json", import.meta.url)) },
      },
      steps: [
        { type: "Add a total() helper for the cart" },
        { press: "Enter" },
        { wait: "came back clean", timeout: 40_000 },
      ],
    },
  },
});
