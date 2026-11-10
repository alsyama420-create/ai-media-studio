import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { jalankanRiset } from "./actions";

type Episode = {
  id: number;
  nomor_episode: number;
  judul: string;
  status: string;
};

type Sumber = {
  id: number;
  production_id: number;
  judul_sumber: string;
  url: string;
  status_verifikasi: string;
};

type TugasRiset = {
  id: number;
  production_id: number;
  status: string;
  percobaan: number;
  maks_percobaan: number;
  catatan_error: string | null;
};

const sel = { border: "1px solid #888", padding: "6px 10px", textAlign: "left" as const };

async function Isi() {
  await connection();
  try {
    const [episodeRows] = await db.query(
      "SELECT id, nomor_episode, judul, status FROM productions ORDER BY id"
    );
    const [sumberRows] = await db.query(
      "SELECT id, production_id, judul_sumber, url, status_verifikasi FROM research_sources ORDER BY id DESC"
    );
    const [tugasRows] = await db.query(
      "SELECT id, production_id, status, percobaan, maks_percobaan, catatan_error FROM tasks WHERE judul LIKE 'Riset:%' ORDER BY id DESC"
    );
    const episodes = episodeRows as Episode[];
    const sumber = sumberRows as Sumber[];
    const tugas = tugasRows as TugasRiset[];

    return (
      <main style={{ padding: 24 }} translate="no">
        <h1>Research Center</h1>

        <h2>Episode ({episodes.length})</h2>
        <table style={{ borderCollapse: "collapse", marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={sel}>Eps</th>
              <th style={sel}>Judul</th>
              <th style={sel}>Status</th>
              <th style={sel}>Sumber</th>
              <th style={sel}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {episodes.map((e) => (
              <tr key={e.id}>
                <td style={sel}>{e.nomor_episode}</td>
                <td style={sel}>{e.judul}</td>
                <td style={sel}>{e.status}</td>
                <td style={sel}>
                  {sumber.filter((s) => s.production_id === e.id).length}
                </td>
                <td style={sel}>
                  <form action={jalankanRiset}>
                    <input type="hidden" name="production_id" value={e.id} />
                    <button type="submit">Mulai Riset</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Riwayat Tugas Riset ({tugas.length})</h2>
        <table style={{ borderCollapse: "collapse", marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={sel}>ID</th>
              <th style={sel}>Episode</th>
              <th style={sel}>Status</th>
              <th style={sel}>Percobaan</th>
              <th style={sel}>Catatan error</th>
            </tr>
          </thead>
          <tbody>
            {tugas.map((t) => (
              <tr key={t.id}>
                <td style={sel}>{t.id}</td>
                <td style={sel}>{t.production_id}</td>
                <td style={sel}>{t.status}</td>
                <td style={sel}>
                  {t.percobaan} / {t.maks_percobaan}
                </td>
                <td style={sel}>{t.catatan_error ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Sumber Riset ({sumber.length})</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={sel}>Episode</th>
              <th style={sel}>Judul sumber</th>
              <th style={sel}>Verifikasi</th>
              <th style={sel}>Tautan</th>
            </tr>
          </thead>
          <tbody>
            {sumber.map((s) => (
              <tr key={s.id}>
                <td style={sel}>{s.production_id}</td>
                <td style={sel}>{s.judul_sumber}</td>
                <td style={sel}>{s.status_verifikasi}</td>
                <td style={sel}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    Buka
                  </a>
                </td>
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

export default function HalamanResearch() {
  return (
    <Suspense fallback={<p>Memuat...</p>}>
      <Isi />
    </Suspense>
  );
}