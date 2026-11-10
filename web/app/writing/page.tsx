import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { buatNaskah } from "./actions";

type Episode = {
  id: number;
  nomor_episode: number;
  judul: string;
  status: string;
  naskah: string | null;
};

type TugasNaskah = {
  id: number;
  production_id: number;
  status: string;
  percobaan: number;
  maks_percobaan: number;
  catatan_error: string | null;
};

type Naskah = {
  hook: string;
  fakta: { teks: string; sumber: string; url: string }[];
  penutup: string;
  pengait: string;
  jumlah_kata: number;
  perkiraan_detik: number;
};

const sel = { border: "1px solid #888", padding: "6px 10px", textAlign: "left" as const };

function bacaNaskah(teks: string | null): Naskah | null {
  if (!teks) return null;
  try {
    return JSON.parse(teks) as Naskah;
  } catch {
    return null;
  }
}

async function Isi() {
  await connection();
  try {
    const [episodeRows] = await db.query(
      "SELECT id, nomor_episode, judul, status, naskah FROM productions ORDER BY id"
    );
    const [tugasRows] = await db.query(
      "SELECT id, production_id, status, percobaan, maks_percobaan, catatan_error FROM tasks WHERE judul LIKE 'Naskah:%' ORDER BY id DESC"
    );
    const episodes = episodeRows as Episode[];
    const tugas = tugasRows as TugasNaskah[];

    return (
      <main style={{ padding: 24 }} translate="no">
        <h1>Writing Center</h1>

        <h2>Episode ({episodes.length})</h2>
        {episodes.map((e) => {
          const n = bacaNaskah(e.naskah);
          return (
            <section key={e.id} style={{ marginBottom: 32 }}>
              <h3>
                Part {e.nomor_episode}: {e.judul}
              </h3>
              <p>Status: {e.status}</p>
              <form action={buatNaskah}>
                <input type="hidden" name="production_id" value={e.id} />
                <button type="submit">Buat Naskah</button>
              </form>
              {n ? (
                <div style={{ marginTop: 12, maxWidth: 720 }}>
                  <p>
                    <b>
                      {n.jumlah_kata} kata, perkiraan {n.perkiraan_detik} detik
                    </b>{" "}
                    (belum diperiksa faktanya)
                  </p>
                  <p>{n.hook}</p>
                  {n.fakta.map((f, i) => (
                    <p key={i}>
                      {f.teks} <small>[{f.sumber}]</small>
                    </p>
                  ))}
                  <p>{n.penutup}</p>
                  <p>{n.pengait}</p>
                </div>
              ) : (
                <p>Belum ada naskah.</p>
              )}
            </section>
          );
        })}

        <h2>Riwayat Tugas Naskah ({tugas.length})</h2>
        <table style={{ borderCollapse: "collapse" }}>
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

export default function HalamanWriting() {
  return (
    <Suspense fallback={<p>Memuat...</p>}>
      <Isi />
    </Suspense>
  );
}