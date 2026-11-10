"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const MAKS_PERCOBAAN = 3;
const MIN_SUMBER = 2;
const MAKS_SUMBER = 5;

type HasilPencarian = { pageid: number; title: string };
type HasilArtikel = { pageid: number; title: string; extract?: string };

const KATA_UMUM = new Set([
  "mengapa", "kenapa", "bagaimana", "apa", "apakah", "siapa", "kapan",
  "dimana", "yang", "dan", "atau", "kita", "kami", "kamu", "anda",
  "harus", "perlu", "bisa", "dapat", "untuk", "dengan", "pada", "adalah",
  "itu", "ini", "akan", "ada", "tidak", "para", "oleh", "dalam", "serta",
  "agar", "saat", "ketika", "jika", "lebih", "sangat", "seperti",
  "tentang", "episode", "part", "bagian", "dari", "ke",
]);

const HALAMAN_PENGALIH = /dapat merujuk (ke|pada)|may refer to/i;

function ambilKataKunci(judul: string): string[] {
  const kata = judul
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((k) => k.length > 2 && !KATA_UMUM.has(k));
  const unik = Array.from(new Set(kata)).slice(0, 4);
  return unik.length > 0 ? unik : [judul.toLowerCase().trim()];
}

function hitung(teks: string, kata: string): number {
  return teks.split(kata).length - 1;
}

