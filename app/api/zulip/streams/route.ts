// app/api/zulip/streams/route.ts
import { NextResponse } from "next/server";
import { jsonError, zulipGet } from "../_util";

export async function GET() {
  try {
    const d = await zulipGet("/streams");
    const streams = (d.streams || []).map((s: any) => ({
      id: s.stream_id,
      name: s.name,
    }));
    return NextResponse.json({ streams });
  } catch (e) {
    return jsonError(e);
  }
}
export const dynamic = "force-dynamic";
  