

import { Suspense } from "react";
import { db } from "@/lib/db";
import { buatTugas, ubahStatus } from "./actions";

type Agent = {
  id: number;
  nama: string;
  kode: string;
  status: string;
  tugas_saat_ini: string | null;
};

type Task = {
  id: number;
  judul: string;
  deskripsi: string | null;
  agent: string;
  kode: string;
  status: string;
  percobaan: number;
  maks_percobaan: number;
  catatan_error: string | null;
};

const sel = {
  border: "1px solid #444",
  padding: 10,
  textAlign: "left" as const,
};

async function Daftar() {
  try {
    const [agentRows] = await db.query(
      `SELECT id, nama, kode, status, tugas_saat_ini
       FROM agents ORDER BY id`
    );

    const [taskRows] = await db.query(
      `SELECT
         t.id,
         t.judul,
         t.deskripsi,
         a.nama AS agent,
         a.kode,
         t.status,
         t.percobaan,
         t.maks_percobaan,
         t.catatan_error
       FROM tasks t
       JOIN agents a ON a.id = t.agent_id
       ORDER BY t.id DESC`
    );

    const agents = agentRows as Agent[];
    const tasks = taskRows as Task[];

    return (
      <main style={{ padding: 24, color: "white" }}>
        <h1>AI Media Studio - Agent Center</h1>
        <p>Manajemen agent dan produksi konten</p>

        <hr style={{ margin: "24px 0" }} />

        <h2>Daftar Agent ({agents.length})</h2>

        <div style={{ overflowX: "auto", marginBottom: 32 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={sel}>Agent</th>
                <th style={sel}>Kode</th>
                <th style={sel}>Status</th>
                <th style={sel}>Tugas saat ini</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td style={sel}>{a.nama}</td>
                  <td style={sel}>{a.kode}</td>
                  <td style={sel}>{a.status}</td>
                  <td style={sel}>{a.tugas_saat_ini ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <hr style={{ margin: "24px 0" }} />

        <h2>Buat Tugas Baru</h2>

        <form
          action={buatTugas}
          style={{
            display: "grid",
            gap: 12,
            maxWidth: 600,
            marginBottom: 32,
          }}
        >
          <input
            name="judul"
            placeholder="Judul tugas"
            required
            style={{ padding: 10 }}
          />

          <textarea
            name="deskripsi"
            placeholder="Masukkan naskah untuk Agent Audio..."
            rows={6}
            style={{ padding: 10 }}
          />

          <select
            name="agent_id"
            required
            style={{ padding: 10 }}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nama}
              </option>
            ))}
          </select>

          <button type="submit" style={{ padding: 12 }}>
            Tambah Tugas
          </button>
        </form>

        <hr style={{ margin: "24px 0" }} />

        <h2>Daftar Tugas ({tasks.length})</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={sel}>ID</th>
                <th style={sel}>Judul</th>
                <th style={sel}>Agent</th>
                <th style={sel}>Status</th>
                <th style={sel}>Percobaan</th>
                <th style={sel}>Catatan</th>
                <th style={sel}>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td style={sel}>{t.id}</td>
                  <td style={sel}>{t.judul}</td>
                  <td style={sel}>{t.agent}</td>
                  <td style={sel}>{t.status}</td>
                  <td style={sel}>
                    {t.percobaan}/{t.maks_percobaan}
                  </td>
                  <td style={sel}>{t.catatan_error ?? "-"}</td>
                  <td style={sel}>
                    <form action={ubahStatus}>
                      <input
                        type="hidden"
                        name="id"
                        value={t.id}
                      />

                      <button
                        name="aksi"
                        value="mulai"
                        disabled={
                          t.status === "running" ||
                          t.status === "done" ||
                          t.percobaan >= t.maks_percobaan
                        }
                      >
                        Mulai
                      </button>{" "}

                      <button
                        name="aksi"
                        value="gagal"
                        disabled={t.status !== "running"}
                      >
                        Gagal
                      </button>{" "}

                      <button
                        name="aksi"
                        value="selesai"
                        disabled={t.status !== "running"}
                      >
                        Selesai
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

export default function HalamanAgents() {
  return (
    <Suspense fallback={<p>Memuat agent...</p>}>
      <Daftar />
    </Suspense>
  );
}
