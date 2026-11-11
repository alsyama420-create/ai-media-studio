CREATE TABLE qc_reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  production_id INT UNSIGNED NOT NULL,
  hasil ENUM('lolos', 'gagal') NOT NULL,
  detail TEXT NOT NULL,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (production_id) REFERENCES productions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;