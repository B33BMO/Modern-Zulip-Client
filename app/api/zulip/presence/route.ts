// app/api/zulip/presence/route.ts
import { NextRequest, NextResponse } from "next/server";
import { jsonError, zulipGet } from "../_util";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const email = sp.get("email");
    const userId = sp.get("user_id");

    if (email || userId) {
      const id = email ?? userId!;
      const d = await zulipGet(`/users/${encodeURIComponent(id)}/presence`);
      // Normalize a single user's presence
      let status: "active" | "away" | "offline" = "offline";
      let lastActiveTs: number | undefined;
      const agg = d?.presence?.aggregated;
      if (agg) {
        status = (agg.status as any) || status;
        if (agg.timestamp) lastActiveTs = Number(agg.timestamp) * 1000;
      }
      return NextResponse.json({ presence: status, lastActiveTs, raw: d });
    }

    const realm = await zulipGet("/realm/presence");
    return NextResponse.json({ raw: realm });
  } catch (e) {
    return jsonError(e);
  }
}
export const dynamic = "force-dynamic";
