# PRD — Notulen AI

*Personal AI recap tool: meeting online, meeting offline, telepon, video YouTube/Loom → resume komprehensif + mind map*

---

## 1. Overview

Rizky butuh satu tempat untuk mengubah semua percakapan penting — meeting online, meeting offline/tatap muka, telepon, dan video referensi (YouTube/Loom) — menjadi resume komprehensif berisi executive summary, poin penting, keputusan, action items, dan mind map visual, tanpa harus manual mencatat atau nonton/dengar ulang.

Aplikasi ini personal-use (single user: Rizky), diakses lewat mobile-first PWA, dengan proses rekam-transkrip-resume berjalan asynchronous di background server. Bot meeting online (Recall.ai) berjalan independen dari device Rizky, sehingga meeting bisa dihadiri dari HP/Tablet/PC manapun tanpa mempengaruhi rekaman.

**Masalah yang diselesaikan:** waktu hilang untuk mencatat manual lintas 5 Mahkota (Pebisnis, Suami, Anak, Ayah, Investor), dan insight/keputusan penting sering tidak terdokumentasi rapi.

**Alternatif yang dipertimbangkan:** Plaud Note Pro (~Rp3jt device + Rp4jt/tahun langganan). Solusi ini jauh lebih hemat (~Rp260rb/bulan pay-as-you-go, tanpa hardware tambahan) dan sepenuhnya milik sendiri.

---

## 2. Requirements

- **Aksesibilitas:** Mobile-first Progressive Web App (PWA) — installable ke home screen HP, tetap bisa dibuka dari browser PC/Tablet
- **Pengguna:** Single-user (hanya Rizky). Tidak ada role/multi-tenant
- **Auth:** iron-session dengan single admin login (password/PIN sederhana)
- **Data Input:** 4 sumber yang dipetakan ke 3 jalur pemrosesan (lihat §3)
- **Export:** Copy teks/Markdown, export PDF, download audio asli, (Fase 3) push action items ke Telegram via n8n+WAHA
- **Constraint khusus:**
  - Tidak membangun call-recording engine sendiri (tidak auto-intercept panggilan telepon/WA) — pertimbangan legal (UU ITE Pasal 31) dan teknis (restriksi Android/iOS terhadap call audio pihak ketiga). Rekaman telepon selalu upload manual dari fitur native Xiaomi HyperOS
  - Semua proses berat (STT + summary) harus asynchronous — user tidak menunggu di layar
  - Semua provider AI dikonfigurasi via `.env` — bisa ganti tanpa ubah kode

---

## 3. Core Features

### FASE 1 — MVP (dibangun & dipakai duluan)

#### 3.1 Multi-Source Input & Auto-Pipeline
Empat sumber input dengan jalur pemrosesan berbeda:

| Sumber | Jalur Pemrosesan |
|---|---|
| Upload file audio/video (mp3, wav, m4a, mp4) | STT (AssemblyAI) → Resume (LLM) |
| Paste link YouTube | Cek caption dulu: ada → langsung Resume. Tidak ada → download audio → STT → Resume |
| Paste link Loom | Ambil transcript dari share page → Resume |
| Paste link Zoom/Meet/Teams | Recall.ai bot join → download audio → STT → Resume |

Validasi input di awal (format file, URL valid, ukuran file). Status proses transparan ke user: `QUEUED → PROCESSING → DONE / FAILED`.

#### 3.2 Speech-to-Text dengan Speaker Diarization
- STT default: **AssemblyAI Universal-3.5 Pro** ($0.21/jam) + speaker diarization ($0.02/jam) = $0.23/jam total
- Output: transkrip dengan label pembicara (Speaker A, Speaker B, dst) yang bisa di-rename user
- Bahasa: auto-detect (support 18 bahasa termasuk Indonesia + code-switching)
- Provider-agnostic: interface abstrak, bisa switch ke Whisper/Deepgram via env config

