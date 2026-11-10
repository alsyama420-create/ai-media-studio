CREATE TABLE tasks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  judul VARCHAR(200) NOT NULL,
  deskripsi TEXT NULL,
  agent_id INT UNSIGNED NOT NULL,
  status ENUM('pending', 'running', 'done', 'failed') NOT NULL DEFAULT 'pending',
  percobaan TINYINT UNSIGNED NOT NULL DEFAULT 0,
  maks_percobaan TINYINT UNSIGNED NOT NULL DEFAULT 3,
  catatan_error TEXT NULL,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dimulai_pada TIMESTAMP NULL,
  selesai_pada TIMESTAMP NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tasks (judul, deskripsi, agent_id) VALUES
('Tugas uji pertama', 'Tugas contoh untuk menguji sistem task management', 2);