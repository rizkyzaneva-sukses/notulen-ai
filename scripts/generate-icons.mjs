import { writeFileSync, mkdirSync } from "fs";
import { deflateSync } from "zlib";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

/** Minimal PNG generator (RGBA) */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crc]);
}

function createPng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.42;
  const rInner = size * 0.28;

  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // deep navy bg circle + blue accent ring
      if (dist < rOuter) {
        if (dist > rInner && dist < rInner + size * 0.06) {
          raw[i] = 59;
          raw[i + 1] = 130;
          raw[i + 2] = 246;
          raw[i + 3] = 255;
        } else if (dist <= rInner) {
          // mic-ish vertical bar
          const inBar = Math.abs(dx) < size * 0.08 && dy > -size * 0.18 && dy < size * 0.12;
          const inStand = Math.abs(dx) < size * 0.03 && dy >= size * 0.12 && dy < size * 0.22;
          if (inBar || inStand) {
            raw[i] = 96;
            raw[i + 1] = 165;
            raw[i + 2] = 250;
            raw[i + 3] = 255;
          } else {
            raw[i] = 15;
            raw[i + 1] = 26;
            raw[i + 2] = 51;
            raw[i + 3] = 255;
          }
        } else {
          raw[i] = 10;
          raw[i + 1] = 18;
          raw[i + 2] = 36;
          raw[i + 3] = 255;
        }
      } else {
        raw[i] = 6;
        raw[i + 1] = 11;
        raw[i + 2] = 24;
        raw[i + 3] = 0;
      }
    }
  }

  const compressed = deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  writeFileSync(file, createPng(size));
  console.log("wrote", file);
}
