import hashlib
import json
import subprocess
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent
TMP = BASE / "tmp"
HASIL = BASE / "hasil"
TMP.mkdir(exist_ok=True)
HASIL.mkdir(exist_ok=True)

W, H = 1080, 1920
SUARA = "id-ID-ArdiNeural"
TARGET = 60.0
JEDA = 0.4
SUMBER_BUANG = {"Polisi tidur"}
WARNA = [(255, 236, 179), (200, 230, 255), (210, 245, 210), (255, 214, 214), (230, 215, 250)]


def jalankan(cmd, batas=None):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=batas)
    if r.returncode != 0:
        print("GAGAL pada perintah:", " ".join(str(c) for c in cmd[:5]))
        print(r.stderr[-1500:])
        sys.exit(1)
    return r.stdout


def font(ukuran):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", ukuran)
    except OSError:
        return ImageFont.load_default()


def buat_suara(teks, path):
    for percobaan in range(1, 4):
        try:
            r = subprocess.run(
                [sys.executable, "-m", "edge_tts", "--voice", SUARA,
                 "--text", teks, "--write-media", str(path)],
                capture_output=True, text=True, encoding="utf-8",
                errors="replace", timeout=90)
            if r.returncode == 0 and path.exists() and path.stat().st_size > 0:
                return
            print(f"  percobaan {percobaan} gagal: {r.stderr[-300:]}")
        except subprocess.TimeoutExpired:
            print(f"  percobaan {percobaan} melewati 90 detik, mengulang...")
    print("GAGAL: layanan suara tidak menjawab. Periksa internet lalu jalankan ulang.")
    sys.exit(1)


def durasi(path):
    out = jalankan(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", str(path)])
    return float(out.strip())


def gambar(idx, teks, buka, naik, ada_sumber, path):
    img = Image.new("RGB", (W, H), WARNA[idx % len(WARNA)])
    d = ImageDraw.Draw(img)
    cx, cy = W // 2, 640 - (12 if naik else 0)
    d.rounded_rectangle((cx - 170, cy + 200, cx + 170, cy + 520), 60, fill=(70, 130, 200))
    d.ellipse((cx - 220, cy - 220, cx + 220, cy + 220), fill=(255, 205, 160),
              outline=(60, 40, 30), width=8)
    for dx in (-90, 90):
        d.ellipse((cx + dx - 28, cy - 70, cx + dx + 28, cy - 14), fill="white",
                  outline="black", width=5)
        d.ellipse((cx + dx - 12, cy - 52, cx + dx + 12, cy - 28), fill="black")
    if buka:
        d.ellipse((cx - 60, cy + 60, cx + 60, cy + 140), fill=(120, 30, 30),
                  outline="black", width=6)
    else:
        d.arc((cx - 70, cy + 60, cx + 70, cy + 130), 20, 160, fill="black", width=8)
    d.text((W // 2, 70), "AI Media Studio", font=font(48), fill=(60, 60, 60), anchor="ma")
    y = 1150
    for baris in textwrap.wrap(teks, 24):
        d.text((W // 2, y), baris, font=font(56), fill=(30, 30, 30), anchor="ma")
        y += 74
    if ada_sumber:
        d.text((W // 2, 1840), "Sumber: Wikipedia Indonesia (CC BY-SA)",
               font=font(34), fill=(80, 80, 80), anchor="ma")
    img.save(path)


data = json.loads((BASE / "naskah.json").read_text(encoding="utf-8-sig"))
segmen = [(data["hook"], False)]
segmen += [(f["teks"], True) for f in data["fakta"] if f.get("sumber") not in SUMBER_BUANG]
segmen += [(data["penutup"], False), (data["pengait"], False)]
n = len(segmen)
print(f"Jumlah adegan: {n}")

suara = []
durs = []
for i, (teks, _) in enumerate(segmen):
    kode = hashlib.md5(teks.encode("utf-8")).hexdigest()[:10]
    p = TMP / f"s_{kode}.mp3"
    if not p.exists() or p.stat().st_size == 0:
        print(f"Membuat suara {i + 1}/{n} ...")
        buat_suara(teks, p)
    suara.append(p)
    durs.append(durasi(p))

total = sum(durs) + JEDA * n
print(f"Total suara: {total:.1f} detik")

if total > TARGET - 0.5:
    faktor = sum(durs) / (TARGET - 0.5 - JEDA * n)
    if faktor > 1.35:
        print(f"GAGAL: suara harus dipercepat {faktor:.2f}x, terlalu cepat. Naskah harus diperpendek.")
        sys.exit(1)
    print(f"Mempercepat suara {faktor:.2f}x ...")
    cepat = []
    for i, p in enumerate(suara):
        dst = TMP / f"c_{p.stem}_{int(faktor * 1000)}.mp3"
        jalankan(["ffmpeg", "-y", "-i", str(p), "-filter:a", f"atempo={faktor:.4f}", str(dst)])
        cepat.append(dst)
    suara = cepat
    durs = [durasi(p) for p in suara]
    total = sum(durs) + JEDA * n
    print(f"Total suara sekarang: {total:.1f} detik")

tambahan = (TARGET - total) / n
klip = []
for i, (teks, ada_sumber) in enumerate(segmen):
    a = TMP / f"f{i}a.png"
    b = TMP / f"f{i}b.png"
    gambar(i, teks, True, False, ada_sumber, a)
    gambar(i, teks, False, True, ada_sumber, b)
    dur_total = durs[i] + JEDA + tambahan
    jumlah = int(dur_total / 0.25) + 1
    baris = []
    for k in range(jumlah):
        f = a if k % 2 == 0 else b
        baris.append(f"file '{f.as_posix()}'")
        baris.append("duration 0.25")
    baris.append(f"file '{(a if jumlah % 2 == 0 else b).as_posix()}'")
    daftar = TMP / f"l{i}.txt"
    daftar.write_text("\n".join(baris), encoding="utf-8")
    out = TMP / f"k{i}.mp4"
    jalankan(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(daftar),
              "-i", str(suara[i]),
              "-vf", "fps=30,format=yuv420p",
              "-af", f"apad=whole_dur={dur_total:.3f}",
              "-t", f"{dur_total:.3f}",
              "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
              "-c:a", "aac", "-ar", "44100", "-ac", "2", str(out)])
    klip.append(out)
    print(f"Adegan {i + 1}/{n} selesai")

akhir = TMP / "akhir.txt"
akhir.write_text("\n".join(f"file '{p.as_posix()}'" for p in klip), encoding="utf-8")
hasil = HASIL / "episode-1.mp4"
jalankan(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(akhir),
          "-c", "copy", "-t", f"{TARGET}", str(hasil)])

info = jalankan(["ffprobe", "-v", "error", "-show_entries", "stream=width,height:format=duration",
                 "-of", "default=noprint_wrappers=1", str(hasil)])
print("SELESAI. Hasil:", hasil)
print(info)