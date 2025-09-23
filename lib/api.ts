// lib/api.ts
// Unified data layer that prefers Electron (via preload bridge), with web fallbacks.
// Also exports the proxy helpers used for Zulip images/embeds.

import { isElectron, desktop } from "./desktopBridge";

export type Presence = "active" | "away" | "offline";

export interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
  presence: Presence;
  lastActiveTs?: number;
}

export interface Stream { id: number; name: string; }
export interface Topic  { id: number; name: string; streamId: number; }

export interface UiMessage {
  id: number;
  senderName: string;
  senderEmail: string;
  avatarUrl: string;
  contentHtml: string;
  ts: string | number;
}

export type DmThread = {
  key: string;
  userIds: number[];
  names: string[];
  avatars: string[];
  lastTs: number;
  lastExcerpt: string;
};

/* ----------------------- Electron adapter -------------------- */

async function eGet(pathAndQuery: string): Promise<any> {
  const text = await desktop.get(pathAndQuery);
  return JSON.parse(text || "{}");
}
async function ePostForm(path: string, form: Record<string, string>): Promise<any> {
  const text = await desktop.postForm(path, form);
  return JSON.parse(text || "{}");
}

/* ----------------------- Web helpers ------------------------- */

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = text?.slice(0, 200) || `${res.status} ${res.statusText}`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

/**
 * Save web creds.
 * IMPORTANT: write to `/api/auth/zulip`, which sets `zulip_email`, `zulip_api_key`, `zulip_base`.
 * This matches the checker used by the page and all server routes.
 */
export async function saveCredentialsWeb(email: string, apiKey: string, baseUrl: string) {
  const res = await fetch("/api/auth/zulip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, apiKey, baseUrl }),
  });
  const data = await j<{ ok?: boolean; error?: string }>(res);
  if (data.ok !== true) throw new Error(data.error || "Failed to save credentials");
}

/* ---------------- Credentials / session ---------------------- */

// Desktop (Electron): API key
export async function loginWithApiKey(params: {
  email: string;
  apiKey: string;
  baseUrl: string;
}) {
  const { email, apiKey, baseUrl } = params;
  if (!isElectron) throw new Error("loginWithApiKey only available in desktop");
  return desktop.loginWithApiKey(email, apiKey, baseUrl);
}

// Desktop (Electron): Password login — establishes Zulip session cookie for assets
export async function loginWithPassword(params: {
  email: string;
  password: string;
  baseUrl: string;
}) {
  const { email, password, baseUrl } = params;
  if (!isElectron) throw new Error("loginWithPassword only available in desktop");
  return desktop.loginWithPassword(email, password, baseUrl);
}

export async function tryAutoLogin(_baseUrl: string, _email: string) {
  // If you later add an Electron-side auto-login, plumb it here.
  return false;
}

export async function logout(baseUrl: string, email: string) {
  if (!isElectron) return;
  return desktop.logout(baseUrl, email);
}

/* ---------------------- Proxy helpers ------------------------ */

/** Map a Zulip-relative or absolute URL to our app/web proxy. */
export function toProxy(urlOrPath?: string): string {
  if (!urlOrPath) return "";
  const base = (process.env.NEXT_PUBLIC_ZULIP_BASE || "").replace(/\/$/, "");

  const toAbsPath = (u: string) => {
    try {
      const parsed = new URL(u, base || undefined);
      return parsed.pathname + (parsed.search || "");
    } catch {
      return u.startsWith("/") ? u : `/${u}`;
    }
  };

  const path = toAbsPath(urlOrPath);

  // Desktop (Electron): include a dummy host to avoid app-proxy:/// triple-slash ambiguity.
  if (isElectron) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return `app-proxy://zulip${p}`;
  }

  // Web/Next fallback proxy route
  return `/api/zulip/proxy?path=${encodeURIComponent(path)}`;
}

const esc = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

