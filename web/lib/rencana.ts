const MODEL = ["gemini-flash-lite-latest", "gemini-3-flash-preview"];

export type EpisodeLama = { nomor_episode: number; judul: string };
export type Rencana = { judul: string; catatan_kesinambungan: string };

export async function rencanakanEpisode(
  tema: string,
  judulSerial: string,
  lama: EpisodeLama[],
  pengait: string,
  catatan: string
) {
  const kunci = process.env.GEMINI_API_KEY;
  if (!kunci) {
    throw new Error("GEMINI_API_KEY tidak ditemukan. Cek web/.env.local lalu nyalakan ulang server.");
  }
  const nomor = lama.length + 1;
  const daftar = lama.map((e) => `Part ${e.nomor_episode}: ${e.judul}`).join("\n");

  const prompt = `Kamu perencana konten serial video edukasi pendek berbahasa Indonesia.
Serial: "${judulSerial}". Tema: ${tema}.

EPISODE YANG SUDAH ADA:
${daftar || "(belum ada)"}

AJAKAN DI AKHIR EPISODE TERAKHIR: ${pengait || "(tidak ada)"}

Usulkan SATU judul untuk Part ${nomor}.
ATURAN:
- Judul harus melanjutkan cerita episode sebelumnya dan nyambung dengan ajakan di atas.
- Topiknya BARU. Jangan mengulang topik atau judul episode yang sudah ada.
- Judul berbahasa Indonesia, maksimal 90 karakter, boleh berbentuk pertanyaan.
- Judul harus memuat kata benda utama topik (misalnya "mimpi", "kafein", "otak") supaya bisa dicari di Wikipedia Indonesia.
- catatan_kesinambungan: satu atau dua kalimat yang menjelaskan hubungan dengan episode sebelumnya.
${catatan}
Balas HANYA JSON: {"judul":"","catatan_kesinambungan":""}`;

  const galat: string[] = [];
  for (const model of MODEL) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(60000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": kunci },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
          }),
        }
      );
      if (!res.ok) {
        galat.push(`${model}: status ${res.status}`);
        continue;
      }
      const data = await res.json();
      const parts = (data.candidates?.[0]?.content?.parts ?? []) as { text?: string }[];
      const teks = parts.map((p) => p.text ?? "").join("").replace(/```json|```/g, "").trim();
      const hasil = JSON.parse(teks) as Rencana;
      return { rencana: hasil, model };
    } catch (e) {
      galat.push(`${model}: ${e instanceof Error ? e.name : "error"}`);
    }
  }
  throw new Error(`Semua model Gemini gagal (${galat.join("; ")}).`);
}