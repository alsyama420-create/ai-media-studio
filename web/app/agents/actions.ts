
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const jalankanProgram = promisify(execFile);

type Tugas = {
  id: number;
  agent_id: number;
  kode: string;
  judul: string;
  deskripsi: string | null;
  status: string;
  percobaan: number;
  maks_percobaan: number;
};

export async function buatTugas(formData: FormData) {
  const judul = String(formData.get("judul") ?? "").trim();
  const deskripsi = String(formData.get("deskripsi") ?? "").trim();
  const agentId = Number(formData.get("agent_id"));

  if (!judul || !agentId) return;

  await db.query(
    "INSERT INTO tasks (judul, deskripsi, agent_id) VALUES (?, ?, ?)",
    [judul, deskripsi || null, agentId]
  );

  revalidatePath("/agents");
}

async function buatAudio(tugas: Tugas) {
  if (!tugas.deskripsi?.trim()) {
    throw new Error("Naskah audio masih kosong.");
  }

  const folder = path.join(
    process.cwd(),
    "public",
    "produksi",
    "audio"
  );

  await fs.mkdir(folder, { recursive: true });

  const fileAudio = path.join(folder, `tugas-${tugas.id}.mp3`);

  const edgeTts = path.join(
    os.homedir(),
    "AppData",
    "Local",
    "ai-media-studio-tts",
    "Scripts",
    "edge-tts.exe"
  );

  await jalankanProgram(edgeTts, [
    "--voice",
    "id-ID-ArdiNeural",
    "--text",
    tugas.deskripsi,
    "--write-media",
    fileAudio,
  ], {
    timeout: 120000,
    windowsHide: true,
  });

  return `/produksi/audio/tugas-${tugas.id}.mp3`;
}

export async function ubahStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const aksi = String(formData.get("aksi") ?? "");

  if (!Number.isInteger(id) || id <= 0) return;

  const [rows] = await db.query(
    `SELECT
       t.id, t.agent_id, a.kode, t.judul, t.deskripsi,
       t.status, t.percobaan, t.maks_percobaan
     FROM tasks t
     JOIN agents a ON a.id = t.agent_id
     WHERE t.id = ?`,
    [id]
  );

  const tugas = (rows as Tugas[])[0];
  if (!tugas) return;

  if (aksi === "mulai") {
    if (
      tugas.status === "running" ||
      tugas.status === "done" ||
      tugas.percobaan >= tugas.maks_percobaan
    ) return;

    await db.query(
      `UPDATE tasks
       SET status='running',
           percobaan=percobaan+1,
           dimulai_pada=NOW(),
           selesai_pada=NULL,
           catatan_error=NULL
       WHERE id=?`,
      [id]
    );

    await db.query(
      `UPDATE agents
       SET status='working',
           tugas_saat_ini=?,
           status_diubah_pada=NOW()
       WHERE id=?`,
      [tugas.judul, tugas.agent_id]
    );

    // Agent Audio langsung menjalankan Edge TTS.
    if (tugas.kode === "audio_agent") {
      try {
        const lokasiAudio = await buatAudio(tugas);

        await db.query(
          `UPDATE tasks
           SET status='done',
               deskripsi=CONCAT(COALESCE(deskripsi, ''), ?),
               catatan_error=NULL,
               selesai_pada=NOW()
           WHERE id=?`,
          [`\n\n[HASIL_AUDIO] ${lokasiAudio}`, id]
        );

        await db.query(
          `UPDATE agents
           SET status='idle',
               tugas_saat_ini=NULL,
               status_diubah_pada=NOW()
           WHERE id=?`,
          [tugas.agent_id]
        );
      } catch (error) {
        const pesan = error instanceof Error
          ? error.message
          : "Gagal membuat audio.";

        await db.query(
          `UPDATE tasks
           SET status='failed',
               catatan_error=?,
               selesai_pada=NOW()
           WHERE id=?`,
          [pesan.slice(0, 5000), id]
        );

        await db.query(
          `UPDATE agents
           SET status='error',
               status_diubah_pada=NOW()
           WHERE id=?`,
          [tugas.agent_id]
        );
      }
    }
  }

  if (aksi === "gagal" && tugas.status === "running") {
    await db.query(
      `UPDATE tasks
       SET status='failed',
           catatan_error='Tugas ditandai gagal oleh operator',
           selesai_pada=NOW()
       WHERE id=?`,
      [id]
    );

    await db.query(
      `UPDATE agents
       SET status='error',
           status_diubah_pada=NOW()
       WHERE id=?`,
      [tugas.agent_id]
    );
  }

  if (aksi === "selesai" && tugas.status === "running") {
    await db.query(
      `UPDATE tasks
       SET status='done',
           catatan_error=NULL,
           selesai_pada=NOW()
       WHERE id=?`,
      [id]
    );

    await db.query(
      `UPDATE agents
       SET status='idle',
           tugas_saat_ini=NULL,
           status_diubah_pada=NOW()
       WHERE id=?`,
      [tugas.agent_id]
    );
  }

  revalidatePath("/agents");
}
