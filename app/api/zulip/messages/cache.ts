// app/api/zulip/messages/cache.ts

type Entry<T = any> = { at: number; data: T };

// tune these to taste
const TTL_MS = 30_000;   // 30s
const MAX_ITEMS = 500;

const map = new Map<string, Entry>();

/** Return cached value if present and fresh; otherwise null. */
export function getCached<T = any>(key: string): T | null {
  const e = map.get(key);
  if (!e) return null;

  if (Date.now() - e.at > TTL_MS) {
    map.delete(key);
    return null;
  }
  return e.data as T;
}

/** Insert/refresh an entry; trims oldest when over capacity (LRU-ish). */
export function setCached<T = any>(key: string, data: T): void {
  map.set(key, { at: Date.now(), data });

  if (map.size > MAX_ITEMS) {
    // Delete the oldest (first) key if it exists.
    const iter = map.keys();
    const first = iter.next();
    if (!first.done) {
      map.delete(first.value as string);
    }
  }
}

/** Remove all entries whose key starts with the given prefix. */
export function invalidate(prefix: string): void {
  for (const k of map.keys()) {
    if (k.startsWith(prefix)) map.delete(k);
  }
}

/** Build a stable cache key from params. */
export function cacheKey(parts: Record<string, string | number | boolean | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const k of Object.keys(parts).sort()) {
    const v = parts[k];
    if (v === undefined || v === null) continue;
    qs.set(k, String(v));
  }
  return qs.toString();
}
