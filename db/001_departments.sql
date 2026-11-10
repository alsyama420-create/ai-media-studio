CREATE TABLE departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(30) NOT NULL UNIQUE,
  nama VARCHAR(100) NOT NULL,
  deskripsi VARCHAR(255) NOT NULL,
  urutan TINYINT UNSIGNED NOT NULL,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO departments (kode, nama, deskripsi, urutan) VALUES
('ceo', 'CEO', 'Mengatur perusahaan dan membagikan pekerjaan', 1),
('research', 'Research', 'Mencari topik dan sumber informasi', 2),
('writing', 'Writing', 'Membuat naskah', 3),
('fact_checking', 'Fact Checking', 'Memeriksa kebenaran informasi', 4),
('storyboard', 'Storyboard', 'Membagi naskah menjadi adegan', 5),
('animation', 'Animation', 'Membuat animasi kartun 2D', 6),
('audio', 'Audio', 'Membuat narasi suara AI', 7),
('editing', 'Editing', 'Menggabungkan gambar, audio, subtitle, dan video', 8),
('quality_control', 'Quality Control', 'Memeriksa hasil akhir', 9),
('publishing', 'Publishing', 'Mengatur jadwal dan publikasi', 10);