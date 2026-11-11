"use server";

import { db } from "@/lib/db";
import { rencanakanEpisode, type EpisodeLama } from "@/lib/rencana";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const MAKS_PERCOBAAN = 3;

function normal(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function terlaluMirip(a: string, b: string): boolean {
  const x = new Set(normal(a).split(" ").filter((k) => k.length > 2));
  const y = new Set(normal(b).split(" ").filter((k) => k.length > 2));
  if (x.size === 0 || y.size === 0) return false;
  let sama = 0;
  x.forEach((k) => {
    if (y.has(k)) sama++;
  });
  return sama / (x.size + y.size - sama) >= 0.7;
}

export async function rencanakanBerikutnya(formData: FormData) {
  const seriesId = Number(formData.get("series_id"));
  if (!Number.isInteger(seriesId) || seriesId <= 0) {
    throw new Error("ID serial tidak valid.");
  }

  const [sRows] = await db.query(`SELECT id, judul, tema FROM content_series WHERE id = ?`, [seriesId]);
  const serial = (sRows as { id: number; judul: string; tema: string }[])[0];
  if (!serial) throw new Error("Serial tidak ditemukan.");

  const [eRows] = await db.query(
    `SELECT nomor_episode, judul, status, naskah FROM productions
     WHERE series_id = ? ORDER BY nomor_episode`,
    [seriesId]
  );
  const lama = eRows as { nomor_episode: number; judul: string; status: string; naskah: string | null }[];
  const terakhir = lama[lama.length - 1];
  if (terakhir && terakhir.status === "planned") {
    throw new Error(`Part ${terakhir.nomor_episode} belum diriset. Selesaikan dulu sebelum merencanakan episode berikutnya.`);
  }

  const [berjalan] = await db.query(
    `SELECT id FROM tasks WHERE judul LIKE 'Rencana:%' AND status='running'
     AND dimulai_pada > (NOW() - INTERVAL 5 MINUTE) LIMIT 1`
  );
  if ((berjalan as unknown[]).length > 0) throw new Error("Perencanaan sedang berjalan.");

  const [gagalRows] = await db.query(
    `SELECT COUNT(*) AS jumlah FROM tasks
     WHERE judul LIKE 'Rencana:%' AND status='failed'
       AND id > COALESCE((SELECT MAX(t.id) FROM tasks t WHERE t.judul LIKE 'Rencana:%' AND t.status='done'), 0)`
  );
  const jumlahGagal = Number((gagalRows as { jumlah: number }[])[0].jumlah);
  if (jumlahGagal >= MAKS_PERCOBAAN) {
    throw new Error(`Perencanaan sudah gagal ${jumlahGagal} kali berturut-turut. Batas percobaan tercapai.`);
  }

  const [aRows] = await db.query(`SELECT id FROM agents WHERE kode='ceo_agent' LIMIT 1`);
  const agent = (aRows as { id: number }[])[0];
  if (!agent) throw new Error("Agent CEO tidak ditemukan.");

  const nomorBaru = (terakhir?.nomor_episode ?? 0) + 1;
  const [hasil] = await db.query(
    `INSERT INTO tasks (judul, deskripsi, agent_id, status, percobaan, maks_percobaan, dimulai_pada)
     VALUES (?, ?, ?, 'running', ?, ?, NOW())`,
    [
      `Rencana: ${serial.judul} Part ${nomorBaru}`,
      `Merencanakan Part ${nomorBaru} untuk serial ${serial.judul}`,
      agent.id,
      jumlahGagal + 1,
      MAKS_PERCOBAAN,
    ]
  );
  const taskId = (hasil as { insertId: number }).insertId;

  await db.query(
    `UPDATE agents SET status='working', tugas_saat_ini=?, status_diubah_pada=NOW() WHERE id=?`,
    [`Rencana: Part ${nomorBaru}`, agent.id]
  );

  try {
    let pengait = "";
    if (terakhir?.naskah) {
      try {
        pengait = (JSON.parse(terakhir.naskah) as { pengait?: string }).pengait ?? "";
      } catch {
        pengait = "";
      }
    }
    const daftarLama: EpisodeLama[] = lama.map((e) => ({ nomor_episode: e.nomor_episode, judul: e.judul }));

    let pilihan: { judul: string; catatan_kesinambungan: string } | null = null;
    let catatan = "";
    for (let coba = 1; coba <= 2; coba++) {
      const { rencana } = await rencanakanEpisode(serial.tema, serial.judul, daftarLama, pengait, catatan);
      const judul = String(rencana.judul ?? "").trim();
      const bentrok = lama.find((e) => terlaluMirip(e.judul, judul));
      if (!judul || judul.length > 120) {
        catatan = "PERBAIKAN: judul kosong atau terlalu panjang. Maksimal 90 karakter.";
      } else if (bentrok) {
        catatan = `PERBAIKAN: judul "${judul}" terlalu mirip dengan "${bentrok.judul}". Pilih topik yang benar-benar baru.`;
      } else {
        pilihan = { judul, catatan_kesinambungan: String(rencana.catatan_kesinambungan ?? "").slice(0, 1000) };
        break;
      }
    }
    if (!pilihan) {
      throw new Error("Gemini tidak menghasilkan judul baru yang berbeda dari episode sebelumnya.");
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO productions (series_id, nomor_episode, judul, status, catatan_kesinambungan)
         VALUES (?, ?, ?, 'planned', ?)`,
        [seriesId, nomorBaru, pilihan.judul, pilihan.catatan_kesinambungan]
      );
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
    const pesan = error instanceof Error ? error.message : "Terjadi kesalahan saat merencanakan episode.";
    await db.query(
      `UPDATE tasks SET status='failed', catatan_error=?, selesai_pada=NOW() WHERE id=?`,
      [pesan.slice(0, 5000), taskId]
    );
    await db.query(`UPDATE agents SET status='error', status_diubah_pada=NOW() WHERE id=?`, [agent.id]);
  }

  revalidatePath("/serial");
  revalidatePath("/agents");
  redirect("/serial");
}