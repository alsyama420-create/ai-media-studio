
CREATE TABLE content_series (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(50) NOT NULL UNIQUE,
  judul VARCHAR(200) NOT NULL,
  tema VARCHAR(255) NOT NULL,
  deskripsi TEXT NULL,
  status ENUM('active','paused','completed') NOT NULL DEFAULT 'active',
  catatan_kesinambungan TEXT NULL,
  episode_berikutnya INT UNSIGNED NOT NULL DEFAULT 1,
  mulai_berlaku DATE NOT NULL,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diubah_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE productions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  series_id INT UNSIGNED NOT NULL,
  nomor_episode INT UNSIGNED NOT NULL,
  judul VARCHAR(200) NOT NULL,
  status ENUM(
    'planned','researching','researched','writing',
    'fact_check','storyboard','animation','audio',
    'editing','quality_check','approved','scheduled',
    'published','failed'
  ) NOT NULL DEFAULT 'planned',
  ringkasan_riset LONGTEXT NULL,
  naskah LONGTEXT NULL,
  catatan_kesinambungan TEXT NULL,
  durasi_target_detik SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  jadwal_publikasi DATETIME NULL,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diubah_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  selesai_pada TIMESTAMP NULL,
  UNIQUE KEY unik_episode (series_id, nomor_episode),
  INDEX idx_productions_status (status),
  INDEX idx_productions_jadwal (jadwal_publikasi),
  CONSTRAINT fk_productions_series
    FOREIGN KEY (series_id) REFERENCES content_series(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE research_sources (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  production_id INT UNSIGNED NOT NULL,
  judul_sumber VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  penerbit VARCHAR(150) NULL,
  ringkasan TEXT NULL,
  status_verifikasi ENUM('pending','verified','rejected')
    NOT NULL DEFAULT 'pending',
  diperiksa_pada TIMESTAMP NULL,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sources_production (production_id),
  CONSTRAINT fk_sources_production
    FOREIGN KEY (production_id) REFERENCES productions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tasks
  ADD COLUMN production_id INT UNSIGNED NULL,
  ADD INDEX idx_tasks_production (production_id),
  ADD CONSTRAINT fk_tasks_production
    FOREIGN KEY (production_id) REFERENCES productions(id)
    ON DELETE SET NULL;

INSERT INTO content_series (
  kode, judul, tema, deskripsi,
  catatan_kesinambungan, mulai_berlaku
) VALUES (
  'SERIES-EDU-001',
  'Serial Pengetahuan',
  'Edukasi, fakta unik, dan pengetahuan',
  'Serial video edukasi berdurasi 60 detik dengan cerita yang saling terhubung.',
  'Mulai dari episode pertama. Setiap episode mengembangkan pembahasan sebelumnya.',
  CURDATE()
);
