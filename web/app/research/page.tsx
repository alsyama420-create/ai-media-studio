
"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type Production = {
  id: number;
  judul: string;
  status: string;
};

type Agent = {
  id: number;
};

type SearchResult = {
  pageid: number;
  title: string;
};

type Article = {
  title: string;
  extract?: string;
};

const kataUmum = new Set([
  "mengapa", "kita", "harus", "yang", "dan", "untuk",
  "dari", "dengan", "apa", "bagaimana", "apakah",
  "manusia", "episode", "tentang", "dalam", "pada",
]);

export async function jalankanRiset(formData: FormData) {
  const productionId = Number(formData.get("production_id"));

  if (!Number.isInteger(productionId) || productionId <= 0) {
    throw new Error("ID episode tidak valid.");
  }

  const [productionRows] = await db.query(
    `SELECT id, judul, status
     FROM productions
     WHERE id = ?`,
    [productionId]
  );

  const production = (productionRows as Production[])[0];

  if (!production) {
    throw new Error("Episode tidak ditemukan.");
  }

  if (
    production.status === "published" ||
    production.status === "researching" ||
    production.status === "researched"
  ) {
    redirect("/research");
  }

  const [researchAgents] = await db.query(
    `SELECT id FROM agents
     WHERE LOWER(kode) LIKE '%research%'
        OR LOWER(kode) LIKE '%riset%'
        OR LOWER(nama) LIKE '%riset%'
        OR LOWER(nama) LIKE '%penelitian%'
     LIMIT 1`
  );

  const researchAgent = (researchAgents as Agent[])[0];

  if (!researchAgent) {
    throw new Error("Research Agent tidak ditemukan.");
  }

  const [taskResult] = await db.query(
    `INSERT INTO tasks
      (judul, deskripsi, agent_id, production_id,
       status, percobaan, dimulai_pada)
     VALUES (?, ?, ?, ?, 'running', 1, NOW())`,
    [
      `Riset: ${production.judul}`,
      `Mengumpulkan sumber relevan untuk episode ${production.judul}`,
      researchAgent.id,
      productionId,
    ]
  );

  const taskId = (taskResult as { insertId: number }).insertId;

  await db.query(
    `UPDATE agents
     SET status = 'working',
         tugas_saat_ini = ?,
         status_diubah_pada = NOW()
     WHERE id = ?`,
    [`Riset: ${production.judul}`, researchAgent.id]
  );

  await db.query(
    `UPDATE productions SET status = 'researching' WHERE id = ?`,
    [productionId]
  );

  try {
    // Membuat kata kunci dari judul episode.
    const kataKunci = production.judul
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((kata) => kata.length > 2 && !kataUmum.has(kata));

    if (kataKunci.length === 0) {
      throw new Error("Tidak bisa membuat kata kunci riset.");
    }

    const pencarian = kataKunci.join(" ");

    // Pencarian artikel Wikipedia Indonesia gratis.
    const searchUrl =
      "https://id.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: pencarian,
        srlimit: "15",
        format: "json",
        utf8: "1",
      });

    const searchResponse = await fetch(searchUrl, {
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent": "AI-Media-Studio/1.0",
      },
      cache: "no-store",
    });

    if (!searchResponse.ok) {
      throw new Error("Wikipedia tidak bisa diakses.");
    }

    const searchData = await searchResponse.json();

    const hasil = (
      searchData.query?.search ?? []
    ) as SearchResult[];

    // Filter berdasarkan kecocokan kata kunci pada judul artikel.
    const kandidat = hasil
      .filter((artikel) => {
        const judul = artikel.title.toLowerCase();

        return kataKunci.some((kata) => judul.includes(kata));
      })
      .slice(0, 8);

    if (kandidat.length === 0) {
      throw new Error(
        "Tidak ditemukan artikel dengan judul yang relevan. Perlu kata kunci yang lebih spesifik."
      );
    }

    const pageIds = kandidat
      .map((artikel) => artikel.pageid)
      .join("|");

    const articleUrl =
      "https://id.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        pageids: pageIds,
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        format: "json",
      });

    const articleResponse = await fetch(articleUrl, {
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent": "AI-Media-Studio/1.0",
      },
      cache: "no-store",
    });

    if (!articleResponse.ok) {
      throw new Error("Gagal mengambil isi artikel.");
    }

    const articleData = await articleResponse.json();

    const articles = Object.values(
      articleData.query?.pages ?? {}
    ) as Article[];

    const artikelRelevan = articles.filter((artikel) => {
      const judul = artikel.title.toLowerCase();

      return (
        artikel.extract?.trim() &&
        kataKunci.some((kata) => judul.includes(kata))
      );
    });

    if (artikelRelevan.length === 0) {
      throw new Error("Tidak ada artikel relevan yang memiliki isi.");
    }

    // Hanya mengganti sumber lama setelah sumber baru ditemukan.
    await db.query(
      "DELETE FROM research_sources WHERE production_id = ?",
      [productionId]
    );

    const ringkasan: string[] = [];

    for (const artikel of artikelRelevan.slice(0, 5)) {
      const sumber = kandidat.find(
        (item) => item.title === artikel.title
      );

      if (!sumber || !artikel.extract) continue;

      const url =
        `https://id.wikipedia.org/?curid=${sumber.pageid}`;

      await db.query(
        `INSERT INTO research_sources
          (production_id, judul_sumber, url, penerbit,
           ringkasan, status_verifikasi)
         VALUES (?, ?, ?, 'Wikipedia Indonesia', ?, 'pending')`,
        [
          productionId,
          artikel.title,
          url,
          artikel.extract.slice(0, 60000),
        ]
      );

      ringkasan.push(
        `SUMBER: ${artikel.title}\n${url}\n${artikel.extract}`
      );
    }

    if (ringkasan.length === 0) {
      throw new Error("Tidak ada sumber yang berhasil disimpan.");
    }

    const hasilRiset = ringkasan.join("\n\n--------------------\n\n");

    await db.query(
      `UPDATE productions
       SET status = 'researched',
           ringkasan_riset = ?
       WHERE id = ?`,
      [hasilRiset.slice(0, 100000), productionId]
    );

    await db.query(
      `UPDATE tasks
       SET status = 'done',
           catatan_error = NULL,
           selesai_pada = NOW()
       WHERE id = ?`,
      [taskId]
    );

    await db.query(
      `UPDATE agents
       SET status = 'idle',
           tugas_saat_ini = NULL,
           status_diubah_pada = NOW()
       WHERE id = ?`,
      [researchAgent.id]
    );

    // Membuat tugas Writing Agent secara otomatis.
    const [writingAgents] = await db.query(
      `SELECT id FROM agents
       WHERE LOWER(kode) LIKE '%writing%'
          OR LOWER(kode) LIKE '%penulis%'
          OR LOWER(nama) LIKE '%penulis%'
          OR LOWER(nama) LIKE '%penulisan%'
       LIMIT 1`
    );

    const writingAgent = (writingAgents as Agent[])[0];

    if (writingAgent) {
      const [existingTasks] = await db.query(
        `SELECT id FROM tasks
         WHERE production_id = ?
           AND agent_id = ?
           AND status IN ('pending', 'running')
         LIMIT 1`,
        [productionId, writingAgent.id]
      );

      if ((existingTasks as { id: number }[]).length === 0) {
        await db.query(
          `INSERT INTO tasks
            (judul, deskripsi, agent_id, production_id, status)
           VALUES (?, ?, ?, ?, 'pending')`,
          [
            `Penulisan: ${production.judul}`,
            "Buat naskah video edukasi berdurasi 60 detik berdasarkan ringkasan riset dan sumber yang tersimpan pada episode ini. Jangan membuat fakta tanpa sumber.",
            writingAgent.id,
            productionId,
          ]
        );
      }
    }

  } catch (error) {
    const pesan = error instanceof Error
      ? error.message
      : "Terjadi kesalahan saat riset.";

    await db.query(
      `UPDATE tasks
       SET status = 'failed',
           catatan_error = ?,
           selesai_pada = NOW()
       WHERE id = ?`,
      [pesan.slice(0, 5000), taskId]
    );

    await db.query(
      `UPDATE agents
       SET status = 'error',
           status_diubah_pada = NOW()
       WHERE id = ?`,
      [researchAgent.id]
    );

    await db.query(
      `UPDATE productions
       SET status = 'failed'
       WHERE id = ?`,
      [productionId]
    );
  }

  revalidatePath("/research");
  revalidatePath("/agents");
  redirect("/research");
}

