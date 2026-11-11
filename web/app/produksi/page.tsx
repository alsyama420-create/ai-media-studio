import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { buatVideo } from "./actions";

type Episode = { id: number; nomor_episode: number; judul: string; status: string; naskah: string | null };
type Tugas = {
  id: number;
  production_id: number;
  status: string;
  percobaan: number;
  maks_percobaan: number;
  catatan_error: string | null;
  dimulai_pada: string | null;
  selesai_pada: string | null;
};

const sel = { border: "1px solid #888", padding: "6px 10px", textAlign: "left" as const };

async function Isi() {
  await connection();
  try {
    const [eRows] = await db.query(
      "SELECT id, nomor_episode, judul, status, naskah FROM productions ORDER BY id"
    );
    const [tRows] = await db.query(
      "SELECT id, production_id, status, percobaan, maks_percobaan, catatan_error, dimulai_pada, selesai_pada FROM tasks WHERE judul LIKE 'Video:%' ORDER BY id DESC"
    );
    const episodes = eRows as Episode[];
    const tugas = tRows as Tugas[];

    return (
      <main style={{ padding: 24 }} translate="no">
        <h1>Production Center</h1>
        <p>Video dibuat sekitar 2 sampai 3 menit. Muat ulang halaman (F5) untuk melihat statusnya.</p>

        <h2>Episode ({episodes.length})</h2>
        <table style={{ borderCollapse: "collapse", marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={sel}>Eps</th>
              <th style={sel}>Judul</th>
              <th style={sel}>Status</th>
              <th style={sel}>Naskah</th>
              <th style={sel}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {episodes.map((e) => (
              <tr key={e.id}>
                <td style={sel}>{e.nomor_episode}</td>
                <td style={sel}>{e.judul}</td>
                <td style={sel}>{e.status}</td>
                <td style={sel}>{e.naskah ? "ada" : "belum"}</td>
                <td style={sel}>
                  <form action={buatVideo}>
                    <input type="hidden" name="production_id" value={e.id} />
                    <button type="submit">Buat Video</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Riwayat Tugas Video ({tugas.length})</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={sel}>ID</th>
              <th style={sel}>Episode</th>
              <th style={sel}>Status</th>
              <th style={sel}>Percobaan</th>
              <th style={sel}>Mulai</th>
              <th style={sel}>Selesai</th>
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
                <td style={sel}>{t.dimulai_pada ? String(t.dimulai_pada) : "-"}</td>
                <td style={sel}>{t.selesai_pada ? String(t.selesai_pada) : "-"}</td>
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

export default function HalamanProduksi() {
  return (
    <Suspense fallback={<p>Memuat...</p>}>
      <Isi />
    </Suspense>
  );
}