import { NextRequest, NextResponse } from "next/server";

function readCreds(req: NextRequest) {
  const c = req.cookies;
  const email = c.get("zulip_email")?.value || process.env.ZULIP_EMAIL || "";
  const apiKey = c.get("zulip_api_key")?.value || process.env.ZULIP_API_KEY || "";
  const base = c.get("zulip_base")?.value || process.env.NEXT_PUBLIC_ZULIP_BASE || "";
  return { email, apiKey, base };
}

function authHeader(email: string, apiKey: string) {
  if (!email || !apiKey) return undefined;
  return "Basic " + Buffer.from(`${email}:${apiKey}`).toString("base64");
}

function zulipURL(base: string, path: string) {
  return new URL(path.startsWith("/") ? path : `/${path}`, base);
}

function cacheControlFor(pathname: string) {
  if (pathname.startsWith("/user_uploads") || pathname.startsWith("/external_content")) {
    return "private, max-age=300";
  }
  return "public, max-age=600, stale-while-revalidate=600";
}

function passThrough(up: Response, cacheCtl: string) {
  const headers = new Headers();
  for (const k of ["content-type", "content-length", "content-disposition", "etag", "last-modified"]) {
    const v = up.headers.get(k);
    if (v) headers.set(k, v);
  }
  headers.set("cache-control", cacheCtl);
  return new NextResponse(up.body, { status: up.status, statusText: up.statusText, headers });
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Missing ?path" }, { status: 400 });

  const { email, apiKey, base } = readCreds(req);
  if (!base) return NextResponse.json({ error: "Zulip base URL not configured" }, { status: 500 });

  const target = zulipURL(base, path);
  const cacheCtl = cacheControlFor(target.pathname);

  const headers: HeadersInit = {};
  const auth = authHeader(email, apiKey);
  if (auth) headers["authorization"] = auth;

  const up = await fetch(target.toString(), { headers, cache: "no-store" });

  if (up.status === 401 || up.status === 403) {
    return new NextResponse(up.body, {
      status: up.status,
      statusText: up.statusText,
      headers: { "content-type": up.headers.get("content-type") ?? "text/plain", "cache-control": "no-store" },
    });
  }
  return passThrough(up, cacheCtl);
}

export async function HEAD(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return new NextResponse(null, { status: 400 });

  const { email, apiKey, base } = readCreds(req);
  const target = zulipURL(base, path);

  const headers: HeadersInit = {};
  const auth = authHeader(email, apiKey);
  if (auth) headers["authorization"] = auth;

  const up = await fetch(target.toString(), { method: "HEAD", headers, cache: "no-store" });
  const res = new NextResponse(null, { status: up.status, statusText: up.statusText });
  res.headers.set("cache-control", cacheControlFor(target.pathname));
  const ct = up.headers.get("content-type");
  if (ct) res.headers.set("content-type", ct);
  return res;
}
