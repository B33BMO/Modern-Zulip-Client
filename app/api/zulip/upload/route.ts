// app/api/zulip/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ApiError, readConfig } from "../_util";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const cfg = await readConfig();
    if (!cfg) throw new ApiError(401, "Zulip is not configured");

    const form = await req.formData();
    // Zulip expects the field name 'file'
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const upstream = new FormData();
    upstream.set("file", file, (file as any)?.name ?? "upload.bin");

    const res = await fetch(`${cfg.base}/api/v1/user_uploads`, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${cfg.email}:${cfg.key}`).toString("base64"),
      },
      body: upstream,
      cache: "no-store",
    });

    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!res.ok) {
      const msg = data?.msg || text.slice(0, 200) || `${res.status} ${res.statusText}`;
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    // Zulip returns { uri: "/user_uploads/..." }
    return NextResponse.json({ uri: data.uri });
  } catch (e: any) {
    const status = e?.status ?? 500;
    const msg = e?.message || "Upload error";
    return NextResponse.json({ error: msg }, { status });
  }
}
