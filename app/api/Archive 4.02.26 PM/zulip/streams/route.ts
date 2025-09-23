import { NextResponse } from "next/server";
import { zulipGet } from "../_util";

export async function GET() {
  // User's subscriptions (streams they’re subscribed to)
  const data = await zulipGet("/users/me/subscriptions");
  // Normalize: return [{id,name}...]
  const streams = (data.subscriptions || []).map((s: any) => ({ id: s.stream_id, name: s.name }));
  return NextResponse.json({ streams });
}
