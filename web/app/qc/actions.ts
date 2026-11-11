"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const jalan = promisify(execFile);
const ROOT = path.resolve(process.cwd(), "..");
const MAKS_PERCOBAAN = 3;

type Cek = { nama: string; ok: boolean; nilai: string };
type Probe = {
  streams: { codec_type: string; width?: number; height?: number }[];
  format: { duration: string };
};

async function periksaVideo(file: string): Promise<Cek[]> {
  const info = await stat(file).catch(() => null);
  if (!info) {
    return [{ nama: "File video ada", ok: false, nilai: "tidak ditemukan" }];
  }

  const { stdout } = await jalan(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file],
    { maxBuffer: 1024 * 1024 }
  );
  const data = JSON.parse(stdout) as Probe;
  const video = data.streams.find((s) => s.codec_type === "video");
  const adaAudio = data.streams.some((s) => s.codec_type === "audio");
  const durasi = Number(data.format.duration);
  const mb = info.size / 1024 / 1024;

  let teks = "";
  try {
    const r = await jalan(
      "ffmpeg",
      ["-i", file, "-vn", "-af", "volumedetect", "-f", "null", "NUL"],
      { maxBuffer: 4 * 1024 * 1024 }
    );
    teks = r.stderr;
  } catch (e) {
    teks = (e as { stderr?: string }).stderr ?? "";
  }
  const cocok = teks.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
  const volume = cocok ? Number(cocok[1]) : NaN;

  return [
    { nama: "Durasi 59 sampai 61 detik", ok: durasi >= 59 && durasi <= 61, nilai: `${durasi.toFixed(2)} detik` },
    {
      nama: "Resolusi 1080 x 1920",
      ok: video?.width === 1080 && video?.height === 1920,
      nilai: `${video?.width ?? "?"} x ${video?.height ?? "?"}`,
    },
    { nama: "Ada track video", ok: Boolean(video), nilai: video ? "ya" : "tidak" },
    { nama: "Ada track audio", ok: adaAudio, nilai: adaAudio ? "ya" : "tidak" },
    { nama: "Ukuran file 0,3 sampai 100 MB", ok: mb >= 0.3 && mb <= 100, nilai: `${mb.toFixed(2)} MB` },
    {
      nama: "Audio tidak senyap (rata-rata di atas -45 dB)",
      ok: Number.isFinite(volume) && volume > -45,
      nilai: Number.isFinite(volume) ? `${volume} dB` : "tidak terbaca",
    },
  ];
}

export async function jalankanQC(formData: FormData) {
  const productionId = Number(formData.get("production_id"));
  if (!Number.isInteger(productionId) || productionId <= 0) {
    throw new Error("ID episode tidak valid.");
  }

  const [prodRows] = await db.query(
    `SELECT id, nomor_episode, judul, status FROM productions WHERE id = ?`,
    [productionId]
  );
  const production = (
    prodRows as { id: number; nomor_episode: number; judul: string; status: string }[]
  )[0];
  if (!production) throw new Error("Episode tidak ditemukan.");
  if (production.status !== "quality_check") {
    throw new Error(`QC belum bisa dijalankan. Status episode: ${production.status}.`);
  }

  const [berjalan] = await db.query(
    `SELECT id FROM tasks WHERE production_id=? AND judul LIKE 'QC:%'
     AND status='running' AND dimulai_pada > (NOW() - INTERVAL 5 MINUTE) LIMIT 1`,
    [productionId]
  );
  if ((berjalan as unknown[]).length > 0) throw new Error("QC sedang berjalan.");

  const [gagalRows] = await db.query(
    `SELECT COUNT(*) AS jumlah FROM tasks
     WHERE production_id=? AND judul LIKE 'QC:%' AND status='failed'`,
    [productionId]
  );
  const jumlahGagal = Number((gagalRows as { jumlah: number }[])[0].jumlah);
  if (jumlahGagal >= MAKS_PERCOBAAN) {
    throw new Error(`QC sudah error ${jumlahGagal} kali. Batas percobaan tercapai.`);
  }

  const [agentRows] = await db.query(`SELECT id FROM agents WHERE kode='qc_agent' LIMIT 1`);
  const agent = (agentRows as { id: number }[])[0];
  if (!agent) throw new Error("Agent Quality Control tidak ditemukan.");

  const [hasil] = await db.query(
    `INSERT INTO tasks (judul, deskripsi, agent_id, production_id, status,
       percobaan, maks_percobaan, dimulai_pada)
     VALUES (?, ?, ?, ?, 'running', ?, ?, NOW())`,
    [
      `QC: ${production.judul}`,
      `Pemeriksaan teknis video episode ${production.judul}`,
      agent.id,
      productionId,
      jumlahGagal + 1,
      MAKS_PERCOBAAN,
    ]
  );
  const taskId = (hasil as { insertId: number }).insertId;

  await db.query(
    `UPDATE agents SET status='working', tugas_saat_ini=?, status_diubah_pada=NOW() WHERE id=?`,
    [`QC: ${production.judul}`, agent.id]
  );

  try {
    const file = path.join(ROOT, "produksi", "hasil", `episode-${production.nomor_episode}.mp4`);
    const cek = await periksaVideo(file);
    const lolos = cek.every((c) => c.ok);

    await db.query(`INSERT INTO qc_reports (production_id, hasil, detail) VALUES (?, ?, ?)`, [
      productionId,
      lolos ? "lolos" : "gagal",
      JSON.stringify(cek),
    ]);
    await db.query(
      `UPDATE tasks SET status='done', catatan_error=NULL, selesai_pada=NOW() WHERE id=?`,
      [taskId]
    );
    await db.query(
      `UPDATE agents SET status='idle', tugas_saat_ini=NULL, status_diubah_pada=NOW() WHERE id=?`,
      [agent.id]
    );
  } catch (error) {
    const pesan = error instanceof Error ? error.message : "Terjadi kesalahan saat QC.";
    await db.query(
      `UPDATE tasks SET status='failed', catatan_error=?, selesai_pada=NOW() WHERE id=?`,
      [pesan.slice(0, 5000), taskId]
    );
    await db.query(
      `UPDATE agents SET status='error', status_diubah_pada=NOW() WHERE id=?`,
      [agent.id]
    );
  }

  revalidatePath("/qc");
  revalidatePath("/agents");
  redirect("/qc");
}