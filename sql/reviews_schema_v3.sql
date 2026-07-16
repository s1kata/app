-- Index for review rate limiting (user_id + created_at)
ALTER TABLE reviews
  ADD INDEX idx_reviews_user_created (user_id, created_at);
