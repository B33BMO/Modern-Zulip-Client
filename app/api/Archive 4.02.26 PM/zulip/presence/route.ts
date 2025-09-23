// app/api/zulip/presence/route.ts
import { NextRequest, NextResponse } from "next/server";
import { zulipGet } from "../_util";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const email = sp.get("email");
  const user_id = sp.get("user_id");
  if (!email && !user_id) {
    return NextResponse.json({ error: "email or user_id is required" }, { status: 400 });
  }

  const qs = email
    ? `?email=${encodeURIComponent(email)}`
    : `?user_id=${encodeURIComponent(String(user_id))}`;

  const data = await zulipGet(`/get-presence${qs}`);

  const agg = data?.presence?.aggregated?.status as string | undefined;
  const ts = data?.presence?.aggregated?.timestamp as number | undefined;
  const presence = agg === "active" ? "active" : agg === "idle" ? "away" : "offline";

  return NextResponse.json({ presence, lastActiveTs: ts, raw: data });
}
