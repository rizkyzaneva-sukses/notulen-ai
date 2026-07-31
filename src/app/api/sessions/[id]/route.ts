import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Category } from "@prisma/client";
import { CATEGORIES } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      transcript: true,
      summary: true,
      actionItems: { orderBy: { createdAt: "asc" } },
      mindMap: true,
      speakers: { orderBy: { speakerCode: "asc" } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  }

  const { toPublicPath } = await import("@/lib/storage");
  return NextResponse.json({
    session: {
      ...session,
      audioUrl: toPublicPath(session.filePath),
    },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const data: {
    title?: string;
    category?: Category | null;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim().slice(0, 200);
  }

  if (body.category === null || body.category === "") {
    data.category = null;
  } else if (typeof body.category === "string" && CATEGORIES.includes(body.category as never)) {
    data.category = body.category as Category;
  }

  try {
    const session = await prisma.session.update({
      where: { id },
      data,
    });
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
    }
    await prisma.session.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 });
  }
}
