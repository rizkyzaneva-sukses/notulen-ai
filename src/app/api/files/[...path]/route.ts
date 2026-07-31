import { NextRequest, NextResponse } from "next/server";
import { getUploadRoot } from "@/lib/storage";
import { readFile, access } from "fs/promises";
import path from "path";
import { constants } from "fs";

type Ctx = { params: Promise<{ path: string[] }> };

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
  aac: "audio/aac",
};

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { path: parts } = await ctx.params;
  if (!parts?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // prevent path traversal
  if (parts.some((p) => p === ".." || p.includes("\0"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const root = getUploadRoot();
  const filePath = path.join(root, ...parts);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(root))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    await access(resolved, constants.R_OK);
    const buf = await readFile(resolved);
    const ext = path.extname(resolved).slice(1).toLowerCase();
    return new NextResponse(buf, {
      headers: {
        "content-type": MIME[ext] || "application/octet-stream",
        "content-disposition": `inline; filename="${path.basename(resolved)}"`,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
