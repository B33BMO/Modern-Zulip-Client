// app/api/zulip/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  jsonError,
  zulipGet,
  zulipPostForm,
  rewriteZulipAssetsToProxy,
  toProxy,
} from "../_util";

/* ------------------- POST: send message -------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      content?: string;
      streamName?: string;
      topic?: string;
      dmUserIds?: number[];
    };

    const { content, streamName, topic, dmUserIds } = body || {};
    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: "Message content is empty." }, { status: 400 });
    }

    const form: Record<string, string> = { content: String(content) };

    if (Array.isArray(dmUserIds) && dmUserIds.length > 0) {
      form.type = "private";
      form.to = JSON.stringify(dmUserIds);
    } else if (typeof streamName === "string" && streamName.length > 0) {
      form.type = "stream";
      form.to = streamName;
      if (typeof topic === "string" && topic.trim()) form.topic = topic.trim();
    } else {
      return NextResponse.json({ error: "No destination specified." }, { status: 400 });
    }

    const data = await zulipPostForm("/messages", form);
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e);
  }
}

/* -------------------- GET: list messages ------------------- */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dmParam = sp.get("dm");
    const stream = sp.get("stream");
    const topic = sp.get("topic");

    const narrow: any[] = [];
    if (dmParam) {
      // dmParam = "1,2,3"
      const ids = dmParam
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n));
      if (ids.length > 0) narrow.push({ operator: "dm", operand: ids });
    } else {
      if (stream) narrow.push({ operator: "stream", operand: stream });
      if (topic)  narrow.push({ operator: "topic", operand: topic });
    }

    const qs = new URLSearchParams();
    qs.set("anchor", "newest");
    qs.set("num_before", "50");
    qs.set("num_after", "0");
    qs.set("apply_markdown", "true");
    if (narrow.length) qs.set("narrow", JSON.stringify(narrow));

    // This goes to `${base}/api/v1/messages?...` with proper Basic auth
    const data = await zulipGet(`/messages?${qs.toString()}`);

    const items = (data?.messages ?? []).map((m: any) => {
      // Prefer avatar_url; fallback to Zulip's /avatar/<id>
      const avatarPath =
        (m.avatar_url as string | undefined) ?? `/avatar/${m.sender_id}`;

      return {
        id: Number(m.id),
        ts: Number(m.timestamp) * 1000,
        senderName: String(m.sender_full_name),
        senderEmail: String(m.sender_email || ""),
        avatarUrl: toProxy(avatarPath), // proxy through our /api/zulip/proxy
        contentHtml: rewriteZulipAssetsToProxy(String(m.content)), // rewrite <img>/<source> etc.
      };
    });

    return NextResponse.json({ messages: items });
  } catch (e) {
    return jsonError(e);
  }
}

export const dynamic = "force-dynamic";
