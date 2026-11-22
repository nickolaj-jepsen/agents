/**
 * A recording plays a package's scenarios two at a time unless `--jobs` says otherwise, and one
 * scenario that fails is that scenario's verdict: the rest still play, and the recorder decides
 * what a failure means. Sessions are held at a barrier, not timed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ffmpegBin, recordJobs } from "./record.ts";
import { pathWith } from "./term.ts";

function latch() {
  let release: () => void = () => {};
  const opened = new Promise<void>((r) => (release = r));
  return { opened, open: () => release() };
}

it("plays two at a time by default and keeps every verdict in job order", async () => {
  const started: string[] = [];
  let active = 0;
  let most = 0;
  const both = latch();
  const letGo = latch();
  const jobs = ["demo", "still", "narrow", "wide"].map((name) => async () => {
    active++;
    most = Math.max(most, active);
    started.push(name);
    if (active === 2) both.open();
    await letGo.opened;
    active--;
    if (name === "still") throw new Error(`could not capture ${name}`);
    return name;
  });

  const run = recordJobs(jobs);
  // The default is two workers: the two later jobs wait in the queue.
  await both.opened;
  expect(started).toEqual(["demo", "still"]);
  letGo.open();
  const results = await run;

  expect(most).toBe(2);
  expect(started).toEqual(["demo", "still", "narrow", "wide"]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled", "fulfilled"]);
  expect(results.filter((r) => r.status === "fulfilled").map((r) => r.value)).toEqual([
    "demo",
    "narrow",
    "wide",
  ]);
});

it("takes --jobs for the scenarios at once, still one verdict each", async () => {
  let active = 0;
  let most = 0;
  const both = latch();
  const letGo = latch();
  const jobs = ["a", "b", "c"].map((name) => async () => {
    active++;
    most = Math.max(most, active);
    if (active === 3) both.open();
    await letGo.opened;
    active--;
    return name;
  });

  const run = recordJobs(jobs, 3);
  await both.opened;
  letGo.open();
  expect(await run).toEqual([
    { status: "fulfilled", value: "a" },
    { status: "fulfilled", value: "b" },
    { status: "fulfilled", value: "c" },
  ]);
  expect(most).toBe(3);
});

it("hands a recording session its own ffmpeg and leaves the parent's PATH alone", async () => {
  // tui-test encodes with the `ffmpeg` on the session's PATH, so a fallback is the session's
  // environment, not the process's: a picture taken or a gate run beside it keeps the PATH it
  // started with.
  const before = process.env.PATH;
  const present = ffmpegBin({ found: true, built: "/nix/store/ffmpeg" });
  expect(present).toBeUndefined();
  const fallback = ffmpegBin({ found: false, built: "/nix/store/ffmpeg" });
  // A wrapper that clears LD_LIBRARY_PATH, which a dev shell may point at another glibc.
  expect(fallback).toBeDefined();
  expect(readFileSync(join(fallback!, "ffmpeg"), "utf8")).toContain(
    "unset LD_LIBRARY_PATH\nexec /nix/store/ffmpeg/bin/ffmpeg",
  );
  expect(process.env.PATH).toBe(before);
  // The session's PATH puts it first and still finds the parent's commands.
  expect(pathWith(fallback)).toBe(`${fallback}:${before}`);
  expect(pathWith(undefined)).toBeUndefined();
});
