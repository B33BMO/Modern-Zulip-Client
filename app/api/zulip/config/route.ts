// app/api/zulip/config/route.ts
import { NextRequest, NextResponse } from "next/server";

const EMAIL = "zulip_email";
const KEY   = "zulip_key";
const BASE  = "zulip_base";


const cookieOpts = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: true as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60, // 30 days
};

export async function GET(req: NextRequest) {
  const email = req.cookies.get(EMAIL)?.value;
  const key = req.cookies.get(KEY)?.value;
  const base = req.cookies.get(BASE)?.value;
  const configured = !!(email && key && base);
  return NextResponse.json({ configured, email: email ?? null, base: base ?? null });
}

export async function POST(req: NextRequest) {
  try {
    const { email, key, base } = await req.json();
    if (!email || !key || !base) {
      return NextResponse.json({ ok: false, error: "Missing email, key or base" }, { status: 400 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(EMAIL, String(email), cookieOpts);
    res.cookies.set(KEY,   String(key),   cookieOpts);
    res.cookies.set(BASE,  String(base).replace(/\/$/, ""), cookieOpts);
    return res;
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  const expired = { ...cookieOpts, maxAge: 0 };
  res.cookies.set(EMAIL, "", expired as any);
  res.cookies.set(KEY,   "", expired as any);
  res.cookies.set(BASE,  "", expired as any);
  return res;
}

export const dynamic = "force-dynamic";
