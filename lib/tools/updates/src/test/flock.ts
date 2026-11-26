/**
 * The real flock(2) helper for the specs. `agents-flock` is built by Nix and named by the wrapper
 * (`AGENTS_FLOCK`); a checkout without Nix gets the same program compiled once from its source with
 * the system compiler, and a machine with neither falls back to Perl's `flock`, which takes the same
 * kernel lock. Nothing here is shipped: the package's own helper is the C program.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

const isExecutable = (path: string): boolean => {
  try {
    fs.accessSync(path, fs.constants.X_OK);
    return fs.statSync(path).isFile();
  } catch {
    return false;
  }
};

const onPath = (name: string): string | undefined => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
};

const PERL_HELPER = `#!/usr/bin/env perl
use strict;
use warnings;
use Fcntl qw(:flock O_CREAT O_RDWR);
use Time::HiRes qw(time sleep);
$| = 1;
my ($path, $timeout, $poll) = @ARGV;
$timeout = 0 unless defined $timeout;
$poll = 0.1 unless defined $poll && $poll > 0;
sysopen(my $fh, $path, O_RDWR | O_CREAT, 0644)
  or die "agents-flock(perl): $path: $!\\n";
my $deadline = $timeout < 0 ? -1 : time() + $timeout;
my $waited = 0;
while (1) {
  last if flock($fh, LOCK_EX | LOCK_NB);
  unless ($waited) { print "waiting\\n"; $waited = 1; }
  my $left = $deadline < 0 ? $poll : $deadline - time();
  if ($deadline >= 0 && $left <= 0) { close($fh); exit 75; }
  my $nap = ($deadline < 0 || $left > $poll) ? $poll : $left;
  sleep($nap) if $nap > 0;
}
print "locked\\n";
while (1) {
  my $got = sysread(STDIN, my $buffer, 4096);
  last if !defined($got) || $got == 0;
}
close($fh);
exit 0;
`;

/** The helper to point `AGENTS_FLOCK` at in the specs. */
export function flockHelperForTests(): string {
  if (cached !== undefined) return cached;
  if (process.env.AGENTS_FLOCK) {
    cached = process.env.AGENTS_FLOCK;
    return cached;
  }
  const declared = onPath("agents-flock");
  if (declared !== undefined) {
    cached = declared;
    return cached;
  }
  const directory = fs.mkdtempSync(join(os.tmpdir(), "agents-flock-helpers-"));
  process.on("exit", () => {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // A helper left in /tmp is a nuisance, not a failed suite.
    }
  });
  const compiler = onPath("cc") ?? onPath("gcc") ?? onPath("clang");
  const perl = onPath("perl");
  if (compiler !== undefined) {
    const source = fileURLToPath(new URL("../../../../../pkgs/agents-flock.c", import.meta.url));
    const binary = join(directory, "agents-flock");
    execFileSync(compiler, ["-O2", "-o", binary, source], { stdio: "ignore" });
    cached = binary;
    return cached;
  }
  if (perl !== undefined) {
    const script = join(directory, "agents-flock");
    fs.writeFileSync(script, PERL_HELPER, { mode: 0o755 });
    cached = script;
    return cached;
  }
  throw new Error(
    "no flock helper for the specs: no AGENTS_FLOCK, no agents-flock on PATH, and no cc or perl " +
      "to build pkgs/agents-flock.c; set AGENTS_FLOCK to it",
  );
}
