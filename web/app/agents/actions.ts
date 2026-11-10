"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export async function buatTugas(formData: FormData) {
  const judul = String(formData.get("judul") ?? "").trim();
  const agentId = Number(formData.get("agent_id"));
  if (!judul || !agentId) return;
  await db.query("INSERT INTO tasks (judul, agent_id) VALUES (?, ?)", [judul, agentId]);
  revalidatePath("/agents");
}

type Tugas = {
  agent_id: number;
  judul: string;
  status: string;
  percobaan: number;
  maks_percobaan: number;
};

export async function ubahStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const aksi = String(formData.get("aksi"));

  const [rows] = await db.query(
    "SELECT agent_id, judul, status, percobaan, maks_percobaan FROM tasks WHERE id = ?",
    [id]
  );
  const t = (rows as Tugas[])[0];
  if (!t) return;

  if (aksi === "mulai") {
    if (t.status === "running" || t.status === "done") return;
    if (t.percobaan >= t.maks_percobaan) return;
    await db.query(
      "UPDATE tasks SET status='running', percobaan=percobaan+1, dimulai_pada=NOW(), selesai_pada=NULL, catatan_error=NULL WHERE id=?",
      [id]
    );
    await db.query(
      "UPDATE agents SET status='working', tugas_saat_ini=?, status_diubah_pada=NOW() WHERE id=?",
      [t.judul, t.agent_id]
    );
  }

  if (aksi === "gagal" && t.status === "running") {
    await db.query(
      "UPDATE tasks SET status='failed', catatan_error='Uji coba: simulasi kegagalan', selesai_pada=NOW() WHERE id=?",
      [id]
    );
    await db.query("UPDATE agents SET status='error', status_diubah_pada=NOW() WHERE id=?", [t.agent_id]);
  }

  if (aksi === "selesai" && t.status === "running") {
    await db.query(
      "UPDATE tasks SET status='done', catatan_error=NULL, selesai_pada=NOW() WHERE id=?",
      [id]
    );
    await db.query(
      "UPDATE agents SET status='idle', tugas_saat_ini=NULL, status_diubah_pada=NOW() WHERE id=?",
      [t.agent_id]
    );
  }

  revalidatePath("/agents");
}