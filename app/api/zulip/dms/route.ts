// app/api/zulip/dms/route.ts
import { NextResponse } from "next/server";
import { zulipGet } from "../_util";

// Quick HTML → text for previews
function stripHtml(html: string | null | undefined) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function toProxy(pathOrUrl: string) {
  try {
    const u = new URL(pathOrUrl, process.env.NEXT_PUBLIC_ZULIP_BASE);
    // Only path+query go through our proxy
    return `/api/zulip/proxy?path=${encodeURIComponent(
      u.pathname + (u.search || "")
    )}`;
  } catch {
    const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return `/api/zulip/proxy?path=${encodeURIComponent(p)}`;
  }
}

export async function GET() {
  // Who am I? (used to hide "me" from the participant list)
  const me = await zulipGet("/users/me");
  const myId: number = Number(me.user_id);

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
    avatars: string[];    // proxied avatar urls (others, not me)
    lastId: number;
    lastTs: number;
    lastExcerpt: string;
  };

  const map = new Map<string, Bucket>();

  for (const m of data.messages ?? []) {
    if (m.type !== "private") continue;

    // Zulip returns display_recipient as an array for DMs
    const recips = Array.isArray(m.display_recipient) ? m.display_recipient : [];
    const ids = recips
      .map((r: any) => Number(r?.id))
      .filter((n: number) => Number.isFinite(n))
      .sort((a: number, b: number) => a - b);

    if (!ids.length) continue;

    const key = ids.join(",");

    const others = recips.filter((r: any) => r?.id !== myId);
    const avatars = others.map((r: any) => toProxy(`/avatar/${r.id}`));
    const names = others.map((r: any) => String(r?.full_name ?? "")).filter(Boolean);

    const current = map.get(key);
    if (!current || m.id > current.lastId) {
      map.set(key, {
        key,
        userIds: others.map((o: any) => Number(o.id)).filter(Number.isFinite),
        names,
        avatars,
        lastId: Number(m.id),
        lastTs: Number(m.timestamp) * 1000,
        lastExcerpt: stripHtml(m.content),
      });
    }
  }

  const threads = Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
  return NextResponse.json({ threads });
}

export const dynamic = "force-dynamic";
