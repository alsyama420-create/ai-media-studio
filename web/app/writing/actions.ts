"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const MAKS_PERCOBAAN = 3;
const MIN_FAKTA = 3;
const MAKS_KATA = 150;

const KATA_UMUM = new Set([
  "mengapa", "kenapa", "bagaimana", "apa", "apakah", "siapa", "kapan",
  "dimana", "yang", "dan", "atau", "kita", "kami", "kamu", "anda",
  "harus", "perlu", "bisa", "dapat", "untuk", "dengan", "pada", "adalah",
  "itu", "ini", "akan", "ada", "tidak", "para", "oleh", "dalam", "serta",
  "agar", "saat", "ketika", "jika", "lebih", "sangat", "seperti",
  "tentang", "episode", "part", "bagian", "dari", "ke",
]);

function ambilKataKunci(judul: string): string[] {
  const kata = judul
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((k) => k.length > 2 && !KATA_UMUM.has(k));
  const unik = Array.from(new Set(kata)).slice(0, 4);
  return unik.length > 0 ? unik : [judul.toLowerCase().trim()];
}

function bersihkan(teks: string): string {
  return teks.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

function pecahKalimat(teks: string): string[] {
  return bersihkan(teks)
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 40 && k.length <= 220);
}

function hitungKata(teks: string): number {
  return teks.split(/\s+/).filter(Boolean).length;
}

type Sumber = { judul_sumber: string; url: string; ringkasan: string };
type Fakta = { teks: string; sumber: string; url: string };

export async function buatNaskah(formData: FormData) {
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
  if (!production) {
    throw new Error("Episode tidak ditemukan.");
  }
  if (!["researched", "writing", "fact_check"].includes(production.status)) {
    throw new Error(
      `Naskah belum bisa dibuat. Status episode sekarang: ${production.status}. Riset harus selesai dulu.`
    );
  }

  const [berjalanRows] = await db.query(
    `SELECT id FROM tasks
     WHERE production_id = ? AND judul LIKE 'Naskah:%'
       AND status = 'running'
       AND dimulai_pada > (NOW() - INTERVAL 10 MINUTE)
     LIMIT 1`,
    [productionId]
  );
  if ((berjalanRows as unknown[]).length > 0) {
    throw new Error("Pembuatan naskah untuk episode ini sedang berjalan.");
  }

  const [gagalRows] = await db.query(
    `SELECT COUNT(*) AS jumlah FROM tasks
     WHERE production_id = ? AND judul LIKE 'Naskah:%' AND status = 'failed'`,
    [productionId]
  );
  const jumlahGagal = Number((gagalRows as { jumlah: number }[])[0].jumlah);
  if (jumlahGagal >= MAKS_PERCOBAAN) {
    throw new Error(
      `Pembuatan naskah sudah gagal ${jumlahGagal} kali. Batas percobaan tercapai.`
    );
  }

  const [agentRows] = await db.query(
    `SELECT id FROM agents WHERE kode = 'writing_agent' LIMIT 1`
  );
  const agent = (agentRows as { id: number }[])[0];
  if (!agent) {
    throw new Error("Agent Writing tidak ditemukan.");
  }

  const [taskResult] = await db.query(
    `INSERT INTO tasks
      (judul, deskripsi, agent_id, production_id, status,
       percobaan, maks_percobaan, dimulai_pada)
     VALUES (?, ?, ?, ?, 'running', ?, ?, NOW())`,
    [
      `Naskah: ${production.judul}`,
      `Menyusun naskah 60 detik untuk episode ${production.judul}`,
      agent.id,
      productionId,
      jumlahGagal + 1,
      MAKS_PERCOBAAN,
    ]
  );
  const taskId = (taskResult as { insertId: number }).insertId;

  await db.query(
    `UPDATE agents
     SET status = 'working', tugas_saat_ini = ?, status_diubah_pada = NOW()
     WHERE id = ?`,
    [`Naskah: ${production.judul}`, agent.id]
  );
  await db.query(`UPDATE productions SET status = 'writing' WHERE id = ?`, [
    productionId,
  ]);

  try {
    const [sumberRows] = await db.query(
      `SELECT judul_sumber, url, ringkasan FROM research_sources
       WHERE production_id = ? ORDER BY id`,
      [productionId]
    );
    const sumber = sumberRows as Sumber[];
    if (sumber.length === 0) {
      throw new Error("Tidak ada sumber riset untuk episode ini.");
    }

    const kataKunci = ambilKataKunci(production.judul);
    const urut = [...sumber].sort((a, b) => {
      const sa = kataKunci.some((k) => a.judul_sumber.toLowerCase().includes(k)) ? 0 : 1;
      const sb = kataKunci.some((k) => b.judul_sumber.toLowerCase().includes(k)) ? 0 : 1;
      return sa - sb;
    });

    const hook = `Pernahkah kamu bertanya-tanya, ${production.judul
      .replace(/\?+$/, "")
      .toLowerCase()}?`;
    const penutup = "Itulah beberapa fakta menarik untuk hari ini.";
    const pengait = `Di Part ${
      production.nomor_episode + 1
    }, kita lanjutkan petualangan pengetahuan ini. Ikuti terus!`;

    let total = hitungKata(hook) + hitungKata(penutup) + hitungKata(pengait);
    const fakta: Fakta[] = [];
    const dipakai = new Set<string>();

    for (let putaran = 0; putaran < 2; putaran++) {
      for (const s of urut) {
        const kalimat = pecahKalimat(s.ringkasan)
          .slice(0, 8)
          .filter(
            (k) =>
              kataKunci.some((kk) => k.toLowerCase().includes(kk)) &&
              !dipakai.has(k)
          );
        const pilih = kalimat[0];
        if (!pilih) continue;
        const kata = hitungKata(pilih);
        if (total + kata > MAKS_KATA) continue;
        fakta.push({ teks: pilih, sumber: s.judul_sumber, url: s.url });
        dipakai.add(pilih);
        total += kata;
      }
    }

    if (fakta.length < MIN_FAKTA) {
      throw new Error(
        `Hanya ${fakta.length} kalimat fakta yang layak dipakai (minimal ${MIN_FAKTA}). Naskah tidak dibuat.`
      );
    }

    const naskah = {
      hook,
      fakta,
      penutup,
      pengait,
      jumlah_kata: total,
      perkiraan_detik: Math.round(total / 2.5),
    };

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE productions SET naskah = ?, status = 'fact_check' WHERE id = ?`,
        [JSON.stringify(naskah), productionId]
      );
      await conn.query(
        `UPDATE tasks SET status = 'done', catatan_error = NULL, selesai_pada = NOW()
         WHERE id = ?`,
        [taskId]
      );
      await conn.query(
        `UPDATE agents
         SET status = 'idle', tugas_saat_ini = NULL, status_diubah_pada = NOW()
         WHERE id = ?`,
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
    const pesan =
      error instanceof Error ? error.message : "Terjadi kesalahan saat menulis naskah.";
    await db.query(
      `UPDATE tasks SET status = 'failed', catatan_error = ?, selesai_pada = NOW()
       WHERE id = ?`,
      [pesan.slice(0, 5000), taskId]
    );
    await db.query(
      `UPDATE agents SET status = 'error', status_diubah_pada = NOW() WHERE id = ?`,
      [agent.id]
    );
    await db.query(`UPDATE productions SET status = 'researched' WHERE id = ?`, [
      productionId,
    ]);
  }

  revalidatePath("/writing");
  revalidatePath("/agents");
  redirect("/writing");
}