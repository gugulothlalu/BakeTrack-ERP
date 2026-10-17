-- BakeTrack ERP migration 002: explicit completed state + completion/release audit fields
-- DDL only (no DML). Idempotent: safe to run multiple times.
-- Run once per database, e.g.: mysql --user=<user> --password --database=baketrack < 002_batch_completion.sql
USE baketrack;

-- 1) Append 'completed' to the status enum.
--    Appending at the end preserves existing stored values and their indices;
--    MySQL 8.0 performs this ENUM extension in place (no table rebuild).
SET @ddl := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'production_batches'
    AND COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE '%completed%') = 0,
  'ALTER TABLE production_batches MODIFY COLUMN status ENUM(''planned'',''in_production'',''quality_hold'',''approved'',''rejected'',''dispatched'',''completed'') NOT NULL DEFAULT ''planned''',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) completed_at: set when a batch is completed or its output is amended.
SET @ddl := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'production_batches'
    AND COLUMN_NAME = 'completed_at') = 0,
  'ALTER TABLE production_batches ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) status_note: release note or rejection reason for the latest decision.
SET @ddl := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'production_batches'
    AND COLUMN_NAME = 'status_note') = 0,
  'ALTER TABLE production_batches ADD COLUMN status_note VARCHAR(500) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
