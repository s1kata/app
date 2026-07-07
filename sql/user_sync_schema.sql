-- Синхронизация пользовательских данных между устройствами (TravelHub)
-- Выполните на MySQL/MariaDB travelhub63.ru

CREATE TABLE IF NOT EXISTS app_bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  local_booking_id VARCHAR(64) NULL,
  crm_request_id VARCHAR(64) NULL,
  idempotency_key VARCHAR(128) NULL,
  payment_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  tour_snapshot JSON NULL,
  payable_rub DECIMAL(12, 2) NULL,
  bonus_spent INT UNSIGNED NULL DEFAULT 0,
  paid_at DATETIME NULL,
  payment_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_app_bookings_user_crm (user_id, crm_request_id),
  UNIQUE KEY uq_app_bookings_user_idem (user_id, idempotency_key),
  KEY idx_app_bookings_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_favorites (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  item_type ENUM('tour', 'hotel') NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  deleted_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_favorites_item (user_id, item_type, item_id),
  KEY idx_user_favorites_active (user_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
