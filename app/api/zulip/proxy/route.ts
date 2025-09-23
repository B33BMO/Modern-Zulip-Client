// app/api/zulip/proxy/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readConfig } from "../_util";

function cleanPath(raw: string) {
  // raw is already encoded in ?path=... — don’t double-decode the hex blobs
  // but do normalize absolute URLs passed in accidentally.
  try {
    const u = new URL(raw);
    return u.pathname + (u.search || "");
  } catch {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

async function forward(req: NextRequest, method: "GET" | "HEAD") {
  const cfg = await readConfig();
  if (!cfg) return NextResponse.json({ error: "Zulip is not configured" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("path");
  if (!raw) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const path = cleanPath(raw);
  const target = `${cfg.base}${path}`;

  const upstream = await fetch(target, {
    method,
    headers: {
      // Basic works for avatars/uploads/external_content
      Authorization: "Basic " + Buffer.from(`${cfg.email}:${cfg.key}`).toString("base64"),
    },
    cache: "no-store",
  });

  // Stream/pipe with the same content-type/status
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  // prevent the browser cache fighting with auth churn while testing
  headers.set("cache-control", "private, no-store");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export async function GET(req: NextRequest)  { return forward(req, "GET"); }
export async function HEAD(req: NextRequest) { return forward(req, "HEAD"); }

// Make sure this runs on the server each time
export const dynamic = "force-dynamic";
