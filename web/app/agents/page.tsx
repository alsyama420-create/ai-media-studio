import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { buatTugas, ubahStatus } from "./actions";

type Agent = {
  id: number;
  nama: string;
  departemen: string;
  status: string;
  tugas_saat_ini: string | null;
};

type Task = {
  id: number;
  judul: string;
  agent: string;
  status: string;
  percobaan: number;
  maks_percobaan: number;
  catatan_error: string | null;
};

const sel = { border: "1px solid #888", padding: "6px 10px", textAlign: "left" as const };

async function Daftar() {
  await connection();
  try {
    const [agentRows] = await db.query(
      "SELECT a.id, a.nama, d.nama AS departemen, a.status, a.tugas_saat_ini FROM agents a JOIN departments d ON d.id = a.department_id ORDER BY d.urutan"
    );
    const [taskRows] = await db.query(
      "SELECT t.id, t.judul, a.nama AS agent, t.status, t.percobaan, t.maks_percobaan, t.catatan_error FROM tasks t JOIN agents a ON a.id = t.agent_id ORDER BY t.id DESC"
    );
    const agents = agentRows as Agent[];
    const tasks = taskRows as Task[];

    return (
      <main style={{ padding: 24 }} translate="no">
        <h1>Daftar Agent ({agents.length})</h1>
        <table style={{ borderCollapse: "collapse", marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={sel}>Agent</th>
              <th style={sel}>Departemen</th>
              <th style={sel}>Status</th>
              <th style={sel}>Tugas saat ini</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td style={sel}>{a.nama}</td>
                <td style={sel}>{a.departemen}</td>
                <td style={sel}>{a.status}</td>
                <td style={sel}>{a.tugas_saat_ini ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h1>Buat Tugas Baru</h1>
        <form action={buatTugas} style={{ marginBottom: 32 }}>
          <input name="judul" placeholder="Judul tugas" style={{ padding: 6, marginRight: 8 }} required />
          <select name="agent_id" style={{ padding: 6, marginRight: 8 }}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nama}
              </option>
            ))}
          </select>
          <button type="submit" style={{ padding: "6px 12px" }}>
            Tambah
          </button>
        </form>

        <h1>Daftar Tugas ({tasks.length})</h1>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={sel}>ID</th>
              <th style={sel}>Judul</th>
              <th style={sel}>Agent</th>
              <th style={sel}>Status</th>
              <th style={sel}>Percobaan</th>
              <th style={sel}>Catatan error</th>
              <th style={sel}>Simulasi</th>
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
                  {t.percobaan} / {t.maks_percobaan}
                </td>
                <td style={sel}>{t.catatan_error ?? "-"}</td>
                <td style={sel}>
                  <form action={ubahStatus}>
                    <input type="hidden" name="id" value={t.id} />
                    <button name="aksi" value="mulai">Mulai</button>{" "}
                    <button name="aksi" value="gagal">Gagal</button>{" "}
                    <button name="aksi" value="selesai">Selesai</button>
                  </form>
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

export default function HalamanAgents() {
  return (
    <Suspense fallback={<p>Memuat...</p>}>
      <Daftar />
    </Suspense>
  );
}