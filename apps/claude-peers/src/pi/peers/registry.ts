/**
 * This session's registry entry, and the writes that keep it current.
 *
 * Two owners meet here: the plugin owns the core (identity, socket, status, idle queue) and an
 * adapter owns an optional handful of fields (`metadata.ts`). They are stored apart and merged at
 * write time, so a core status change never drops what the adapter said, and an adapter key that
 * collides with a core one loses.
 *
 * Writes are serialized and coalesced: one at a time, each serializing the state as it is when the
 * write starts, with at most one more waiting behind it. A status flapping or a burst of metadata
 * therefore costs at most two writes, and a write that is slow can never land an old entry on top of
 * a newer one. `close()` stops the queue, waits out a write already in flight, and only then removes
 * the entry, so nothing can put it back after shutdown.
 */
import type { RegistryMetadata } from "./metadata.ts";
import type { RegistryEntry } from "./protocol.ts";

/** The fields the plugin itself owns; an adapter's metadata cannot reach them. */
export type CorePatch = Partial<
  Pick<
    RegistryEntry,
    "name" | "nameSource" | "nameSince" | "status" | "statusUpdatedAt" | "waitingFor"
  >
>;

export type RegistryIo = {
  /** Writes one whole entry, everywhere it belongs. Resolves when it landed, or rejects. */
  write(entry: RegistryEntry): Promise<void>;
  /** Removes the entry from everywhere it was written. */
  remove(): Promise<void>;
  /** The clock, for the timestamps the entry carries. */
  now?: () => number;
  /**
   * A write that failed. The registry is best-effort: it keeps going, but a session nobody can see
   * has to be able to say so, and this is where it hears.
   */
  failed?: (error: unknown) => void;
};

export class Registry {
  private core: RegistryEntry;
  private meta: RegistryMetadata = {};
  private started = false;
  private closed = false;
  private dirty = false;
  private running: Promise<void> | undefined;
  private readonly now: () => number;

  constructor(
    core: RegistryEntry,
    private readonly io: RegistryIo,
  ) {
    this.core = core;
    this.now = io.now ?? Date.now;
  }

  /** The entry as it would be written now, metadata first so the core always wins a collision. */
  current(): RegistryEntry | undefined {
    return this.started ? { ...this.meta, ...this.core } : undefined;
  }

  /**
   * Replaces the adapter-owned fields. A key left out is cleared, so metadata is the whole of what
   * the adapter knows rather than a patch. Ignored once closed.
   */
  setMetadata(metadata: RegistryMetadata): void {
    if (this.closed) return;
    this.meta = { ...metadata };
    this.schedule();
  }

  /** Writes the first entry; before this nothing reaches disk and `current()` is undefined. */
  async start(patch: CorePatch = {}): Promise<void> {
    if (this.started || this.closed) return;
    this.started = true;
    this.apply(patch);
    this.schedule();
    await this.idle();
  }

  /** A core change: a status, a name, or the dialog a waiting session waits on. */
  publish(patch: CorePatch): void {
    if (!this.started || this.closed) return;
    this.apply(patch);
    this.schedule();
  }

  /** Resolves once every write scheduled so far, and the one behind it, has finished. */
  async flush(): Promise<void> {
    await this.idle();
  }

  /** Stops writing, drops what is pending, and removes the entry once a write in flight is done. */
  async close(): Promise<void> {
    if (this.closed) return;
    const wasStarted = this.started;
    this.closed = true;
    this.dirty = false;
    await this.idle();
    if (wasStarted) await this.io.remove().catch(() => {});
    this.started = false;
    this.meta = {};
  }

  private apply(patch: CorePatch): void {
    const now = this.now();
    this.core = { ...this.core, ...patch, updatedAt: now };
    // Re-stating a status would restart how long the session has been in it.
    if (patch.status !== undefined) this.core.statusUpdatedAt = now;
  }

  private schedule(): void {
    if (!this.started || this.closed) return;
    this.dirty = true;
    this.running ??= this.drain();
  }

  private async idle(): Promise<void> {
    // A write that finishes while another is scheduled leaves `running` set again; follow it.
    while (this.running) await this.running;
  }

  private drain(): Promise<void> {
    let done: Promise<void>;
    done = (async () => {
      while (this.dirty && !this.closed) {
        this.dirty = false;
        const entry = this.current();
        if (!entry) return;
        // A registry is best-effort like the login profiles it spans: a failed write is not worth
        // failing a turn or a shutdown over, and the next change writes the whole entry again.
        await this.io.write(entry).catch((error) => this.io.failed?.(error));
      }
    })().finally(() => {
      if (this.running === done) this.running = undefined;
    });
    return done;
  }
}
