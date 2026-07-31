import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueRegenerateSummary } from "@/lib/queue";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await prisma.session.findUnique({
    where: { id },
    include: { transcript: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  }
  if (!session.transcript) {
    return NextResponse.json(
      { error: "Transkrip belum ada — proses ulang sesi" },
      { status: 400 }
    );
  }

  await prisma.session.update({
    where: { id },
    data: { status: "SUMMARIZING", errorMessage: null },
  });

  await enqueueRegenerateSummary(id);

  return NextResponse.json({ ok: true });
}
