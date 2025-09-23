// app/api/zulip/users/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { zulipPostForm } from "../../_util";

// POST /api/zulip/users/update
// Body JSON example:
// { "user_id": 123, "full_name": "New Name", "status_text": "Heads down", "away": true }
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Whitelist of common fields; unknown keys are passed through too.
  // Tweak as needed for your server’s /update-user contract.
  const allowed = [
    "user_id",
    "email",
    "full_name",
    "timezone",
    "role",
    "status_text",
    "away",
    "emoji_name",
    "emoji_code",
  ] as const;

  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.includes(k as any) || true) {
      // forward everything by default
      form[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }

  // Your server exposes: /api/update-user
  const data = await zulipPostForm("/update-user", form);
  return NextResponse.json(data);
}
