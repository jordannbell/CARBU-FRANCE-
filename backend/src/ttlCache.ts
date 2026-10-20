interface Entry<V> {
  readonly value: V
  readonly expiresAt: number
}

/** Small bounded cache with per-entry expiry. Oldest entries are evicted first. */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, Entry<V>>()

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly clock: () => number = Date.now,
  ) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.clock() + this.ttlMs })
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) this.entries.delete(oldest.value)
    }
  }

  get size(): number {
    return this.entries.size
  }
}