#### 3.3 Resume Generator (LLM)
Dari transkrip, generate resume dengan **format konsisten wajib 4 bagian**:
- **Executive Summary** (3-5 kalimat)
- **Poin Penting** (bullet list)
- **Keputusan yang Diambil** (jika ada)
- **Action Items** — deskripsi, owner (dari speaker diarization), deadline (jika disebutkan)

Default model: **Claude Sonnet 5** (`claude-sonnet-5`). Provider-agnostic via env config (LLM_PROVIDER, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) — support Anthropic native + provider OpenAI-compatible.

#### 3.4 Mind Map Generator
- Dari struktur Poin Penting + sub-topik yang sudah digenerate LLM, konversi jadi struktur node/branch
- Render visual mind map interaktif (zoom, pan, expand/collapse) — reuse pattern **MindFlow** yang sudah dibangun (simple-mind-map + React Flow)
- Bisa export sebagai PNG atau tetap interaktif di dalam app

#### 3.5 Riwayat & Pencarian
- List semua sesi dengan tanggal, durasi, sumber, status, thumbnail (jika video)
- Full-text search di transkrip & resume
- Tag per sesi sesuai **5 Mahkota** (`PEBISNIS`, `SUAMI`, `ANAK`, `AYAH`, `INVESTOR`) — manual, opsional
- Filter riwayat by kategori 5 Mahkota

---

### FASE 2 — Setelah Fase 1 stabil dipakai harian

#### 3.6 Meeting Bot Otomatis (Recall.ai)
- Paste link Zoom/Google Meet/Microsoft Teams → bot virtual auto-join sebagai peserta
- Bot ambil audio, transkrip diproses tetap lewat AssemblyAI (bukan engine bawaan Recall) — supaya kualitas transkrip konsisten dengan sumber lain
- Notifikasi push ke PWA saat resume siap setelah meeting selesai
- Biaya: $0.50/jam rekaman (Recall.ai Pay-As-You-Go, tanpa biaya bulanan)

#### 3.7 In-App Recorder
- Rekam langsung via mic HP untuk meeting tatap muka/offline
- Kontrol start/pause/stop, waveform indicator
- Auto-save ke draft jika app tertutup tanpa sengaja

---

### FASE 3 — Opsional / Future

#### 3.8 Action Item Tracker
- Checklist lintas semua sesi, bisa dicentang selesai
- Reminder otomatis via Telegram (reuse infra n8n + WAHA existing di VPS)

#### 3.9 Kalender & Auto-Trigger
- Integrasi Google Calendar
- Auto-detect link meeting dari undangan kalender → auto-jadwalkan bot Recall.ai tanpa input manual

---

## 4. User Flow

### Flow Utama — Upload/Link → Resume + Mind Map

1. User buka PWA di HP, login PIN
2. Tap **"Tambah Sesi Baru"**
3. Pilih sumber: **Upload File** / **Paste Link YouTube** / **Paste Link Loom** / (Fase 2) **Link Meeting Online**
4. Sistem validasi input di frontend
5. Session dibuat dengan status `QUEUED`, user langsung dapat konfirmasi & kembali ke home
6. Background worker jalan async:
   - Extract audio (jika perlu) → status `TRANSCRIBING`
   - STT via AssemblyAI → status `TRANSCRIBED`
   - Generate resume via LLM → status `SUMMARIZING`
   - Generate mind map struktur → status `DONE`
7. Push notification ke PWA: **"Resume siap"**
8. User buka detail sesi: baca Summary, Poin Penting, Action Items, buka Mind Map, tag kategori 5 Mahkota, export PDF

### Edge Cases

- Audio kualitas rendah/noise → tetap diproses, segmen confidence rendah diberi flag visual
- Video YouTube tanpa caption → fallback ke STT, tampilkan estimasi waktu proses lebih lama
- Upload terputus di tengah → chunk upload dengan resume capability
- Link Loom private/gagal diakses → error message jelas, bukan silent fail
- File durasi sangat panjang (>2 jam) → tetap diproses, estimasi waktu ditampilkan
- LLM gagal generate resume (API error/quota) → transkrip tetap tersimpan, tombol **"Generate Ulang"** aktif
- Mind map gagal render → fallback ke tampilan bullet-tree
- Speaker diarization salah label → user bisa rename speaker (Speaker A → "Rizky", dst) langsung dari UI

