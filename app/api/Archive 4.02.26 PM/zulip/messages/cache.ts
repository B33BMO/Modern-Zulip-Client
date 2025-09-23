type Entry = { at: number; data: any };
const MAX = 100;
const TTL = 5_000; // 5s

const map = new Map<string, Entry>();

export function getCached(key: string) {
  const e = map.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL) { map.delete(key); return null; }
  return e.data;
}

export function setCached(key: string, data: any) {
  map.set(key, { at: Date.now(), data });
  if (map.size > MAX) map.delete(map.keys().next().value);
}

export function invalidate(prefix: string) {
  for (const k of map.keys()) if (k.startsWith(prefix)) map.delete(k);
}
