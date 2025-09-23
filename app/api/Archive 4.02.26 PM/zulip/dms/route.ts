import { NextResponse } from "next/server";
import { zulipGet } from "../_util";

// Quick HTML → text for previews
function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
function toProxy(pathOrUrl: string) {
  try {
    const u = new URL(pathOrUrl, process.env.NEXT_PUBLIC_ZULIP_BASE);
    return `/api/zulip/proxy?path=${encodeURIComponent(u.pathname + (u.search || ""))}`;
  } catch {
    const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return `/api/zulip/proxy?path=${encodeURIComponent(p)}`;
  }
}

export async function GET() {
  // who am I? (needed to drop "me" from DM participant display)
  const me = await zulipGet("/users/me");
  const myId: number = me.user_id;

  // Pull newest ~200 DM messages and bucket by recipient set
  const qs = new URLSearchParams({
    anchor: "newest",
    num_before: "200",
    num_after: "0",
    narrow: JSON.stringify([{ operator: "is", operand: "dm" }]),
    apply_markdown: "true",
  });
  const data = await zulipGet(`/messages?${qs.toString()}`);

  type Bucket = {
    key: string;
    userIds: number[];
    names: string[];
    lastId: number;
    lastTs: number;
    lastExcerpt: string;
    avatars: string[]; // proxied avatar urls (others, not me)
  };
  const map = new Map<string, Bucket>();

  for (const m of data.messages ?? []) {
    if (m.type !== "private") continue;
    const recips = (m.display_recipient || []) as Array<{ id: number; full_name: string }>;
    const ids = recips.map((r) => r.id).sort((a, b) => a - b);
    const key = ids.join(",");

    const others = recips.filter((r) => r.id !== myId);
    const avatars = others.map((r) => toProxy(`/avatar/${r.id}`));
    const names = others.map((r) => r.full_name);

    const current = map.get(key);
    if (!current || m.id > current.lastId) {
      map.set(key, {
        key,
        userIds: others.map((o) => o.id),
        names,
        avatars,
        lastId: m.id,
        lastTs: m.timestamp * 1000,
        lastExcerpt: stripHtml(m.content || ""),
      });
    }
  }

  const threads = Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
  return NextResponse.json({ threads });
}
