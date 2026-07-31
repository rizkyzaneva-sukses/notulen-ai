import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const data: { isDone?: boolean; description?: string; owner?: string | null } = {};
  if (typeof body.isDone === "boolean") data.isDone = body.isDone;
  if (typeof body.description === "string") data.description = body.description.trim();
  if (body.owner === null) data.owner = null;
  else if (typeof body.owner === "string") data.owner = body.owner.trim();

  try {
    const item = await prisma.actionItem.update({
      where: { id },
      data,
    });
    return NextResponse.json({ actionItem: item });
  } catch {
    return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
  }
}
