/**
 * A consumer that stops reading (`agents status | head`, `| grep -q`) closes the pipe, and Node
 * turns the next write into an EPIPE error event on stdout. Unhandled, that is a stack trace and a
 * failed command; a Unix tool exits quietly instead. Both entry points install this first.
 */
export function exitOnClosedPipe(): void {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EPIPE") process.exit(0);
      throw error;
    });
  }
}
