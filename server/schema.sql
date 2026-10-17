CREATE DATABASE IF NOT EXISTS baketrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE baketrack;

CREATE TABLE IF NOT EXISTS material_lots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  material_name VARCHAR(120) NOT NULL,
  lot_code VARCHAR(80) NOT NULL UNIQUE,
  quantity_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  received_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  supplier VARCHAR(160) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expiry (expiry_date)
);

CREATE TABLE IF NOT EXISTS production_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_code VARCHAR(80) NOT NULL UNIQUE,
  product_name VARCHAR(120) NOT NULL,
  planned_qty_kg DECIMAL(10,2) NOT NULL,
  actual_qty_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('planned','in_production','quality_hold','approved','rejected','dispatched','completed') NOT NULL DEFAULT 'planned',
  production_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  status_note VARCHAR(500) NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS quality_checks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL,
  check_name VARCHAR(120) NOT NULL,
  result ENUM('pass','fail') NOT NULL,
  notes VARCHAR(500) DEFAULT '',
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quality_batch FOREIGN KEY (batch_id) REFERENCES production_batches(id)
);

CREATE TABLE IF NOT EXISTS waste_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NULL,
  waste_type ENUM('overproduction','process_loss','damaged_product','quality_reject','expired_material','other') NOT NULL,
  quantity_kg DECIMAL(10,2) NOT NULL,
  disposition ENUM('rework_review','compost','biogas','approved_feed_route','disposal','other') NOT NULL,
  notes VARCHAR(500) DEFAULT '',
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_waste_batch FOREIGN KEY (batch_id) REFERENCES production_batches(id)
);

-- Synthetic sample rows for portfolio demonstration only.
INSERT IGNORE INTO material_lots (material_name, lot_code, quantity_kg, received_date, expiry_date, supplier) VALUES
('Wheat flour','FLR-DEMO-001',420,'2026-10-01','2026-11-15','Demo Supplier A'),
('Sugar','SGR-DEMO-002',180,'2026-10-02','2027-02-15','Demo Supplier B'),
('Vegetable oil','OIL-DEMO-003',95,'2026-10-03','2026-12-01','Demo Supplier C'),
('Cocoa powder','COC-DEMO-004',40,'2026-09-15','2026-10-20','Demo Supplier D');

INSERT IGNORE INTO production_batches (batch_code, product_name, planned_qty_kg, actual_qty_kg, status, production_date) VALUES
('BT-DEMO-1001','Butter Cookies',500,482,'approved','2026-10-10'),
('BT-DEMO-1002','Chocolate Biscuits',350,321,'quality_hold','2026-10-11'),
('BT-DEMO-1003','Wafers',250,244,'in_production','2026-10-11');

INSERT INTO quality_checks (batch_id, check_name, result, notes)
SELECT id, 'Packaging seal inspection', 'pass', 'Synthetic demo result'
FROM production_batches WHERE batch_code='BT-DEMO-1001'
AND NOT EXISTS (SELECT 1 FROM quality_checks WHERE check_name='Packaging seal inspection' AND batch_id=production_batches.id);

INSERT INTO quality_checks (batch_id, check_name, result, notes)
SELECT id, 'Visual defect inspection', 'fail', 'Synthetic demo result; hold batch pending review'
FROM production_batches WHERE batch_code='BT-DEMO-1002'
AND NOT EXISTS (SELECT 1 FROM quality_checks WHERE check_name='Visual defect inspection' AND batch_id=production_batches.id);

INSERT INTO waste_entries (batch_id, waste_type, quantity_kg, disposition, notes)
SELECT id, 'process_loss', 18, 'other', 'Synthetic demo data'
FROM production_batches WHERE batch_code='BT-DEMO-1001'
AND NOT EXISTS (SELECT 1 FROM waste_entries WHERE notes='Synthetic demo data' AND batch_id=production_batches.id);
