import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueSessionProcess } from "@/lib/queue";
import { saveUpload } from "@/lib/storage";
import {
  ALLOWED_EXT,
  ALLOWED_MIME,
  detectSourceFromUrl,
  isValidUrl,
} from "@/lib/utils";
import type { Category, SourceType } from "@prisma/client";
import { randomUUID } from "crypto";
import path from "path";

export const runtime = "nodejs";

const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 500);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const category = searchParams.get("category") as Category | null;
  const status = searchParams.get("status");

  const sessions = await prisma.session.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { transcript: { rawText: { contains: q, mode: "insensitive" } } },
              {
                summary: {
                  executiveSummary: { contains: q, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      summary: {
        select: { executiveSummary: true },
      },
      _count: { select: { actionItems: true } },
    },
    take: 100,
  });

  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      return await handleUpload(req);
    }
    return await handleJson(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/sessions", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function handleJson(req: NextRequest) {
  const body = await req.json();
  const url = String(body.url || "").trim();
  const title = String(body.title || "").trim();
  const sourceTypeOverride = body.sourceType as SourceType | undefined;

  if (!url || !isValidUrl(url)) {
    return NextResponse.json({ error: "URL tidak valid" }, { status: 400 });
  }

  const detected = detectSourceFromUrl(url);
  if (!detected || (sourceTypeOverride && sourceTypeOverride !== detected)) {
    return NextResponse.json(
      { error: "Jenis sumber tidak cocok dengan URL" },
      { status: 400 }
    );
  }
  const sourceType: SourceType = detected;

  if (sourceType === "MEETING_BOT" && !process.env.RECALL_AI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Meeting bot (Fase 2) belum dikonfigurasi. Set RECALL_AI_API_KEY atau upload rekaman manual.",
      },
      { status: 400 }
    );
  }

  const defaultTitle =
    title ||
    (sourceType === "YOUTUBE"
      ? "YouTube"
      : sourceType === "LOOM"
        ? "Loom"
        : sourceType === "MEETING_BOT"
          ? "Meeting Online"
          : "Sesi Baru");

  const session = await prisma.session.create({
    data: {
      title: defaultTitle,
      sourceType,
      sourceUrl: url,
      status: "QUEUED",
    },
  });

  try {
    await enqueueSessionProcess(session.id);
  } catch (err) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Queue tidak tersedia: ${message}` },
      { status: 503 }
    );
  }

  return NextResponse.json({ session }, { status: 201 });
}

async function handleUpload(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const titleField = form.get("title");
  const title = typeof titleField === "string" ? titleField.trim() : "";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File wajib diisi" }, { status: 400 });
  }

  const maxBytes = MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File terlalu besar (maks ${MAX_MB}MB)` },
      { status: 400 }
    );
  }

  const ext = path.extname(file.name).slice(1).toLowerCase();
  const mimeOk = !file.type || ALLOWED_MIME.has(file.type) || file.type.startsWith("audio/") || file.type.startsWith("video/");
  const extOk = ALLOWED_EXT.has(ext);

  if (!mimeOk && !extOk) {
    return NextResponse.json(
      { error: "Format tidak didukung. Gunakan mp3, wav, m4a, mp4, webm." },
      { status: 400 }
    );
  }

  const sessionId = randomUUID().replace(/-/g, "").slice(0, 24);
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = await saveUpload(sessionId, file.name, buffer);

  const session = await prisma.session.create({
    data: {
      id: sessionId,
      title: title || file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Upload",
      sourceType: "UPLOAD",
      filePath,
      fileName: file.name,
      mimeType: file.type || null,
      status: "QUEUED",
    },
  });

  try {
    await enqueueSessionProcess(session.id);
  } catch (err) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Queue tidak tersedia: ${message}` },
      { status: 503 }
    );
  }

  return NextResponse.json({ session }, { status: 201 });
}