---

## 5. Architecture

```mermaid
sequenceDiagram
    participant User
    participant PWA as Mobile PWA (Next.js)
    participant API as Next.js API Routes
    participant Queue as Job Queue (BullMQ)
    participant Worker as Background Worker
    participant Recall as Recall.ai (Fase 2)
    participant STT as AssemblyAI
    participant LLM as LLM (Claude Sonnet 5)
    participant DB as PostgreSQL
    participant Storage as File Storage

    User->>PWA: Upload file / paste link
    PWA->>API: POST /api/sessions
    API->>Storage: Simpan file (jika upload)
    API->>DB: Insert session (status=QUEUED)
    API->>Queue: Enqueue processing job
    API-->>PWA: 200 OK (job diterima)

    Note over Worker: Async processing

    Worker->>Queue: Ambil job
    Worker->>DB: Update status=TRANSCRIBING

    alt Sumber = Meeting Online
        Worker->>Recall: Trigger bot join
        Recall-->>Worker: Return audio URL
    end

    Worker->>STT: Kirim audio + speaker diarization
    STT-->>Worker: Return transkrip + speaker labels
    Worker->>DB: Simpan transcript (status=SUMMARIZING)

    Worker->>LLM: Prompt: generate 4-section resume + mind map struct
    LLM-->>Worker: Return resume + mind map JSON
    Worker->>DB: Simpan summary, action items, mind map (status=DONE)

    Worker->>PWA: Web Push notification
    User->>PWA: Buka & baca resume + mind map
```

---

## 6. Database Schema

```mermaid
erDiagram
    SESSIONS ||--o| TRANSCRIPTS : has
    SESSIONS ||--o| SUMMARIES : has
    SESSIONS ||--o{ ACTION_ITEMS : has
    SESSIONS ||--o| MIND_MAPS : has
    SESSIONS ||--o{ SPEAKERS : has

    SESSIONS {
        string id PK
        string title
        string source_type
        string source_url
        string file_path
        int duration_seconds
        string status
        string category
        string error_message
        datetime created_at
        datetime updated_at
    }

    TRANSCRIPTS {
        string id PK
        string session_id FK
        text raw_text
        json segments
        string language
        string stt_provider
        float confidence_avg
        datetime created_at
    }

    SPEAKERS {
        string id PK
        string session_id FK
        string speaker_code
        string display_name
    }

    SUMMARIES {
        string id PK
        string session_id FK
        text executive_summary
        json key_points
        json decisions
        string llm_provider
        string llm_model
        datetime generated_at
    }

    ACTION_ITEMS {
        string id PK
        string session_id FK
        string description
        string owner
        date due_date
        boolean is_done
        datetime created_at
    }

    MIND_MAPS {
        string id PK
        string session_id FK
        json structure
        datetime generated_at
    }
```

| Tabel | Fungsi |
|-------|--------|
| SESSIONS | Record induk tiap sesi, status proses, sumber, kategori 5 Mahkota |
| TRANSCRIPTS | Hasil transkrip mentah + segments (timestamp per kalimat) dari STT |
| SPEAKERS | Label pembicara (Speaker A, Speaker B) yang bisa di-rename user |
| SUMMARIES | Resume 4 bagian hasil LLM |
| ACTION_ITEMS | Daftar action item per sesi, bisa dicentang selesai |
| MIND_MAPS | Struktur JSON untuk render mind map interaktif |

**Enum values:**
- `source_type`: `UPLOAD`, `YOUTUBE`, `LOOM`, `MEETING_BOT` (Fase 2), `IN_APP_RECORD` (Fase 2)
- `status`: `QUEUED`, `TRANSCRIBING`, `TRANSCRIBED`, `SUMMARIZING`, `DONE`, `FAILED`
- `category` (nullable): `PEBISNIS`, `SUAMI`, `ANAK`, `AYAH`, `INVESTOR`

