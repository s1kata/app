<?php
/**
 * Server-side hotel details (+ image cache upsert).
 *
 * GET /api/hotels/details.php?id=123
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$configPath = dirname(__DIR__) . '/auth-mobile.config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Конфиг auth-mobile.config.php не найден'], JSON_UNESCAPED_UNICODE);
    exit;
}

/** @var array<string, mixed> $CONFIG */
$CONFIG = require $configPath;

require_once dirname(__DIR__) . '/lib/user-sync-helpers.php';
require_once dirname(__DIR__) . '/lib/next-patch-helpers.php';
np_maybe_cors($CONFIG);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'GET') {
    user_sync_json_error('Method not allowed', 405);
}

$hotelId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if ($hotelId <= 0) {
    user_sync_json_error('id required');
}

if (np_tourvisor_token($CONFIG) === '') {
    user_sync_json_error('Tourvisor token is not configured on server', 503);
}

$meta = np_tourvisor_get_meta($CONFIG, '/hotels/' . $hotelId);
if (!$meta['ok'] || !is_array($meta['json'])) {
    $code = (int) ($meta['status'] ?? 502);
    if ($code < 400) {
        $code = 502;
    }
    user_sync_json_error('Hotel details unavailable', $code);
}

$hotel = $meta['json'];
if (isset($hotel['data']) && is_array($hotel['data'])) {
    $hotel = $hotel['data'];
}
if (!is_array($hotel)) {
    user_sync_json_error('Invalid hotel payload', 502);
}

$url = np_extract_hotel_image($hotel);
if ($url) {
    $hotel['picturelink'] = $hotel['picturelink'] ?? $url;
    if (empty($hotel['images']) || !is_array($hotel['images'])) {
        $hotel['images'] = [$url];
    }
    try {
        $pdo = user_sync_db_connect($CONFIG);
        np_upsert_hotel_image($pdo, $hotelId, $url);
    } catch (Throwable $e) {
        error_log('[hotels/details] cache skip: ' . $e->getMessage());
    }
} else {
    // fallback from cache DB
    try {
        $pdo = user_sync_db_connect($CONFIG);
        $cached = np_hotel_images_from_db($pdo, [$hotelId]);
        if (isset($cached[$hotelId])) {
            $hotel['picturelink'] = $cached[$hotelId];
            $hotel['images'] = [$cached[$hotelId]];
        }
    } catch (Throwable $e) {
        /* ignore */
    }
}

user_sync_json_ok($hotel);
