export const MAX_RETAINED_LARGE_VIEWER_CACHES = 2;

interface BoundedLruMapOptions<K, V> {
  maxEntries: number;
  onEvict?: (key: K, value: V) => void;
}

export class BoundedLruMap<K, V> extends Map<K, V> {
  private readonly maxEntries: number;
  private readonly onEvict?: (key: K, value: V) => void;

  constructor({ maxEntries, onEvict }: BoundedLruMapOptions<K, V>) {
    super();
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.onEvict = onEvict;
  }

  override get(key: K) {
    const value = super.get(key);
    if (value === undefined) {
      return undefined;
    }

    super.delete(key);
    super.set(key, value);
    return value;
  }

  override set(key: K, value: V) {
    super.delete(key);
    super.set(key, value);

    while (this.size > this.maxEntries) {
      const oldest = this.entries().next().value as [K, V] | undefined;
      if (!oldest) {
        break;
      }

      super.delete(oldest[0]);
      this.onEvict?.(oldest[0], oldest[1]);
    }

    return this;
  }
}
