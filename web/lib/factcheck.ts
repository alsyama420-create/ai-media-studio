const MODEL = ["gemini-flash-lite-latest", "gemini-3-flash-preview"];

export type SumberCek = { judul_sumber: string; ringkasan: string };
export type HasilCek = { no: number; klaim: string; status: string; alasan: string };
type Jawaban = { no: number; status: string; alasan: string };

async function tanya(prompt: string) {
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
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
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
      return { jawaban: JSON.parse(teks) as Jawaban[], model };
    } catch (e) {
      galat.push(`${model}: ${e instanceof Error ? e.name : "error"}`);
    }
  }
  throw new Error(`Semua model Gemini gagal (${galat.join("; ")}).`);
}

export async function periksaKlaim(klaim: string[], sumber: SumberCek[]) {
  const daftarSumber = sumber
    .map((s) => `JUDUL SUMBER: ${s.judul_sumber}\n${s.ringkasan.slice(0, 3000)}`)
    .join("\n\n---\n\n");
  const daftarKlaim = klaim.map((k, i) => `${i + 1}. ${k}`).join("\n");

  const prompt = `Kamu pemeriksa fakta yang ketat. Periksa setiap KLAIM terhadap TEKS SUMBER di bawah.

ATURAN:
- Pakai HANYA teks sumber. Jangan pakai pengetahuan dari luar.
- "didukung": teks sumber menyatakan klaim itu dengan jelas, termasuk angka, sebab, dan akibatnya.
- "sebagian": hanya sebagian klaim yang ada di sumber, atau sumber menyebut hal serupa tetapi tidak sama.
- "tidak_didukung": klaim tidak ada di sumber, atau bertentangan dengan sumber.
- "alasan": satu kalimat pendek dalam bahasa Indonesia yang menyebut bagian sumber yang menjadi dasar.
Balas HANYA JSON berbentuk: [{"no":1,"status":"didukung","alasan":""}]

KLAIM:
${daftarKlaim}

TEKS SUMBER:
${daftarSumber}`;

  const { jawaban, model } = await tanya(prompt);
  const valid = ["didukung", "sebagian", "tidak_didukung"];
  const hasil: HasilCek[] = klaim.map((k, i) => {
    const j = Array.isArray(jawaban) ? jawaban.find((x) => Number(x.no) === i + 1) : undefined;
    const status = j && valid.includes(j.status) ? j.status : "tidak_didukung";
    return {
      no: i + 1,
      klaim: k,
      status,
      alasan: j?.alasan ?? "Pemeriksa tidak memberi jawaban untuk klaim ini.",
    };
  });
  return { hasil, model };
}