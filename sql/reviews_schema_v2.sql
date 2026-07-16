-- Migration: metadata for tour reviews + general reviews without tour/hotel
-- Run in phpMyAdmin after reviews_schema.sql

ALTER TABLE reviews
  ADD COLUMN hotel_name VARCHAR(255) NULL DEFAULT NULL AFTER hotel_id,
  ADD COLUMN country_name VARCHAR(255) NULL DEFAULT NULL AFTER hotel_name;
