# Notulen AI

Personal AI recap tool: meeting online/offline, telepon, YouTube/Loom → resume 4 bagian + mind map.

Mobile-first PWA · Next.js 15 · Prisma · PostgreSQL · BullMQ · AssemblyAI · Claude

## Fitur

### Fase 1 (MVP)
- Upload audio/video → STT (AssemblyAI + diarization) → Resume + Mind Map
- Paste YouTube (caption dulu, fallback STT)
- Paste Loom (scrape transcript)
- Auth PIN (iron-session)
- Riwayat, full-text search, tag 5 Mahkota
- Export Markdown / PDF print / download audio
- Push notification (VAPID)
- Async pipeline: `QUEUED → TRANSCRIBING → TRANSCRIBED → SUMMARIZING → DONE`

### Fase 2
- Meeting bot Recall.ai (Zoom/Meet/Teams) — transkrip tetap AssemblyAI
- In-app recorder (`/record`)

### Fase 3
- Action item checklist lintas sesi (`/actions`)
- Hook Telegram/n8n (siap diintegrasikan)

## Quick start (local)

```bash
# 1. Dependencies
npm install
node scripts/generate-icons.mjs

# 2. Infra
docker compose up -d postgres redis

# 3. Env
cp .env.example .env
# isi SESSION_SECRET, ADMIN_PIN, STT_API_KEY, LLM_API_KEY, ...

# 4. DB
npx prisma db push

# 5. Run (2 terminal)
npm run dev
npm run worker
```

Buka http://localhost:3000 — login dengan `ADMIN_PIN`.

## Environment

Lihat `.env.example`. Semua provider AI via env (ganti tanpa ubah kode).

| Var | Keterangan |
|-----|------------|
| `SESSION_SECRET` | min 32 karakter |
| `ADMIN_PIN` | PIN login |
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Redis BullMQ |
| `STT_PROVIDER` / `STT_API_KEY` | default `assemblyai` |
| `LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Anthropic atau OpenAI-compatible |
| `RECALL_AI_*` | Fase 2 |
| `VAPID_*` | Web Push (`npx web-push generate-vapid-keys`) |

## Deploy EasyPanel (VPS)

1. **postgres** — PostgreSQL 16, hostname internal `postgres`
2. **redis** — Redis 7, hostname `redis`
3. **notulen-ai** (app)
   - Build: `npm ci && npx prisma generate && npm run build`
   - Start: `npx prisma db push --skip-generate && npm start`
   - Port 3000 · volume `/app/uploads`
   - Domain: `notulen.maulanacorp.my.id`
4. **notulen-worker**
   - Start: `npm run worker`
   - Volume shared `/app/uploads`
   - Env sama dengan app

## Struktur

```
src/
  app/                 # App Router pages + API
  components/          # UI
  lib/
    stt/               # STT providers (AssemblyAI)
    llm/               # LLM providers (Anthropic / OpenAI-compat)
    sources/           # YouTube, Loom, Recall
    process-session.ts # pipeline worker logic
    queue.ts / auth / storage / push
worker/index.ts        # BullMQ worker entry
prisma/schema.prisma
```

## Resume format (wajib)

1. Executive Summary  
2. Poin Penting  
3. Keputusan  
4. Action Items  

## Catatan

- Tidak ada auto-intercept panggilan telepon (legal + OS restriction) — upload manual.
- Meeting online: STT selalu AssemblyAI, bukan engine Recall.
- File max 500MB.
