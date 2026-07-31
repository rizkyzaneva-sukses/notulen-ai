import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const speakerId = String(body.speakerId || "");
  const displayName = String(body.displayName || "").trim();

  if (!speakerId || !displayName) {
    return NextResponse.json({ error: "speakerId dan displayName wajib" }, { status: 400 });
  }

  const speaker = await prisma.speaker.findFirst({
    where: { id: speakerId, sessionId: id },
  });

  if (!speaker) {
    return NextResponse.json({ error: "Speaker tidak ditemukan" }, { status: 404 });
  }

  const updated = await prisma.speaker.update({
    where: { id: speakerId },
    data: { displayName: displayName.slice(0, 80) },
  });

  return NextResponse.json({ speaker: updated });
}
