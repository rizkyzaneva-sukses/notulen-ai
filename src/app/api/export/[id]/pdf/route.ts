import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CATEGORY_LABELS, formatDate, SOURCE_LABELS } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Lightweight HTML export printable as PDF from browser.
 * (True PDF server-side would need puppeteer — keep simple for MVP)
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      summary: true,
      actionItems: true,
      speakers: true,
      transcript: true,
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const keyPoints = (session.summary?.keyPoints as string[]) || [];
  const decisions = (session.summary?.decisions as string[]) || [];

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(session.title)} — Notulen AI</title>
<style>
  body { font-family: Georgia, serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #111; line-height: 1.55; }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
  .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }
  h2 { font-size: 1.15rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; margin-top: 1.75rem; }
  ul { padding-left: 1.25rem; }
  li { margin: 0.35rem 0; }
  .ai { margin: 0.5rem 0; padding: 0.5rem 0.75rem; background: #f6f6f6; border-radius: 6px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(session.title)}</h1>
  <div class="meta">
    ${escapeHtml(formatDate(session.createdAt))} ·
    ${escapeHtml(SOURCE_LABELS[session.sourceType] || session.sourceType)}
    ${session.category ? ` · ${escapeHtml(CATEGORY_LABELS[session.category] || session.category)}` : ""}
  </div>

  <h2>Executive Summary</h2>
  <p>${escapeHtml(session.summary?.executiveSummary || "—")}</p>

  <h2>Poin Penting</h2>
  <ul>${keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("") || "<li>—</li>"}</ul>

  <h2>Keputusan</h2>
  <ul>${decisions.map((p) => `<li>${escapeHtml(p)}</li>`).join("") || "<li>Tidak ada keputusan tercatat</li>"}</ul>

  <h2>Action Items</h2>
  ${
    session.actionItems.length
      ? session.actionItems
          .map(
            (a) =>
              `<div class="ai"><strong>${a.isDone ? "✓" : "○"}</strong> ${escapeHtml(a.description)}${
                a.owner ? ` <em>(${escapeHtml(a.owner)})</em>` : ""
              }${a.dueDate ? ` — ${escapeHtml(String(a.dueDate).slice(0, 10))}` : ""}</div>`
          )
          .join("")
      : "<p>Tidak ada action item</p>"
  }

  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
