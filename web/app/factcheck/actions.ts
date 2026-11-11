"use server";

import { db } from "@/lib/db";
import { periksaKlaim, type SumberCek } from "@/lib/factcheck";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const MAKS_PERCOBAAN = 3;

type Naskah = {
  fakta?: { teks: string }[];
  penutup?: string;
};

export async function jalankanFactCheck(formData: FormData) {
  const productionId = Number(formData.get("production_id"));
  if (!Number.isInteger(productionId) || productionId <= 0) {
    throw new Error("ID episode tidak valid.");
  }

  const [prodRows] = await db.query(
    `SELECT id, judul, status, naskah FROM productions WHERE id = ?`,
    [productionId]
  );
  const production = (
    prodRows as { id: number; judul: string; status: string; naskah: string | null }[]
  )[0];
  if (!production) throw new Error("Episode tidak ditemukan.");
  if (!production.naskah) throw new Error("Episode ini belum punya naskah.");
  if (!["fact_check", "quality_check"].includes(production.status)) {
    throw new Error(`Fact check belum bisa dijalankan. Status episode: ${production.status}.`);
  }

  const [berjalan] = await db.query(
    `SELECT id FROM tasks WHERE production_id=? AND judul LIKE 'Fakta:%'
     AND status='running' AND dimulai_pada > (NOW() - INTERVAL 5 MINUTE) LIMIT 1`,
    [productionId]
  );
  if ((berjalan as unknown[]).length > 0) throw new Error("Fact check sedang berjalan.");

  const [gagalRows] = await db.query(
    `SELECT COUNT(*) AS jumlah FROM tasks
     WHERE production_id=? AND judul LIKE 'Fakta:%' AND status='failed'`,
    [productionId]
  );
  const jumlahGagal = Number((gagalRows as { jumlah: number }[])[0].jumlah);
  if (jumlahGagal >= MAKS_PERCOBAAN) {
    throw new Error(`Fact check sudah error ${jumlahGagal} kali. Batas percobaan tercapai.`);
  }

  const [agentRows] = await db.query(`SELECT id FROM agents WHERE kode='fact_agent' LIMIT 1`);
  const agent = (agentRows as { id: number }[])[0];
  if (!agent) throw new Error("Agent Fact Checking tidak ditemukan.");

  const [hasil] = await db.query(
    `INSERT INTO tasks (judul, deskripsi, agent_id, production_id, status,
       percobaan, maks_percobaan, dimulai_pada)
     VALUES (?, ?, ?, ?, 'running', ?, ?, NOW())`,
    [
      `Fakta: ${production.judul}`,
      `Memeriksa klaim naskah terhadap sumber untuk episode ${production.judul}`,
      agent.id,
      productionId,
      jumlahGagal + 1,
      MAKS_PERCOBAAN,
    ]
  );
  const taskId = (hasil as { insertId: number }).insertId;

  await db.query(
    `UPDATE agents SET status='working', tugas_saat_ini=?, status_diubah_pada=NOW() WHERE id=?`,
    [`Fakta: ${production.judul}`, agent.id]
  );

  try {
    const naskah = JSON.parse(production.naskah) as Naskah;
    const klaim = (naskah.fakta ?? []).map((f) => f.teks).filter(Boolean);
    if (klaim.length === 0) throw new Error("Naskah tidak berisi kalimat fakta.");

    const [sumberRows] = await db.query(
      `SELECT judul_sumber, ringkasan FROM research_sources WHERE production_id = ? ORDER BY id`,
      [productionId]
    );
    const sumber = sumberRows as SumberCek[];
    if (sumber.length === 0) throw new Error("Tidak ada sumber riset untuk episode ini.");

    const { hasil: cek, model } = await periksaKlaim(klaim, sumber);
    const lulus = cek.every((c) => c.status === "didukung");

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO fact_checks (production_id, hasil, detail, model) VALUES (?, ?, ?, ?)`,
        [productionId, lulus ? "lulus" : "gagal", JSON.stringify(cek), model]
      );
      if (lulus && production.status === "fact_check") {
        await conn.query(`UPDATE productions SET status='storyboard' WHERE id=?`, [productionId]);
      }
      if (!lulus && production.status === "quality_check") {
        await conn.query(`UPDATE productions SET status='fact_check' WHERE id=?`, [productionId]);
      }
      await conn.query(
        `UPDATE tasks SET status='done', catatan_error=NULL, selesai_pada=NOW() WHERE id=?`,
        [taskId]
      );
      await conn.query(
        `UPDATE agents SET status='idle', tugas_saat_ini=NULL, status_diubah_pada=NOW() WHERE id=?`,
        [agent.id]
      );
      await conn.commit();
    } catch (errorTransaksi) {
      await conn.rollback();
      throw errorTransaksi;
    } finally {
      conn.release();
    }
  } catch (error) {
    const pesan = error instanceof Error ? error.message : "Terjadi kesalahan saat fact check.";
    await db.query(
      `UPDATE tasks SET status='failed', catatan_error=?, selesai_pada=NOW() WHERE id=?`,
      [pesan.slice(0, 5000), taskId]
    );
    await db.query(
      `UPDATE agents SET status='error', status_diubah_pada=NOW() WHERE id=?`,
      [agent.id]
    );
  }

  revalidatePath("/factcheck");
  revalidatePath("/agents");
  redirect("/factcheck");
}
