import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { rencanakanBerikutnya } from "./actions";

type Serial = { id: number; judul: string; tema: string };
type Episode = {
  id: number;
  series_id: number;
  nomor_episode: number;
  judul: string;
  status: string;
  catatan_kesinambungan: string | null;
};
type Tugas = { id: number; judul: string; status: string; percobaan: number; maks_percobaan: number; catatan_error: string | null };

const sel = { border: "1px solid #888", padding: "6px 10px", textAlign: "left" as const };

async function Isi() {
  await connection();
  try {
    const [sRows] = await db.query("SELECT id, judul, tema FROM content_series ORDER BY id");
    const [eRows] = await db.query(
      "SELECT id, series_id, nomor_episode, judul, status, catatan_kesinambungan FROM productions ORDER BY series_id, nomor_episode"
    );
    const [tRows] = await db.query(
      "SELECT id, judul, status, percobaan, maks_percobaan, catatan_error FROM tasks WHERE judul LIKE 'Rencana:%' ORDER BY id DESC LIMIT 5"
    );
    const serial = sRows as Serial[];
    const episodes = eRows as Episode[];
    const tugas = tRows as Tugas[];

    return (
      <main style={{ padding: 24 }} translate="no">
        <h1>Serial dan Kesinambungan</h1>
        {serial.map((s) => (
          <section key={s.id} style={{ marginBottom: 32 }}>
            <h2>{s.judul}</h2>
            <p>Tema: {s.tema}</p>
            <form action={rencanakanBerikutnya} style={{ marginBottom: 12 }}>
              <input type="hidden" name="series_id" value={s.id} />
              <button type="submit">Rencanakan Episode Berikutnya</button>
            </form>
            <table style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={sel}>Part</th>
                  <th style={sel}>Judul</th>
                  <th style={sel}>Status</th>
                  <th style={sel}>Hubungan dengan episode sebelumnya</th>
                </tr>
              </thead>
              <tbody>
                {episodes
                  .filter((e) => e.series_id === s.id)
                  .map((e) => (
                    <tr key={e.id}>
                      <td style={sel}>{e.nomor_episode}</td>
                      <td style={sel}>{e.judul}</td>
                      <td style={sel}>{e.status}</td>
                      <td style={sel}>{e.catatan_kesinambungan ?? "-"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}

        <h2>Tugas Perencanaan ({tugas.length})</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={sel}>ID</th>
              <th style={sel}>Judul</th>
              <th style={sel}>Status</th>
              <th style={sel}>Percobaan</th>
              <th style={sel}>Catatan error</th>
            </tr>
          </thead>
          <tbody>
            {tugas.map((t) => (
              <tr key={t.id}>
                <td style={sel}>{t.id}</td>
                <td style={sel}>{t.judul}</td>
                <td style={sel}>{t.status}</td>
                <td style={sel}>
                  {t.percobaan} / {t.maks_percobaan}
                </td>
                <td style={sel}>{t.catatan_error ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    );
  } catch (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Gagal membaca database</h1>
        <p>{String(error)}</p>
      </main>
    );
  }
}

export default function HalamanSerial() {
  return (
    <Suspense fallback={<p>Memuat...</p>}>
      <Isi />
    </Suspense>
  );
}