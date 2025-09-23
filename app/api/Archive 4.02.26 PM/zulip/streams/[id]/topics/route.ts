import { NextResponse } from "next/server";
import { zulipGet } from "../../../_util";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const data = await zulipGet(`/users/me/${params.id}/topics?include_muted=true`);
  // name + last message id (max_id) are returned; we keep streamId for the UI
  const topics = (data.topics || []).map((t: any) => ({
    id: Number(t.max_id) || Math.abs(hashString(`${params.id}:${t.name}`)), // fallback stable-ish id
    name: t.name,
    streamId: Number(params.id),
  }));
  return NextResponse.json({ topics });
}

// tiny stable fallback id helper (only used if max_id missing)
function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
