import { NextResponse } from "next/server";
import { zulipGet } from "../_util";

type Presence = "active" | "away" | "offline";

function mapPresence(agg?: string): Presence {
  if (agg === "active") return "active";
  if (agg === "idle") return "away";
  return "offline";
}

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

async function fetchPresenceByUserId(user_id: number) {
  // Prefer the canonical endpoint if available
  try {
    const data = await zulipGet(`/users/${user_id}/presence`);
    const agg = data?.presence?.aggregated?.status as string | undefined;
    const ts = data?.presence?.aggregated?.timestamp as number | undefined;
    return { presence: mapPresence(agg), last_active: ts };
  } catch {
    // fallthrough
  }
  return null;
}

async function fetchPresenceFallback(email: string, user_id: number) {
  // Try get-presence by user_id, then by email
  try {
    const d = await zulipGet(`/get-presence?user_id=${encodeURIComponent(String(user_id))}`);
    const agg = d?.presence?.aggregated?.status as string | undefined;
    const ts = d?.presence?.aggregated?.timestamp as number | undefined;
    return { presence: mapPresence(agg), last_active: ts };
  } catch {
    /* ignore */
  }
  try {
    const d = await zulipGet(`/get-presence?email=${encodeURIComponent(email)}`);
    const agg = d?.presence?.aggregated?.status as string | undefined;
    const ts = d?.presence?.aggregated?.timestamp as number | undefined;
    return { presence: mapPresence(agg), last_active: ts };
  } catch {
    /* ignore */
  }
  return { presence: "offline" as Presence };
}

// simple concurrency limiter
async function allWithLimit<T, R>(items: T[], limit: number, task: (x: T) => Promise<R>) {
  const results: R[] = new Array(items.length) as R[];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await task(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function GET() {
  const usersResp = await zulipGet("/users");
  const members = (usersResp.members || []).filter((u: any) => !u.is_bot);

  const pres = await allWithLimit(
    members as any[],
    8,
    async (u: any) =>
      (await fetchPresenceByUserId(u.user_id)) ??
      (await fetchPresenceFallback(u.email, u.user_id))
  );

  const users = members.map((u: any, idx: number) => {
    // prefer server-provided avatar_url, otherwise /avatar/{id}
    const rawAvatar = (u.avatar_url as string | undefined) ?? `/avatar/${u.user_id}`;
    return {
      id: u.user_id as number,
      name: u.full_name as string,
      email: u.email as string,
      avatarUrl: toProxy(rawAvatar),
      presence: pres[idx].presence as Presence,
      lastActiveTs: pres[idx].last_active ?? undefined,
    };
  });

  return NextResponse.json({ users });
}
