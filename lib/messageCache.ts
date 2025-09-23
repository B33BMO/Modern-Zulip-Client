// Simple per-narrow message cache stored in sessionStorage.
// Narrow key is a string like: msgs:stream=general | msgs:stream=general:topic=alerts | msgs:dm=12,34
// We cap stored messages to avoid unbounded growth.

export type CachedMessage = {
    id: number;
    ts: number;
    senderName: string;
    avatarUrl: string;
    contentHtml: string;
  };
  
  const PREFIX = "msgs:";
  const LIMIT = 250; // keep last 250 per narrow
  
  function safeParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  
  export function narrowKey(opts: { stream?: string; topic?: string; dm?: number[] }) {
    if (opts.dm && opts.dm.length) return `${PREFIX}dm=${opts.dm.slice().sort((a,b)=>a-b).join(",")}`;
    if (opts.stream && opts.topic) return `${PREFIX}stream=${opts.stream}:topic=${opts.topic}`;
    if (opts.stream) return `${PREFIX}stream=${opts.stream}`;
    return `${PREFIX}all`;
  }
  
  export function loadMessages(key: string): CachedMessage[] {
    const raw = sessionStorage.getItem(key);
    return safeParse<CachedMessage[]>(raw) ?? [];
  }
  
  export function saveMessages(key: string, list: CachedMessage[]) {
    const trimmed = list.slice(-LIMIT);
    sessionStorage.setItem(key, JSON.stringify(trimmed));
  }
  
  export function mergeAndSave(key: string, incoming: CachedMessage[]) {
    // merge by id; keep chronological order
    const existing = loadMessages(key);
    const seen = new Set(existing.map(m => m.id));
    const merged = [...existing, ...incoming.filter(m => !seen.has(m.id))].sort((a,b)=>a.ts-b.ts);
    saveMessages(key, merged);
    return merged;
  }
  