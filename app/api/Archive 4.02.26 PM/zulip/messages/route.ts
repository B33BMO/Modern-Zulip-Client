// app/api/zulip/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { zulipGet, zulipPostForm } from "../_util";

// ---------- helpers ----------------------------------------------------------

/** Safely parse JSON body; returns {} if missing/invalid instead of throwing. */
async function safeJson<T = any>(req: NextRequest): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

/** Turn a Zulip-relative or absolute URL into our proxy URL. */
function toProxy(urlOrPath?: string): string {
  if (!urlOrPath) return "";
  try {
    const u = new URL(urlOrPath, process.env.NEXT_PUBLIC_ZULIP_BASE);
    const pathWithQuery = u.pathname + (u.search || "");
    return `/api/zulip/proxy?path=${encodeURIComponent(pathWithQuery)}`;
  } catch {
    const p = urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
    return `/api/zulip/proxy?path=${encodeURIComponent(p)}`;
  }
}

const esc = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

/** Rewrite any Zulip asset URL inside message HTML to go through our proxy. */
function rewriteZulipAssetsToProxy(html: string) {
  const origin = (process.env.NEXT_PUBLIC_ZULIP_BASE || "").replace(/\/$/, "");

  // Relative paths
  const relRules: Array<[RegExp, string]> = [
    [/(src|href)="\/user_uploads\/thumbnail\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/user_uploads/thumbnail/")}$2"`],
    [/(src|href)="\/user_uploads\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/user_uploads/")}$2"`],
    [/(src|href)="\/user_avatars\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/user_avatars/")}$2"`],
    [/(src|href)="\/external_content\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/external_content/")}$2"`],
    [/(src|href)="\/static\/([^"]+)"/g, `$1="/api/zulip/proxy?path=${encodeURIComponent("/static/")}$2"`],
  ];
  for (const [re, repl] of relRules) html = html.replace(re, repl);

  // Absolute paths from the Zulip origin
  if (origin) {
    const base = esc(origin);
    const absRules: Array<[RegExp, string]> = [
      [new RegExp(`(src|href)="${base}(\\/user_uploads\\/thumbnail\\/[^"]+)"`, "g"), `$1="/api/zulip/proxy?path=$2"`],
      [new RegExp(`(src|href)="${base}(\\/user_uploads\\/[^"]+)"`, "g"), `$1="/api/zulip/proxy?path=$2"`],
      [new RegExp(`(src|href)="${base}(\\/user_avatars\\/[^"]+)"`, "g"), `$1="/api/zulip/proxy?path=$2"`],
      [new RegExp(`(src|href)="${base}(\\/external_content\\/[^"]+)"`, "g"), `$1="/api/zulip/proxy?path=$2"`],
      [new RegExp(`(src|href)="${base}(\\/static\\/[^"]+)"`, "g"), `$1="/api/zulip/proxy?path=$2"`],
    ];
    for (const [re, repl] of absRules) html = html.replace(re, repl);
  }

  return html;
}

// ---------- POST: send a message (stream or DM) ------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await safeJson<{
      content?: string;
      streamName?: string;
      topic?: string;
      dmUserIds?: number[];
    }>(req);

    const { content, streamName, topic, dmUserIds } = body;

    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: "Message content is empty." }, { status: 400 });
    }

    // Build a plain object payload for zulipPostForm (Record<string, string>)
    const payload: Record<string, string> = { content: String(content) };

    if (Array.isArray(dmUserIds) && dmUserIds.length > 0) {
      payload.type = "private";
      payload.to = JSON.stringify(dmUserIds); // Zulip expects JSON array string
    } else if (typeof streamName === "string" && streamName.trim()) {
      payload.type = "stream";
      payload.to = streamName.trim(); // Zulip allows stream name here
      if (typeof topic === "string" && topic.trim()) payload.topic = topic.trim();
    } else {
      return NextResponse.json({ error: "No destination specified." }, { status: 400 });
    }

    const data = await zulipPostForm("/messages", payload);
    return NextResponse.json(data ?? { ok: true });
  } catch (err: any) {
    // Always return JSON
    const msg = err?.message || "Failed to send message";
    const code = err?.status || err?.code || 500;
    return NextResponse.json({ error: msg, code }, { status: Number(code) || 500 });
  }
}

// ---------- GET: fetch messages for a narrow (stream/topic or DM) -----------
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const dmParam = sp.get("dm"); // comma-separated user ids e.g. "12,34"
    const stream = sp.get("stream");
    const topic = sp.get("topic");

    const narrow: any[] = [];
    if (dmParam) {
      const ids = dmParam
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n));
      if (ids.length > 0) narrow.push({ operator: "dm", operand: ids });
    } else {
      if (stream) narrow.push({ operator: "stream", operand: stream });
      if (topic) narrow.push({ operator: "topic", operand: topic });
    }

    const qs = new URLSearchParams();
    qs.set("anchor", "newest");
    qs.set("num_before", "50");
    qs.set("num_after", "0");
    qs.set("apply_markdown", "true");
    if (narrow.length) qs.set("narrow", JSON.stringify(narrow));

    const data = await zulipGet(`/messages?${qs.toString()}`);

    const items = (data?.messages ?? []).map((m: any) => {
      const avatarPath =
        (m.avatar_url as string | undefined) ?? `/avatar/${m.sender_id}`;
      return {
        id: Number(m.id),
        ts: Number(m.timestamp) * 1000,
        senderName: String(m.sender_full_name),
        avatarUrl: toProxy(avatarPath),
        contentHtml: rewriteZulipAssetsToProxy(String(m.content)),
      };
    });

    // Always JSON
    return NextResponse.json({ messages: items });
  } catch (err: any) {
    // Typical causes: not configured / 401 from Zulip / parsing error
    const msg = err?.message || "Failed to fetch messages";
    // If util surfaced status, use it; otherwise 500
    const status = Number(err?.status || err?.code || 500) || 500;
    // Still return JSON with an empty list so client code can handle gracefully
    return NextResponse.json({ messages: [], error: msg, code: status }, { status });
  }
}

// Ensure runtime execution (no static caching)
export const dynamic = "force-dynamic";
