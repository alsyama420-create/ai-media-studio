const MIN_FAKTA = 3;
const MIN_KATA = 90;
const MAKS_KATA = 130;
const DETIK_PER_KATA = 0.47;
const MODEL = ["gemini-flash-lite-latest", "gemini-3-flash-preview"];

export type Sumber = { judul_sumber: string; url: string; ringkasan: string };
type FaktaModel = { teks: string; sumber: string };
type NaskahModel = {
  hook: string;
  fakta: FaktaModel[];
  penutup: string;
  pengait: string;
};

function hitungKata(teks: string): number {
  return teks.split(/\s+/).filter(Boolean).length;
}

function buatPrompt(judul: string, nomor: number, sumber: Sumber[], catatan: string) {
  const daftar = sumber
    .map((s) => `JUDUL SUMBER: ${s.judul_sumber}\n${s.ringkasan.slice(0, 1500)}`)
    .join("\n\n---\n\n");
  return `Kamu penulis naskah video edukasi pendek berbahasa Indonesia.
Judul episode: "${judul}" (Part ${nomor}).
Tulis narasi untuk video 60 detik, total ${MIN_KATA} sampai ${MAKS_KATA} kata, yang MENJAWAB pertanyaan pada judul.

ATURAN:
- Gunakan HANYA informasi dari SUMBER di bawah. Jangan menambah fakta dari luar sumber.
- Abaikan sumber yang tidak relevan dengan judul episode.
- Bahasa santai, kalimat pendek dan mudah didengar. Jangan pakai tanda kurung, daftar, atau angka rumit.
- hook: satu kalimat pembuka yang memancing rasa ingin tahu.
- fakta: 3 sampai 5 kalimat. Setiap kalimat berisi satu fakta, dan "sumber" harus PERSIS sama dengan salah satu JUDUL SUMBER.
- penutup: satu kalimat.
- pengait: satu kalimat ajakan menonton Part ${nomor + 1}, dengan petunjuk topik lanjutan yang masih berkaitan.
${catatan}
Balas HANYA JSON dengan bentuk: {"hook":"","fakta":[{"teks":"","sumber":""}],"penutup":"","pengait":""}

SUMBER:
${daftar}`;
}

async function tanyaGemini(prompt: string) {
  const kunci = process.env.GEMINI_API_KEY;
  if (!kunci) {
    throw new Error("GEMINI_API_KEY tidak ditemukan. Cek web/.env.local lalu nyalakan ulang server.");
  }
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
            generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
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
      return { naskah: JSON.parse(teks) as NaskahModel, model };
    } catch (e) {
      galat.push(`${model}: ${e instanceof Error ? e.name : "error"}`);
    }
  }
  throw new Error(`Semua model Gemini gagal (${galat.join("; ")}).`);
}

export async function susunNaskah(judul: string, nomor: number, sumber: Sumber[]) {
  let catatan = "";
  let total = 0;
  for (let coba = 1; coba <= 2; coba++) {
    const hasil = await tanyaGemini(buatPrompt(judul, nomor, sumber, catatan));
    const n = hasil.naskah;
    const fakta = Array.isArray(n.fakta) ? n.fakta : [];
    const sahih = fakta.filter(
      (f) => f.teks?.trim() && sumber.some((s) => s.judul_sumber === f.sumber)
    );
    total =
      hitungKata(n.hook ?? "") +
      sahih.reduce((t, f) => t + hitungKata(f.teks), 0) +
      hitungKata(n.penutup ?? "") +
      hitungKata(n.pengait ?? "");

    if (sahih.length < MIN_FAKTA) {
      catatan = `PERBAIKAN: sebelumnya hanya ${sahih.length} fakta dengan nama sumber yang benar. Pastikan "sumber" sama persis dengan JUDUL SUMBER.`;
    } else if (total < MIN_KATA || total > MAKS_KATA) {
      catatan = `PERBAIKAN: sebelumnya ${total} kata. Wajib ${MIN_KATA} sampai ${MAKS_KATA} kata.`;
    } else {
      return {
        hook: n.hook,
        fakta: sahih.map((f) => ({
          teks: f.teks,
          sumber: f.sumber,
          url: sumber.find((s) => s.judul_sumber === f.sumber)?.url ?? "",
        })),
        penutup: n.penutup,
        pengait: n.pengait,
        jumlah_kata: total,
        perkiraan_detik: Math.round(total * DETIK_PER_KATA),
        dibuat_dengan: hasil.model,
      };
    }
  }
  throw new Error(
    `Naskah dari Gemini tidak memenuhi aturan (terakhir ${total} kata, wajib ${MIN_KATA}-${MAKS_KATA}, minimal ${MIN_FAKTA} fakta bersumber).`
  );
}