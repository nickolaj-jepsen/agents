/**
 * A session's first start is its only one. Claude that comes up in its classic renderer is a
 * failed start, reported with the diagnostic it printed; a stand-in `claude` counts its launches,
 * so a second attempt a retry would make is visible here.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { Session } from "./session.ts";

const dir = mkdtempSync(join(tmpdir(), "drive-start-"));
const launches = join(dir, "launches");
const standIn = `#!/bin/sh
echo launch >> "$LAUNCHES"
printf 'Fullscreen did not finish starting last time.\\n'
sleep 30
`;

afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("reports Claude's classic renderer and starts it once", async () => {
  const starting = Session.open({
    harness: "claude",
    start: { bin: { claude: standIn }, env: { LAUNCHES: launches } },
    size: [80, 24],
    backend: "lib",
    name: `start-failure-${process.pid}`,
  });
  await expect(starting).rejects.toThrow(/Fullscreen did not finish starting last time/);
  expect(readFileSync(launches, "utf8").trim().split("\n")).toEqual(["launch"]);
});
