// app/api/zulip/_util.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ZulipConfig = { email: string; key: string; base: string };

/* ---------------- Cookie handling (tolerant) ---------------- */

export const COOKIE_NAMES = {
  email: ["zulip_email", "ZULIP_EMAIL"],
  key:   ["zulip_api_key", "zulip_key", "ZULIP_KEY"],
  base:  ["zulip_base", "ZULIP_BASE"],
};

async function readCookieAny(names: string[]) {
  const c = await cookies();
  for (const n of names) {
    const v = c.get(n)?.value;
    if (v) return v;
  }
  return null;
}

/** Read credentials from httpOnly cookies (Next 15: cookies() is async). */
export async function readConfig(): Promise<ZulipConfig | null> {
  const email  = await readCookieAny(COOKIE_NAMES.email);
  const key    = await readCookieAny(COOKIE_NAMES.key);
  const baseRaw =
    (await readCookieAny(COOKIE_NAMES.base)) ?? process.env.NEXT_PUBLIC_ZULIP_BASE ?? null;

  if (!email || !key || !baseRaw) return null;

  // Normalize to origin (accepts both hostname and full URL)
  const origin = new URL(baseRaw.startsWith("http") ? baseRaw : `https://${baseRaw}`).origin;
  return { email, key, base: origin };
}

/** Exported so other routes (e.g. /upload) can reuse it. */
export function authHeader(cfg: ZulipConfig) {
  return "Basic " + Buffer.from(`${cfg.email}:${cfg.key}`).toString("base64");
}

/* --------------------- Zulip fetchers ----------------------- */

export async function zulipGet(path: string): Promise<any> {
  const cfg = await readConfig();
  if (!cfg) throw new ApiError(401, "Zulip is not configured");

  const url = `${cfg.base}/api/v1${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(cfg) },
    cache: "no-store",
  });

  const txt = await res.text();
  let data: any;
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }

  if (!res.ok) {
    const msg = data?.msg || data?.message || txt.slice(0, 200) || `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg);
  }
  return data;
}

export async function zulipPostForm(path: string, payload: Record<string, string>) {
  const cfg = await readConfig();
  if (!cfg) throw new ApiError(401, "Zulip is not configured");

  const url = `${cfg.base}/api/v1${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(cfg),
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams(payload),
    cache: "no-store",
  });

  const txt = await res.text();
  let data: any;
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }

  if (!res.ok) {
    const msg = data?.msg || data?.message || txt.slice(0, 200) || `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg);
  }
  return data;
}

/* ---------------------- Error helper ------------------------ */

export function jsonError(err: unknown) {
  const e = err as any;
  const status = e?.status ?? 500;
  const msg = e?.message || "Internal error";
  return NextResponse.json({ error: msg }, { status });
}

/* --------------------- Proxy helpers ------------------------ */

/** Map a Zulip-relative OR absolute URL to our proxy path. */
export function toProxy(urlOrPath?: string): string {
  if (!urlOrPath) return "";
  try {
    // Absolute URL -> keep only path+query through our proxy
    const u = new URL(urlOrPath);
    return `/api/zulip/proxy?path=${encodeURIComponent(u.pathname + (u.search || ""))}`;
  } catch {
    // Relative URL
    const p = urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
    return `/api/zulip/proxy?path=${encodeURIComponent(p)}`;
  }
}

/** Rewrite Zulip asset URLs to go through our /proxy (works for rel + abs). */
export function rewriteZulipAssetsToProxy(html: string) {
  // Relative paths
  const relRules: Array<[RegExp, string]> = [
    [/(src|href)="\/user_uploads\/thumbnail\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/user_uploads/thumbnail/")}$2"`],
    [/(src|href)="\/user_uploads\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/user_uploads/")}$2"`],
    [/(src|href)="\/user_avatars\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/user_avatars/")}$2"`],
    [/(src|href)="\/external_content\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/external_content/")}$2"`],
    [/(src|href)="\/static\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/static/")}$2"`],
  ];
  for (const [re, repl] of relRules) html = html.replace(re, repl);

  // Absolute URLs (match any host, keep only Zulip paths)
  const absRules: Array<[RegExp, string]> = [
    [/(src|href)="https?:\/\/[^"]+(\/user_uploads\/thumbnail\/[^"]+)"/g, `$1="/api/zulip/proxy?path=$2"`],
    [/(src|href)="https?:\/\/[^"]+(\/user_uploads\/[^"]+)"/g, `$1="/api/zulip/proxy?path=$2"`],
    [/(src|href)="https?:\/\/[^"]+(\/user_avatars\/[^"]+)"/g, `$1="/api/zulip/proxy?path=$2"`],
    [/(src|href)="https?:\/\/[^"]+(\/external_content\/[^"]+)"/g, `$1="/api/zulip/proxy?path=$2"`],
    [/(src|href)="https?:\/\/[^"]+(\/static\/[^"]+)"/g, `$1="/api/zulip/proxy?path=$2"`],
  ];
  for (const [re, repl] of absRules) html = html.replace(re, repl);

  return html;
}