---

## 7. Design & Technical Constraints

### Tech Stack

**Application:**
- **Frontend:** Next.js 15 (App Router), PWA-enabled (manifest + service worker), Tailwind, mobile-first responsive
- **Backend:** Next.js API Routes
- **ORM:** Prisma
- **Database:** PostgreSQL (containerized di EasyPanel)
- **Auth:** iron-session (single admin PIN)
- **Job Queue:** BullMQ + Redis (background processing untuk STT + LLM)

**AI Providers (semua via env config):**
- **STT default:** AssemblyAI Universal-3.5 Pro + speaker diarization
- **LLM default:** Claude Sonnet 5 (`claude-sonnet-5`)
- **Meeting Bot:** Recall.ai API (Fase 2)
- **YouTube caption:** youtube-caption-extractor library
- **Loom transcript:** Loom share page scraper

**Mind Map:**
- simple-mind-map + React Flow (reuse pattern dari MindFlow)

**File Storage:**
- Local volume di VPS Tencent Cloud (mounted ke container EasyPanel)
- Path: `/app/uploads/{session-id}/{filename}`

**Deploy:**
- **EasyPanel** di VPS Tencent Cloud existing (43.129.38.56)
- Domain: subdomain baru di bawah `maulanacorp.my.id` (contoh: `notulen.maulanacorp.my.id`)
- SSL otomatis via EasyPanel/Let's Encrypt
- Reverse proxy via Traefik (bawaan EasyPanel)

### Environment Variables (via .env)

```env
# Auth
SESSION_SECRET=<random 32-char>
ADMIN_PIN=<PIN Rizky>

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/notulen_ai

# Redis (job queue)
REDIS_URL=redis://redis:6379

# STT Provider (provider-agnostic)
STT_PROVIDER=assemblyai
STT_API_KEY=<AssemblyAI key>

# LLM Provider (provider-agnostic — bisa Anthropic, OpenAI-compatible, dll)
LLM_PROVIDER=anthropic
LLM_BASE_URL=https://api.anthropic.com
LLM_API_KEY=<Anthropic key>
LLM_MODEL=claude-sonnet-5

# Meeting Bot (Fase 2)
RECALL_AI_API_KEY=<Recall.ai key>
RECALL_AI_WEBHOOK_URL=https://notulen.maulanacorp.my.id/api/webhooks/recall

# Push Notifications
VAPID_PUBLIC_KEY=<generated>
VAPID_PRIVATE_KEY=<generated>
VAPID_SUBJECT=mailto:rizky@maulanacorp.my.id
```

### UI System
- Font Sans: `Geist Mono, ui-monospace, monospace`
- Font Mono: `JetBrains Mono, monospace`
- Mode: Dark (deep navy), mobile-first layout, mengikuti design system tool personal Rizky lainnya (Keuangan Pribadi, MindFlow)

### Naming Convention
- Label UI: Bahasa Indonesia
- Fungsi, variabel, komponen React: Bahasa Inggris / camelCase / PascalCase
- API routes: kebab-case (`/api/sessions`, `/api/webhooks/recall`)
- Enum values: UPPER_SNAKE_CASE

### Business Logic Hardcoded
- Resume WAJIB selalu 4 bagian tetap: **Executive Summary, Poin Penting, Keputusan, Action Items** — format konsisten setiap generate
- STT default AssemblyAI (bukan Whisper) — karena lebih murah + speaker diarization + lebih akurat untuk Bahasa Indonesia
- **Meeting online SELALU pakai AssemblyAI untuk transkrip**, bukan engine bawaan Recall.ai — biar konsistensi kualitas di semua sumber
- Rekaman telepon SELALU upload manual — tidak ada fitur auto-capture panggilan di dalam app ini (constraint permanen: legal + teknis)
- Bot meeting online (Fase 2) baru dibangun **setelah Fase 1 terbukti stabil dipakai harian**
- Semua provider AI dikonfigurasi via env — tidak ada API key hardcoded di kode

