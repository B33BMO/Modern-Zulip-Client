// app/api/zulip/streams/[id]/topics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { jsonError, zulipGet } from "../../../_util";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // <-- params is now a Promise
) {
  try {
    const { id } = await ctx.params;        // <-- await it
    const streamId = Number(id);

    const d = await zulipGet(`/users/me/${streamId}/topics`);
    const topics = (d.topics || []).map((t: any) => ({
      id:
        typeof t.max_id === "number"
          ? Number(t.max_id)
          : Math.abs(
              String(t.name || "")
                .split("")
                .reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
            ),
      name: String(t.name),
      streamId,
    }));

    return NextResponse.json({ topics });
  } catch (e) {
    return jsonError(e);
  }
}

export const dynamic = "force-dynamic";
