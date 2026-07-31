import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueSessionProcess } from "@/lib/queue";

/**
 * Recall.ai webhook — re-trigger processing when bot finishes (Fase 2)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  console.log("[webhook/recall]", JSON.stringify(body).slice(0, 500));

  const sessionId =
    body?.data?.bot?.metadata?.session_id ||
    body?.data?.metadata?.session_id ||
    body?.metadata?.session_id ||
    body?.session_id;

  const event = body?.event || body?.type || "";

  if (
    sessionId &&
    (String(event).includes("done") ||
      String(event).includes("complete") ||
      String(event).includes("recording.done") ||
      body?.data?.status?.code === "done")
  ) {
    const session = await prisma.session.findUnique({ where: { id: String(sessionId) } });
    if (session && session.status !== "DONE") {
      await prisma.session.update({
        where: { id: session.id },
        data: { status: "QUEUED", errorMessage: null },
      });
      await enqueueSessionProcess(session.id);
    }
  }

  return NextResponse.json({ ok: true });
}
