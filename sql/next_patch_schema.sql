-- Next-patch schema: push tokens, price watches, recent searches, hotel image cache
-- Run in phpMyAdmin after auth_schema.sql + user_sync_schema.sql

CREATE TABLE IF NOT EXISTS user_push_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL,
  platform ENUM('ios', 'android', 'web', 'unknown') NOT NULL DEFAULT 'unknown',
  device_id VARCHAR(128) NULL,
  app_version VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_token (token),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_price_watches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  item_type ENUM('tour') NOT NULL DEFAULT 'tour',
  item_id VARCHAR(64) NOT NULL,
  hotel_name VARCHAR(255) NULL,
  country_name VARCHAR(128) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'RUB',
  baseline_price DECIMAL(12,2) NOT NULL,
  last_seen_price DECIMAL(12,2) NOT NULL,
  min_drop_percent TINYINT UNSIGNED NOT NULL DEFAULT 5,
  payload JSON NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_checked_at TIMESTAMP NULL,
  last_notified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_watch_user_item (user_id, item_type, item_id),
  KEY idx_watch_active (active, last_checked_at),
  CONSTRAINT fk_watch_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_recent_searches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  country_id INT NOT NULL,
  departure_id INT NULL,
  country_name VARCHAR(128) NULL,
  searched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recent_user_time (user_id, searched_at),
  CONSTRAINT fk_recent_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hotel_image_cache (
  hotel_id INT NOT NULL,
  picture_url VARCHAR(1024) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'tourvisor',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (hotel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