export async function jalankanRiset(formData: FormData) {
  const productionId = Number(formData.get("production_id"));

  if (!Number.isInteger(productionId) || productionId <= 0) {
    throw new Error("ID episode tidak valid.");
  }

  const [productionRows] = await db.query(
    `SELECT id, judul, status FROM productions WHERE id = ?`,
    [productionId]
  );
  const production = (
    productionRows as { id: number; judul: string; status: string }[]
  )[0];

  if (!production) {
    throw new Error("Episode tidak ditemukan.");
  }
  if (production.status === "published") {
    throw new Error("Episode sudah dipublikasikan.");
  }

  const [berjalanRows] = await db.query(
    `SELECT id FROM tasks
     WHERE production_id = ? AND judul LIKE 'Riset:%'
       AND status = 'running'
       AND dimulai_pada > (NOW() - INTERVAL 10 MINUTE)
     LIMIT 1`,
    [productionId]
  );
  if ((berjalanRows as unknown[]).length > 0) {
    throw new Error("Riset untuk episode ini sedang berjalan.");
  }

  const [gagalRows] = await db.query(
    `SELECT COUNT(*) AS jumlah FROM tasks
     WHERE production_id = ? AND judul LIKE 'Riset:%' AND status = 'failed'`,
    [productionId]
  );
  const jumlahGagal = Number((gagalRows as { jumlah: number }[])[0].jumlah);
  if (jumlahGagal >= MAKS_PERCOBAAN) {
    throw new Error(
      `Riset sudah gagal ${jumlahGagal} kali. Batas percobaan tercapai.`
    );
  }

  const [agentRows] = await db.query(
    `SELECT id FROM agents
     WHERE LOWER(nama) LIKE '%riset%'
        OR LOWER(kode) LIKE '%research%'
        OR LOWER(kode) LIKE '%riset%'
     LIMIT 1`
  );
  const agent = (agentRows as { id: number }[])[0];
  if (!agent) {
    throw new Error("Agen Riset tidak ditemukan.");
  }

  const [taskResult] = await db.query(
    `INSERT INTO tasks
      (judul, deskripsi, agent_id, production_id, status,
       percobaan, maks_percobaan, dimulai_pada)
     VALUES (?, ?, ?, ?, 'running', ?, ?, NOW())`,
    [
      `Riset: ${production.judul}`,
      `Mengumpulkan sumber informasi untuk episode ${production.judul}`,
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
    [`Riset: ${production.judul}`, agent.id]
  );
  await db.query(
    `UPDATE productions SET status = 'researching' WHERE id = ?`,
    [productionId]
  );

  try {
    const kataKunci = ambilKataKunci(production.judul);
    const kueri = kataKunci.join(" ");

    const searchUrl =
      "https://id.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: kueri,
        srlimit: "10",
        format: "json",
        utf8: "1",
      });

    const searchResponse = await fetch(searchUrl, {
      signal: AbortSignal.timeout(30000),
      headers: { "User-Agent": "AI-Media-Studio/1.0" },
    });
    if (!searchResponse.ok) {
      throw new Error("Gagal menghubungi Wikipedia.");
    }
    const searchData = await searchResponse.json();
    const hasil = (searchData.query?.search ?? []) as HasilPencarian[];

    if (hasil.length === 0) {
      throw new Error(`Wikipedia tidak menemukan artikel untuk "${kueri}".`);
    }

    const articleUrl =
      "https://id.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        pageids: hasil.map((h) => h.pageid).join("|"),
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        format: "json",
      });

    const articleResponse = await fetch(articleUrl, {
      signal: AbortSignal.timeout(30000),
      headers: { "User-Agent": "AI-Media-Studio/1.0" },
    });
    if (!articleResponse.ok) {
      throw new Error("Gagal mengambil isi artikel.");
    }
    const articleData = await articleResponse.json();
    const pages = Object.values(
      articleData.query?.pages ?? {}
    ) as HasilArtikel[];

    const terpilih = pages
      .filter((a) => {
        const isi = (a.extract ?? "").trim();
        return isi.length >= 150 && !HALAMAN_PENGALIH.test(isi);
      })
      .map((a) => {
        const judulKecil = a.title.toLowerCase();
        const isiKecil = (a.extract ?? "").toLowerCase();
        const relevan =
          kataKunci.some((k) => judulKecil.includes(k)) ||
          kataKunci.some((k) => hitung(isiKecil, k) >= 2);
        const skor = kataKunci.reduce(
          (total, k) =>
            total +
            (judulKecil.includes(k) ? 5 : 0) +
            Math.min(hitung(isiKecil, k), 5),
          0
        );
        return { pageid: a.pageid, title: a.title, extract: a.extract ?? "", relevan, skor };
      })
      .filter((a) => a.relevan)
      .sort((a, b) => b.skor - a.skor)
      .slice(0, MAKS_SUMBER);

    if (terpilih.length < MIN_SUMBER) {
      throw new Error(
        `Hanya ${terpilih.length} artikel relevan untuk kata kunci "${kueri}" (minimal ${MIN_SUMBER}). Riset tidak dianggap selesai.`
      );
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      let ringkasan = "";
      for (const artikel of terpilih) {
        const url = `https://id.wikipedia.org/?curid=${artikel.pageid}`;

        const [adaRows] = await conn.query(
          `SELECT id FROM research_sources
           WHERE production_id = ? AND url = ? LIMIT 1`,
          [productionId, url]
        );
        if ((adaRows as unknown[]).length === 0) {
          await conn.query(
            `INSERT INTO research_sources
              (production_id, judul_sumber, url, penerbit,
               ringkasan, status_verifikasi)
             VALUES (?, ?, ?, 'Wikipedia Indonesia', ?, 'pending')`,
            [productionId, artikel.title, url, artikel.extract.slice(0, 60000)]
          );
        }

        ringkasan += `\n\nSUMBER: ${artikel.title}\n${url}\n${artikel.extract}`;
      }

      await conn.query(
        `UPDATE productions
         SET status = 'researched', ringkasan_riset = ?
         WHERE id = ?`,
        [ringkasan.slice(0, 100000), productionId]
      );
      await conn.query(
        `UPDATE tasks
         SET status = 'done', catatan_error = NULL, selesai_pada = NOW()
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
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat melakukan riset.";

    await db.query(
      `UPDATE tasks
       SET status = 'failed', catatan_error = ?, selesai_pada = NOW()
       WHERE id = ?`,
      [pesan.slice(0, 5000), taskId]
    );
    await db.query(
      `UPDATE agents SET status = 'error', status_diubah_pada = NOW()
       WHERE id = ?`,
      [agent.id]
    );
    await db.query(
      `UPDATE productions SET status = 'failed' WHERE id = ?`,
      [productionId]
    );
  }

  revalidatePath("/research");
  revalidatePath("/agents");
  redirect("/research");
}