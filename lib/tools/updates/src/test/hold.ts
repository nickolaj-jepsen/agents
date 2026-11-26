/**
 * `hold.ts` is not a spec: the lock spec spawns it as a real Node process, lets it take a lock, and
 * kills it to prove the kernel takes the lock back.
 */
import { acquireFileLock } from "../lock.ts";

const path = process.argv[2];
if (!path) throw new Error("usage: hold.ts LOCK_PATH");
const release = await acquireFileLock(path, { timeout: 10 });
process.stdout.write("held\n");
// Hold until killed; the helper exits when this process dies and closes the pipe.
await new Promise(() => undefined);
void release;
