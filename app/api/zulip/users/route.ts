// app/api/zulip/users/route.ts
import { NextResponse } from "next/server";
import { jsonError, toProxy, zulipGet } from "../_util";

export async function GET() {
  try {
    const d = await zulipGet("/users");
    const pres = await zulipGet("/realm/presence");

    const presenceByEmail: Record<string, any> = pres?.presences || {};
    const users = (d.members || d.users || []).map((u: any) => {
      const pr = presenceByEmail[u.email] || {};
      const agg = pr?.aggregated || {};
      const status = (agg.status as string) || "offline";
      const lastActiveTs = agg.timestamp ? Number(agg.timestamp) * 1000 : undefined;
      const avatar = u.avatar_url || `/avatar/${u.user_id}`;

      return {
        id: u.user_id,
        name: u.full_name,
        email: u.email,
        avatarUrl: toProxy(avatar),
        presence: status as "active" | "away" | "offline",
        lastActiveTs,
      };
    });

    return NextResponse.json({ users });
  } catch (e) {
    return jsonError(e);
  }
}
export const dynamic = "force-dynamic";
