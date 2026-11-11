"use server";

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

const ROOT = path.resolve(process.cwd(), "..");
const PYTHON = path.join(
  process.env.LOCALAPPDATA ?? "",
  "ai-media-studio-tts",
  "Scripts",
  "python.exe"
);
const MAKS_PERCOBAAN = 3;

async function akhiri(
  taskId: number,
  agentId: number,
  productionId: number,
  ok: boolean,
  pesan: string
) {
  try {
    if (ok) {
      await db.query(
        `UPDATE tasks SET status='done', catatan_error=NULL, selesai_pada=NOW() WHERE id=?`,
        [taskId]
      );
      await db.query(`UPDATE productions SET status='quality_check' WHERE id=?`, [productionId]);
      await db.query(
        `UPDATE agents SET status='idle', tugas_saat_ini=NULL, status_diubah_pada=NOW() WHERE id=?`,
        [agentId]
      );
    } else {
      await db.query(
        `UPDATE tasks SET status='failed', catatan_error=?, selesai_pada=NOW() WHERE id=?`,
        [pesan.slice(0, 5000), taskId]
      );
      await db.query(`UPDATE productions SET status='fact_check' WHERE id=?`, [productionId]);
      await db.query(
        `UPDATE agents SET status='error', status_diubah_pada=NOW() WHERE id=?`,
        [agentId]
      );
    }
  } catch (e) {
    console.error("Gagal mencatat hasil video:", e);
  }
}

export async function buatVideo(formData: FormData) {
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
  if (!["storyboard", "editing", "quality_check"].includes(production.status)) {
    throw new Error(`Video belum bisa dibuat. Status episode: ${production.status}.`);
  }

  const [berjalan] = await db.query(
    `SELECT id FROM tasks WHERE production_id=? AND judul LIKE 'Video:%'
     AND status='running' AND dimulai_pada > (NOW() - INTERVAL 15 MINUTE) LIMIT 1`,
    [productionId]
  );
  if ((berjalan as unknown[]).length > 0) {
    throw new Error("Video untuk episode ini sedang dibuat.");
  }

  const [gagalRows] = await db.query(
    `SELECT COUNT(*) AS jumlah FROM tasks
     WHERE production_id=? AND judul LIKE 'Video:%' AND status='failed'`,
    [productionId]
  );
  const jumlahGagal = Number((gagalRows as { jumlah: number }[])[0].jumlah);
  if (jumlahGagal >= MAKS_PERCOBAAN) {
    throw new Error(`Pembuatan video sudah gagal ${jumlahGagal} kali. Batas percobaan tercapai.`);
  }

  const [agentRows] = await db.query(`SELECT id FROM agents WHERE kode='editing_agent' LIMIT 1`);
  const agent = (agentRows as { id: number }[])[0];
  if (!agent) throw new Error("Agent Editing tidak ditemukan.");

  const [hasil] = await db.query(
    `INSERT INTO tasks (judul, deskripsi, agent_id, production_id, status,
       percobaan, maks_percobaan, dimulai_pada)
     VALUES (?, ?, ?, ?, 'running', ?, ?, NOW())`,
    [
      `Video: ${production.judul}`,
      `Membuat video 60 detik untuk episode ${production.judul}`,
      agent.id,
      productionId,
      jumlahGagal + 1,
      MAKS_PERCOBAAN,
    ]
  );
  const taskId = (hasil as { insertId: number }).insertId;

  await db.query(
    `UPDATE agents SET status='working', tugas_saat_ini=?, status_diubah_pada=NOW() WHERE id=?`,
    [`Video: ${production.judul}`, agent.id]
  );
  await db.query(`UPDATE productions SET status='editing' WHERE id=?`, [productionId]);

  await writeFile(path.join(ROOT, "produksi", "naskah.json"), production.naskah, "utf-8");

  const proses = spawn(PYTHON, [path.join(ROOT, "produksi", "buat_video.py")], {
    cwd: ROOT,
    windowsHide: true,
    timeout: 600000,
  });
  let keluaran = "";
  proses.stdout.on("data", (d) => (keluaran = (keluaran + d.toString()).slice(-2000)));
  proses.stderr.on("data", (d) => (keluaran = (keluaran + d.toString()).slice(-2000)));
  proses.on("error", (e) => {
    void akhiri(taskId, agent.id, productionId, false, `Gagal menjalankan skrip: ${e.message}`);
  });
  proses.on("close", (kode) => {
    const ok = kode === 0 && keluaran.includes("SELESAI");
    void akhiri(
      taskId,
      agent.id,
      productionId,
      ok,
      ok ? "" : `Skrip berhenti (kode ${kode}). ${keluaran.slice(-600)}`
    );
  });

  redirect("/produksi");
}