/** Rewrite any Zulip asset URL inside message HTML to go through our proxy. */
export function rewriteZulipAssetsToProxy(html: string) {
  const origin = (process.env.NEXT_PUBLIC_ZULIP_BASE || "").replace(/\/$/, "");

  // relative paths (src|href)
  const relRules: Array<[RegExp, (m: string, a: string, b: string) => string]> = [
    [/(src|href)="\/user_uploads\/thumbnail\/([^"]+)"/g, (_m, a, b) => `${a}="${toProxy(`/user_uploads/thumbnail/${b}`)}"`],
    [/(src|href)="\/user_uploads\/([^"]+)"/g,                         (_m, a, b) => `${a}="${toProxy(`/user_uploads/${b}`)}"`],
    [/(src|href)="\/user_avatars\/([^"]+)"/g,                         (_m, a, b) => `${a}="${toProxy(`/user_avatars/${b}`)}"`],
    [/(src|href)="\/external_content\/([^"]+)"/g,                     (_m, a, b) => `${a}="${toProxy(`/external_content/${b}`)}"`],
    [/(src|href)="\/static\/([^"]+)"/g,                               (_m, a, b) => `${a}="${toProxy(`/static/${b}`)}"`],
    // srcset
    [/(srcset)="\/user_uploads\/([^"]+)"/g,                           (_m, a, b) => `${a}="${toProxy(`/user_uploads/${b}`)}"`],
    [/(srcset)="\/user_uploads\/thumbnail\/([^"]+)"/g,                (_m, a, b) => `${a}="${toProxy(`/user_uploads/thumbnail/${b}`)}"`],
    [/(srcset)="\/external_content\/([^"]+)"/g,                       (_m, a, b) => `${a}="${toProxy(`/external_content/${b}`)}"`],
  ];
  let out = html;
  for (const [re, fn] of relRules) out = out.replace(re, fn as any);

  // absolute from Zulip origin
  if (origin) {
    const base = esc(origin);
    const abs = (p: string) => new RegExp(`(src|href)="${base}(${esc(p)}[^"]+)"`, "g");
    const absRules: Array<[RegExp, (m: string, a: string, b: string) => string]> = [
      [abs("/user_uploads/thumbnail/"), (_m, a, b) => `${a}="${toProxy(b)}"`],
      [abs("/user_uploads/"),            (_m, a, b) => `${a}="${toProxy(b)}"`],
      [abs("/user_avatars/"),            (_m, a, b) => `${a}="${toProxy(b)}"`],
      [abs("/external_content/"),        (_m, a, b) => `${a}="${toProxy(b)}"`],
      [abs("/static/"),                  (_m, a, b) => `${a}="${toProxy(b)}"`],
    ];
    for (const [re, fn] of absRules) out = out.replace(re, fn as any);

    // absolute srcset
    const absSrcset = (p: string) => new RegExp(`(srcset)="${base}(${esc(p)}[^"]+)"`, "g");
    const absSsRules: Array<[RegExp, (m: string, a: string, b: string) => string]> = [
      [absSrcset("/user_uploads/"),          (_m, a, b) => `${a}="${toProxy(b)}"`],
      [absSrcset("/user_uploads/thumbnail/"),(_m, a, b) => `${a}="${toProxy(b)}"`],
      [absSrcset("/external_content/"),      (_m, a, b) => `${a}="${toProxy(b)}"`],
    ];
    for (const [re, fn] of absSsRules) out = out.replace(re, fn as any);
  }

  return out;
}

/* ---------------------- API functions ------------------------ */

export async function apiStreams(): Promise<Stream[]> {
  if (isElectron) {
    const data = await eGet("/streams");
    return (data.streams || []) as Stream[];
  }
  const res = await fetch("/api/zulip/streams", { cache: "no-store" });
  const { streams } = await j<{ streams: Stream[] }>(res);
  return streams;
}

