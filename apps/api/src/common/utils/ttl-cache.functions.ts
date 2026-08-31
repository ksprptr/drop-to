/** An entry plus the timestamp after which it must be recomputed. */
interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * A tiny in-process cache with a per-entry TTL and a hard size cap.
 **/
// In-process on purpose: one API container, and entries are cheap enough that a restart losing them costs nothing.
export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);

      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    // Drop the oldest insertion once full; Map preserves insertion order.
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();

      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }

    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}
