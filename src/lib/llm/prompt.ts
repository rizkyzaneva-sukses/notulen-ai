export function buildSummaryPrompt(input: {
  transcript: string;
  speakers?: Array<{ code: string; name: string }>;
  sourceHint?: string;
}): string {
  const speakerInfo =
    input.speakers && input.speakers.length > 0
      ? input.speakers.map((s) => `${s.code} = ${s.name}`).join(", ")
      : "Speaker labels as in transcript";

  return `Kamu adalah asisten notulen profesional. Analisis transkrip berikut dan hasilkan resume terstruktur dalam Bahasa Indonesia (kecuali istilah teknis yang lebih natural dalam bahasa aslinya).

Sumber: ${input.sourceHint || "percakapan/meeting"}
Pembicara: ${speakerInfo}

WAJIB kembalikan HANYA valid JSON (tanpa markdown fence) dengan struktur persis:

{
  "title": "judul singkat sesi (max 80 karakter)",
  "executiveSummary": "3-5 kalimat ringkasan eksekutif",
  "keyPoints": ["poin penting 1", "poin penting 2"],
  "decisions": ["keputusan 1"] atau [],
  "actionItems": [
    {
      "description": "tugas yang harus dikerjakan",
      "owner": "nama/speaker jika diketahui, atau null",
      "dueDate": "YYYY-MM-DD jika disebutkan, atau null"
    }
  ],
  "mindMap": {
    "id": "root",
    "label": "Topik Utama",
    "children": [
      {
        "id": "n1",
        "label": "Cabang 1",
        "children": [
          { "id": "n1-1", "label": "Sub poin" }
        ]
      }
    ]
  }
}

Aturan:
- executiveSummary wajib 3-5 kalimat.
- keyPoints: bullet poin penting, maksimal 12 item.
- decisions: hanya keputusan yang benar-benar diambil; kosongkan array jika tidak ada.
- actionItems: hanya tugas yang actionable; owner dari speaker diarization jika disebut.
- mindMap: hierarki dari topik utama → subtopik → detail; id unik string.
- Jangan mengarang fakta di luar transkrip.

--- TRANSKRIP ---
${input.transcript.slice(0, 120000)}
--- AKHIR TRANSKRIP ---`;
}
