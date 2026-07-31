import { NextRequest, NextResponse } from "next/server";
import { getSession, verifyPin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pin = String(body.pin || "").trim();

  if (!pin || !verifyPin(pin)) {
    return NextResponse.json({ error: "PIN salah" }, { status: 401 });
  }

  const session = await getSession();
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
