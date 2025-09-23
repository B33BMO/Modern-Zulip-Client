// app/api/zulip/_util.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const COOKIE_EMAIL = "zulip_email";
export const COOKIE_KEY = "zulip_key";
export const COOKIE_BASE = "zulip_base";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ZulipConfig = { email: string; key: string; base: string };

/** Read credentials from httpOnly cookies (set during login). */
export async function readConfig(): Promise<ZulipConfig | null> {
  const c = await cookies();
  const email = c.get(COOKIE_EMAIL)?.value ?? null;
  const key = c.get(COOKIE_KEY)?.value ?? null;
  const baseRaw =
    c.get(COOKIE_BASE)?.value ?? process.env.NEXT_PUBLIC_ZULIP_BASE ?? null;

  if (!email || !key || !baseRaw) return null;

  // Normalize to origin (strip trailing slash)
  const origin = new URL(
    baseRaw.startsWith("http") ? baseRaw : `https://${baseRaw}`
  ).origin;
  return { email, key, base: origin };
}

export function authHeader(cfg: ZulipConfig) {
  return "Basic " + Buffer.from(`${cfg.email}:${cfg.key}`).toString("base64");
}

/* ----------------- API wrappers ----------------- */

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
  try {
    data = txt ? JSON.parse(txt) : {};
  } catch {
    data = { raw: txt };
  }

  if (!res.ok) {
    const msg =
      data?.msg ||
      data?.message ||
      txt.slice(0, 200) ||
      `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg);
  }
  return data;
}

export async function zulipPostForm(
  path: string,
  payload: Record<string, string>
) {
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
  try {
    data = txt ? JSON.parse(txt) : {};
  } catch {
    data = { raw: txt };
  }

  if (!res.ok) {
    const msg =
      data?.msg ||
      data?.message ||
      txt.slice(0, 200) ||
      `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg);
  }
  return data;
}

/* --------------- Error helper ----------------- */

export function jsonError(err: unknown) {
  const e = err as any;
  const status = e?.status ?? 500;
  const msg = e?.message || "Internal error";
  return NextResponse.json({ error: msg }, { status });
}