export async function apiTopics(streamId: number): Promise<Topic[]> {
  if (isElectron) {
    const data = await eGet(`/streams/${streamId}/topics`);
    return (data.topics || []) as Topic[];
  }
  const res = await fetch(`/api/zulip/streams/${streamId}/topics`, { cache: "no-store" });
  const { topics } = await j<{ topics: Topic[] }>(res);
  return topics;
}

export async function apiUsers(): Promise<User[]> {
  if (isElectron) {
    const data = await eGet("/users");
    return (data.users || []) as User[];
  }
  const res = await fetch("/api/zulip/users", { cache: "no-store" });
  const { users } = await j<{ users: User[] }>(res);
  // ensure avatar URLs go through the web proxy in browser mode
  return (users || []).map(u => ({ ...u, avatarUrl: toProxy(u.avatarUrl) }));
}

export async function apiPresence(opts: { email?: string; user_id?: number }) {
  if (isElectron) {
    const qs = new URLSearchParams();
    if (opts.email) qs.set("email", opts.email);
    if (opts.user_id) qs.set("user_id", String(opts.user_id));
    const data = await eGet(`/presence?${qs.toString()}`);
    return data as { presence: Presence; lastActiveTs?: number; raw: unknown };
  }
  const qs = new URLSearchParams();
  if (opts.email) qs.set("email", opts.email);
  if (opts.user_id) qs.set("user_id", String(opts.user_id));
  const res = await fetch(`/api/zulip/presence?${qs.toString()}`, { cache: "no-store" });
  return j(res);
}

export async function apiUpdateUser(payload: Record<string, any>) {
  if (isElectron) {
    const data = await ePostForm(
      "/users/update",
      Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])),
    );
    return data;
  }
  const res = await fetch("/api/zulip/users/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return j(res);
}

export async function apiDmThreads(): Promise<DmThread[]> {
  if (isElectron) {
    const data = await eGet("/dms");
    return (data.threads || []) as DmThread[];
  }
  const res = await fetch("/api/zulip/dms", { cache: "no-store" });
  const data = await j<{ threads: DmThread[] }>(res);
  const threads = data.threads || [];
  return threads.map(t => ({ ...t, avatars: (t.avatars || []).map(a => toProxy(a)) }));
}

// fetch messages for stream/topic or DM
export async function apiMessages(
  streamName?: string,
  topicName?: string,
  dmUserIds?: number[]
): Promise<UiMessage[]> {
  const params = new URLSearchParams();
  if (dmUserIds?.length) params.set("dm", dmUserIds.join(","));
  else {
    if (streamName) params.set("stream", streamName);
    if (topicName) params.set("topic", topicName);
  }

  let messages: UiMessage[];
  if (isElectron) {
    const data = await eGet(`/messages?${params.toString()}`);
    messages = (data.messages || []) as UiMessage[];
  } else {
    const res = await fetch(`/api/zulip/messages?${params.toString()}`, { cache: "no-store" });
    const data = await j<{ messages: UiMessage[] }>(res);
    messages = data.messages || [];
  }

  // Always rewrite embedded asset URLs so <picture>/<source> and <img> go through proxy
  return messages.map((m) => ({
    ...m,
    contentHtml: rewriteZulipAssetsToProxy(m.contentHtml || ""),
  }));
}

// send message (stream or DM)
export async function apiSendMessage(opts: {
  content: string;
  streamName?: string;
  topic?: string;
  dmUserIds?: number[];
}) {
  if (isElectron) {
    const form: Record<string, string> = { content: String(opts.content) };
    if (opts.dmUserIds?.length) {
      form.type = "private";
      form.to = JSON.stringify(opts.dmUserIds);
    } else if (opts.streamName) {
      form.type = "stream";
      form.to = opts.streamName;
      if (opts.topic) form.topic = opts.topic;
    } else {
      throw new Error("No destination specified.");
    }
    return ePostForm("/messages", form);
  }

  const res = await fetch("/api/zulip/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  return j(res);
}
