import { NextRequest, NextResponse } from "next/server";

function basicAuthHeader(email: string, apiKey: string) {
  const token = Buffer.from(`${email}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

export async function GET(req: NextRequest) {
  const c = req.cookies;
  const configured =
    !!c.get("zulip_email")?.value &&
    !!c.get("zulip_key")?.value &&
    !!c.get("zulip_base")?.value;
  return NextResponse.json({ configured });
}

export async function POST(req: NextRequest) {
  try {
    const { email, apiKey, baseUrl } = await req.json();

    if (!email || !apiKey || !baseUrl) {
      return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
    }

    const u = new URL("/api/v1/users/me", baseUrl);

    const res = await fetch(u.toString(), {
      headers: {
        authorization: basicAuthHeader(email, apiKey),
      },
      cache: "no-store",
    });

    if (!res.ok) {
      let msg = "Login failed";
      try {
        const j = await res.json();
        msg = j?.msg || msg;
      } catch {}
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    // Set httpOnly cookies so server routes (proxy) can use them.
    const out = NextResponse.json({ ok: true });
    const opts = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    };
    out.cookies.set("zulip_email", email, opts);
    out.cookies.set("zulip_key", apiKey, opts);
    out.cookies.set("zulip_base", baseUrl.replace(/\/+$/, ""), opts);
    return out;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
