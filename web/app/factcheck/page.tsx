import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { jalankanFactCheck } from "./actions";

type Episode = { id: number; nomor_episode: number; judul: string; status: string };
type Laporan = { id: number; production_id: number; hasil: string; detail: string; model: string; dibuat_pada: string };
type Cek = { no: number; klaim: string; status: string; alasan: string };
type Tugas = { id: number; status: string; percobaan: number; maks_percobaan: number; catatan_error: string | null };

const sel = { border: "1px solid #888", padding: "6px 10px", textAlign: "left" as const };

function bacaDetail(teks: string): Cek[] {
  try {
    return JSON.parse(teks) as Cek[];
  } catch {
    return [];
  }
}

async function Isi() {
  await connection();
  try {
    const [eRows] = await db.query(
      "SELECT id, nomor_episode, judul, status FROM productions ORDER BY id"
    );
    const [lRows] = await db.query(
      "SELECT id, production_id, hasil, detail, model, dibuat_pada FROM fact_checks ORDER BY id DESC LIMIT 3"
    );
    const [tRows] = await db.query(
      "SELECT id, status, percobaan, maks_percobaan, catatan_error FROM tasks WHERE judul LIKE 'Fakta:%' ORDER BY id DESC LIMIT 5"
    );
    const episodes = eRows as Episode[];
    const laporan = lRows as Laporan[];
    const tugas = tRows as Tugas[];

    return (
      <main style={{ padding: 24 }} translate="no">
        <h1>Fact Checking</h1>
        <p>
          Pemeriksaan oleh AI terhadap teks sumber riset. Ini penyaring awal, bukan jaminan
          kebenaran. Cek kalimat penting sendiri sebelum video diterbitkan.
        </p>

        <h2>Episode</h2>
        <table style={{ borderCollapse: "collapse", marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={sel}>Eps</th>
              <th style={sel}>Judul</th>
              <th style={sel}>Status</th>
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
                  <form action={jalankanFactCheck}>
                    <input type="hidden" name="production_id" value={e.id} />
                    <button type="submit">Periksa Fakta</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Laporan terbaru ({laporan.length})</h2>
        {laporan.map((l) => (
          <section key={l.id} style={{ marginBottom: 24, maxWidth: 800 }}>
            <h3>
              Laporan {l.id}, episode {l.production_id}: {l.hasil.toUpperCase()}
            </h3>
            <p>
              {String(l.dibuat_pada)} (model {l.model})
            </p>
            <ul>
              {bacaDetail(l.detail).map((c) => (
                <li key={c.no} style={{ marginBottom: 8 }}>
                  <b>{c.status.toUpperCase()}</b>: {c.klaim}
                  <br />
                  <small>{c.alasan}</small>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <h2>Tugas Fact Check ({tugas.length})</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={sel}>ID</th>
              <th style={sel}>Status</th>
              <th style={sel}>Percobaan</th>
              <th style={sel}>Catatan error</th>
            </tr>
          </thead>
          <tbody>
            {tugas.map((t) => (
              <tr key={t.id}>
                <td style={sel}>{t.id}</td>
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

export default function HalamanFactCheck() {
  return (
    <Suspense fallback={<p>Memuat...</p>}>
      <Isi />
    </Suspense>
  );
}