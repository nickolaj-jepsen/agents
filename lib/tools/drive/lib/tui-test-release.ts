/**
 * The tui-test daemon CLI, pinned to a release. The npm package is the library only; the daemon
 * `drive goto`, `cap`, `keys` and live mode drive ships as a static binary on the release page.
 * `fetchTuiTest` puts it under `lib/tools/drive/node_modules/.cache/tui-test/<version>/<target>/`, which the
 * `@agents/drive#tui-test` task caches as its output. The version tracks `@microsoft/tui-test`; bump both.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const VERSION = "0.1.1";

/** Per platform: the release's target triple and the SRI sha256 of its tarball. */
const RELEASES: Record<string, { target: string; hash: string }> = {
  "linux-x64": {
    target: "x86_64-unknown-linux-musl",
    hash: "sha256-e8S3BqusRIsPcEPJPtZuOcQERNo5VWTYCsfARi03d5U=",
  },
  "linux-arm64": {
    target: "aarch64-unknown-linux-musl",
    hash: "sha256-8EHIJuvyN2JhP+yWlhHrBx97lrvmW7LiQE10RF6um+4=",
  },
  "darwin-x64": {
    target: "x86_64-apple-darwin",
    hash: "sha256-KYrj03VJ1HEqd5XTiPTocfO/i3hjNyw0QXh4cMdHQI0=",
  },
  "darwin-arm64": {
    target: "aarch64-apple-darwin",
    hash: "sha256-poGVYqGAMbISVl93HQP+nl7H1PcbOJOU/ZCcxmzua4E=",
  },
};

const release = () => {
  const r = RELEASES[`${process.platform}-${process.arch}`];
  if (!r) throw new Error(`tui-test: no release for ${process.platform}-${process.arch}`);
  return r;
};

const cacheRoot = join(import.meta.dirname, "..", "node_modules", ".cache", "tui-test");

/**
 * Where this platform's binary is kept. The target is in the path because turbo's cache key has
 * no platform: a restore from another OS leaves this one's file missing, not wrong.
 */
export const fetchedBin = () => join(cacheRoot, VERSION, release().target, "tui-test");

/** Downloads, verifies and unpacks the release; a binary already there is kept. */
export async function fetchTuiTest(): Promise<string> {
  const bin = fetchedBin();
  if (existsSync(bin)) return bin;
  const { target, hash } = release();
  const url = `https://github.com/microsoft/tui-test/releases/download/${VERSION}/tui-test-${target}.tar.gz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tui-test: ${url}: ${res.status} ${res.statusText}`);
  const tarball = Buffer.from(await res.arrayBuffer());
  const got = `sha256-${createHash("sha256").update(tarball).digest("base64")}`;
  if (got !== hash) throw new Error(`tui-test: ${url} is ${got}, expected ${hash}`);

  // Unpacked beside the destination and renamed in, so an interrupted run leaves no half-written binary.
  mkdirSync(dirname(bin), { recursive: true });
  const work = mkdtempSync(join(dirname(bin), ".fetch-"));
  try {
    const archive = join(work, "release.tar.gz");
    writeFileSync(archive, tarball);
    execFileSync("tar", ["-xzf", archive, "-C", work, "tui-test"]);
    chmodSync(join(work, "tui-test"), 0o755);
    renameSync(join(work, "tui-test"), bin);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return bin;
}
