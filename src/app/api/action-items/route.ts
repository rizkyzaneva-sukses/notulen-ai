import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const items = await prisma.actionItem.findMany({
    orderBy: [{ isDone: "asc" }, { createdAt: "desc" }],
    include: {
      session: { select: { id: true, title: true, category: true } },
    },
    take: 200,
  });
  return NextResponse.json({ actionItems: items });
}
