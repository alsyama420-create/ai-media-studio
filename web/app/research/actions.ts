
"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type HasilPencarian = {
  pageid: number;
  title: string;
};

type HasilArtikel = {
  title: string;
  extract?: string;
};

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

  const production = (
    productionRows as {
      id: number;
      judul: string;
      status: string;
    }[]
  )[0];

  if (!production) {
    throw new Error("Episode tidak ditemukan.");
  }

  if (production.status === "published") {
    throw new Error("Episode sudah dipublikasikan.");
  }

  const [agentRows] = await db.query(
    `SELECT id
     FROM agents
     WHERE LOWER(nama) LIKE '%riset%'
        OR LOWER(kode) LIKE '%research%'
        OR LOWER(kode) LIKE '%riset%'
     LIMIT 1`
  );

  const agent = (
    agentRows as { id: number }[]
  )[0];

  if (!agent) {
    throw new Error("Agen Riset tidak ditemukan.");
  }

  const [taskResult] = await db.query(
    `INSERT INTO tasks
      (judul, deskripsi, agent_id, production_id, status,
       percobaan, dimulai_pada)
     VALUES (?, ?, ?, ?, 'running', 1, NOW())`,
    [
      `Riset: ${production.judul}`,
      `Mengumpulkan sumber informasi untuk episode ${production.judul}`,
      agent.id,
      productionId,
    ]
  );

  const taskId = (
    taskResult as { insertId: number }
  ).insertId;

  await db.query(
    `UPDATE agents
     SET status = 'working',
         tugas_saat_ini = ?,
         status_diubah_pada = NOW()
     WHERE id = ?`,
    [`Riset: ${production.judul}`, agent.id]
  );

  await db.query(
    `UPDATE productions
     SET status = 'researching'
     WHERE id = ?`,
    [productionId]
  );

  try {
    // Pencarian sumber gratis melalui Wikipedia Indonesia.
    const kataKunci = "tidur fungsi otak kesehatan manusia";

    const searchUrl =
      "https://id.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: kataKunci,
        srlimit: "5",
        format: "json",
        utf8: "1",
      });

    const searchResponse = await fetch(searchUrl, {
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent": "AI-Media-Studio/1.0",
      },
    });

    if (!searchResponse.ok) {
      throw new Error("Gagal menghubungi Wikipedia.");
    }

    const searchData = await searchResponse.json();

    const hasil = (
      searchData.query?.search ?? []
    ) as HasilPencarian[];

    if (hasil.length === 0) {
      throw new Error("Tidak ditemukan artikel untuk riset.");
    }

    const pageIds = hasil
      .map((item) => item.pageid)
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
    });

    if (!articleResponse.ok) {
      throw new Error("Gagal mengambil isi artikel.");
    }

    const articleData = await articleResponse.json();

    const pages = Object.values(
      articleData.query?.pages ?? {}
    ) as HasilArtikel[];

    let ringkasan = "";

    for (const artikel of pages) {
      if (!artikel.extract?.trim()) continue;

      const sumber = hasil.find(
        (item) => item.title === artikel.title
      );

      if (!sumber) continue;

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

      ringkasan +=
        `\n\nSUMBER: ${artikel.title}\n${url}\n${artikel.extract}`;
    }

    if (!ringkasan.trim()) {
      throw new Error("Artikel ditemukan tetapi isinya kosong.");
    }

    await db.query(
      `UPDATE productions
       SET status = 'researched',
           ringkasan_riset = ?
       WHERE id = ?`,
      [ringkasan.slice(0, 100000), productionId]
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
      [agent.id]
    );

  } catch (error) {
    const pesan = error instanceof Error
      ? error.message
      : "Terjadi kesalahan saat melakukan riset.";

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
      [agent.id]
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
