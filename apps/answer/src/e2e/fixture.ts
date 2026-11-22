/** The assistant messages the answer scenarios replay, one file each under `fixtures/`. */
import { readFileSync } from "node:fs";
import type { Turn } from "@agents/drive/lib/harness.ts";

/** The text of `fixtures/<name>.md`. */
export const message = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.md`, import.meta.url), "utf8").trimEnd();

/** One replayed turn that says the fixture. */
export const says = (name: string): Turn[] => [{ text: message(name) }];
