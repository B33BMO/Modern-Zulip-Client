// app/api/zulip/users/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { jsonError, zulipPostForm } from "../../_util";

/**
 * Minimal user update bridge:
 * - status_text / away -> POST /users/me/status
 * - otherwise -> PATCH /users/me/settings  (we emulate via POST form 'PATCH override')
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    if ("status_text" in body || "away" in body) {
      const payload: Record<string, string> = {};
      if (body.status_text != null) payload.status_text = String(body.status_text);
      if (body.away != null) payload.away = body.away ? "true" : "false";
      const data = await zulipPostForm("/users/me/status", payload);
      return NextResponse.json(data);
    }

    // Fallback: settings. Zulip expects PATCH; most installations accept form with 'op'.
    const payload: Record<string, string> = {};
    Object.entries(body).forEach(([k, v]) => (payload[k] = String(v)));
    payload.op = "patch";
    const data = await zulipPostForm("/users/me/settings", payload);
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e);
  }
}
export const dynamic = "force-dynamic";