### Deployment ke EasyPanel

**Services yang perlu dibuat di EasyPanel:**

1. **App Service — `notulen-ai`**
   - Source: Git repo (GitHub)
   - Build: `npm ci && npx prisma generate && npm run build`
   - Start: `npm start`
   - Port: `3000`
   - Env vars: dari daftar di atas
   - Volume mount: `/app/uploads` untuk file storage persistent
   - Domain: `notulen.maulanacorp.my.id`

2. **App Service — `notulen-worker`**
   - Source: sama repo, entry point beda
   - Start: `npm run worker` (BullMQ worker process)
   - Env vars: sama dengan app service
   - Volume mount: `/app/uploads` (shared dengan app)
   - Tidak perlu domain (background service)

3. **Database Service — `postgres`**
   - Type: PostgreSQL 16
   - Volume: persistent untuk data
   - Internal hostname: `postgres`

4. **Cache Service — `redis`**
   - Type: Redis 7
   - Internal hostname: `redis`
   - Persistence: optional (data queue, bisa loss saat restart)

### Constraint Lain
- Semua proses berat harus async (BullMQ worker terpisah), tidak boleh blocking API request
- File upload maksimum 500MB per file (validasi frontend + backend)
- Retention: transkrip + resume disimpan permanen; file audio original bisa opsional dihapus setelah X hari (config)
- Backup PostgreSQL otomatis via EasyPanel scheduler (harian)

---

## 8. Estimasi Biaya Operasional

Asumsi volume moderate personal use:
- 15 jam/bulan meeting online (Recall.ai bot)
- 8 jam/bulan meeting offline (upload)
- 5 jam/bulan telepon (upload)
- 2 jam/bulan YouTube fallback (video tanpa caption)

| Komponen | Volume | Biaya |
|---|---|---|
| Recall.ai bot join (Fase 2) | 15 jam × $0.50 | ~$7.50 |
| AssemblyAI (30 jam total × $0.23) | 30 jam | ~$6.90 |
| Claude Sonnet 5 (resume + mind map) | ~53 sesi/bulan | ~$1.50–2.00 |
| YouTube caption library | open source | $0 |
| VPS EasyPanel (sudah ada, tidak nambah) | — | $0 |
| **Total per bulan** | | **~$16 (~Rp260rb)** |

**Fase 1 saja (belum ada Recall.ai bot):** ~$9-10/bulan (~Rp150rb)

**Sebagai perbandingan:**
- Plaud Note Pro: Rp3jt device + Rp4jt/tahun langganan ≈ Rp580rb/bulan (asumsi device dipakai 2 tahun)
- **Notulen AI: ~Rp260rb/bulan tanpa hardware tambahan, tanpa lock-in**

Cost bisa turun lebih jauh jika volume rendah — semua provider pay-as-you-go, tidak ada minimum commitment.

---

## 9. Roadmap Ringkas

| Fase | Fitur | Estimasi |
|---|---|---|
| **Fase 1** | Upload+YouTube+Loom → STT → Resume 4 bagian + Mind Map + Riwayat | Wajib dulu, ~4-6 minggu |
| **Fase 2** | Recall.ai meeting bot + In-app recorder | Setelah Fase 1 stabil ~1-2 bulan |
| **Fase 3** | Action item tracker (Telegram) + Kalender auto-trigger | Nice-to-have |

---

## 10. Checklist Sebelum Mulai Coding

- [ ] Setup akun AssemblyAI, ambil API key + $50 free credit
- [ ] Setup akun Recall.ai (skip dulu jika langsung mulai Fase 1)
- [ ] Buat subdomain `notulen.maulanacorp.my.id` di DNS
- [ ] Siapkan repo Git baru
- [ ] Confirm PRD ini dengan Rizky
- [ ] Setelah confirm → mulai scaffold Next.js 15 + Prisma + PostgreSQL
