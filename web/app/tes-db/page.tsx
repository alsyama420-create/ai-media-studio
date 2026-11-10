import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";

async function Hasil() {
  await connection();
  try {
    const [rows] = await db.query("SELECT NOW() AS waktu, DATABASE() AS nama_db");
    const data = (rows as { waktu: Date; nama_db: string }[])[0];
    return (
      <main style={{ padding: 24 }}>
        <h1>Koneksi database berhasil</h1>
        <p>Database: {data.nama_db}</p>
        <p>Waktu server: {String(data.waktu)}</p>
      </main>
    );
  } catch (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Koneksi database GAGAL</h1>
        <p>{String(error)}</p>
      </main>
    );
  }
}

export default function TesDb() {
  return (
    <Suspense fallback={<p>Memuat...</p>}>
      <Hasil />
    </Suspense>
  );
}