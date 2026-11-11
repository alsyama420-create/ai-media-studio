CREATE TABLE fact_checks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  production_id INT UNSIGNED NOT NULL,
  hasil ENUM('lulus', 'gagal') NOT NULL,
  detail TEXT NOT NULL,
  model VARCHAR(60) NOT NULL,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (production_id) REFERENCES productions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;