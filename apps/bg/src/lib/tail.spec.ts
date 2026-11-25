import { describe, expect, it } from "vitest";
import { TAIL, tailOfLog } from "./tail.ts";
import { readLogTail } from "../pi/node.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const read = (text: string, cut = false) => ({ bytes: new TextEncoder().encode(text), cut });

describe("tailOfLog", () => {
  it("keeps the last lines and says it cut the rest", () => {
    const text = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join("\n");
    const tail = tailOfLog(read(text));
    const lines = tail.text.split("\n");
    expect(lines).toHaveLength(TAIL.lines);
    expect(lines.at(-1)).toBe("line 200");
    expect(lines[0]).toBe("line 161");
    expect(tail.truncated).toBe(true);
  });

  it("drops a first line cut by the read, and keeps the whole log otherwise", () => {
    expect(tailOfLog(read("whole\nlines\n")).text).toBe("whole\nlines");
    expect(tailOfLog(read("whole\nlines\n")).truncated).toBe(false);
    expect(tailOfLog(read("fragment\nnext\nlast\n", true))).toEqual({
      text: "next\nlast",
      truncated: true,
    });
  });

  it("holds to the byte cap even when the read gave it more", () => {
    const text = `${"x".repeat(50)}\n${"y".repeat(50)}`;
    const tail = tailOfLog(
      { bytes: new TextEncoder().encode(text), cut: false },
      { lines: 40, bytes: 60 },
    );
    expect(tail.truncated).toBe(true);
    // The cut falls inside the first line, which goes whole: only `yyy…` is left.
    expect(tail.text).toBe("y".repeat(50));
  });

  it("says nothing about an empty or fragment-only log", () => {
    expect(tailOfLog(read(""))).toEqual({ text: "", truncated: false });
    expect(tailOfLog(read("half a line", true))).toEqual({ text: "", truncated: true });
    expect(tailOfLog(read("\n"))).toEqual({ text: "", truncated: false });
  });
});

describe("readLogTail", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("reads the end of a log of any size, bounded", () => {
    const dir = mkdtempSync(join(tmpdir(), "bg-tail-"));
    dirs.push(dir);
    const path = join(dir, "big.log");
    writeFileSync(path, `${"a".repeat(200_000)}\nend\n`);
    const log = readLogTail(path, TAIL.bytes);
    expect(log.bytes.byteLength).toBe(TAIL.bytes);
    expect(log.cut).toBe(true);
    const tail = tailOfLog(log);
    expect(tail.text.endsWith("end")).toBe(true);
    expect(tail.truncated).toBe(true);
  });

  it("reads a short log whole", () => {
    const dir = mkdtempSync(join(tmpdir(), "bg-tail-"));
    dirs.push(dir);
    const path = join(dir, "small.log");
    writeFileSync(path, "just\nthis\n");
    expect(readLogTail(path, TAIL.bytes).cut).toBe(false);
    expect(tailOfLog(readLogTail(path, TAIL.bytes)).text).toBe("just\nthis");
  });
});
