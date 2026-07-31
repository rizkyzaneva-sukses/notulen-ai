import { mkdir, writeFile, unlink, readFile, access, rm } from "fs/promises";
import path from "path";
import { constants } from "fs";

export function getUploadRoot(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

export function getSessionDir(sessionId: string): string {
  return path.join(getUploadRoot(), sessionId);
}

export async function ensureSessionDir(sessionId: string): Promise<string> {
  const dir = getSessionDir(sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveUpload(
  sessionId: string,
  filename: string,
  data: Buffer
): Promise<string> {
  const dir = await ensureSessionDir(sessionId);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(dir, safeName);
  await writeFile(filePath, data);
  return filePath;
}

export async function readUpload(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

export async function deleteUpload(filePath: string): Promise<void> {
  try {
    await access(filePath, constants.F_OK);
    await unlink(filePath);
  } catch {
    // ignore missing
  }
}

export async function deleteSessionFiles(sessionId: string): Promise<void> {
  const root = path.resolve(getUploadRoot());
  const dir = path.resolve(getSessionDir(sessionId));
  if (!dir.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid session storage path");
  }
  await rm(dir, { recursive: true, force: true });
}

export function toPublicPath(absolutePath: string | null | undefined): string | null {
  if (!absolutePath) return null;
  const root = getUploadRoot();
  if (absolutePath.startsWith(root)) {
    const rel = absolutePath.slice(root.length).replace(/\\/g, "/");
    return `/api/files${rel.startsWith("/") ? rel : `/${rel}`}`;
  }
  return null;
}
