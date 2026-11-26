/**
 * The one failure a person should read as a line: a bad name, a refused symlink, a build that
 * failed. Both entry points print it and exit 1; anything else keeps its own shape.
 */
export class UpdatesError extends Error {
  override name = "UpdatesError";
}

/** An error the operating system raised: ENOENT, ENOSPC, EACCES and their siblings. */
export function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" && /^E[A-Z0-9]+$/.test(code);
}

/** The text to put after a colon: the message Python reported as `exc.strerror or exc`. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Re-throw anything that is not worth one line, so a bug still shows its stack. */
export function rethrowUnlessExpected(error: unknown): never {
  throw error;
}
