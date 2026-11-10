CREATE TABLE agents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(40) NOT NULL UNIQUE,
  nama VARCHAR(100) NOT NULL,
  department_id INT UNSIGNED NOT NULL,
  peran VARCHAR(255) NOT NULL,
  status ENUM('idle', 'working', 'waiting', 'error') NOT NULL DEFAULT 'idle',
  tugas_saat_ini VARCHAR(255) NULL,
  status_diubah_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO agents (kode, nama, department_id, peran) VALUES
('ceo_agent', 'Agent CEO', 1, 'Membagikan pekerjaan dan menerjemahkan perintah CEO'),
('research_agent', 'Agent Research', 2, 'Mencari topik dan sumber informasi'),
('writing_agent', 'Agent Writing', 3, 'Menulis naskah video 60 detik'),
('fact_agent', 'Agent Fact Checking', 4, 'Memeriksa fakta dan sumber'),
('storyboard_agent', 'Agent Storyboard', 5, 'Membagi naskah menjadi adegan'),
('animation_agent', 'Agent Animation', 6, 'Membuat animasi kartun 2D'),
('audio_agent', 'Agent Audio', 7, 'Membuat narasi suara AI'),
('editing_agent', 'Agent Editing', 8, 'Menggabungkan gambar, audio, subtitle, dan video'),
('qc_agent', 'Agent Quality Control', 9, 'Memeriksa hasil akhir sebelum publikasi'),
('publishing_agent', 'Agent Publishing', 10, 'Mengatur jadwal dan publikasi');