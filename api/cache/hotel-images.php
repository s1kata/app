<?php
/**
 * GET /api/cache/hotel-images.php?ids=1,2,3
 * PUT /api/cache/hotel-images.php  { items: [{ hotelId, pictureUrl }] }  (Bearer or cron)
 * Enrichment: optional ?enrich=1&ids=... will try Tourvisor /hotels/{id} for missing.
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

require_once dirname(__DIR__) . '/lib/auth-jwt.php';
require_once dirname(__DIR__) . '/lib/user-sync-helpers.php';
require_once dirname(__DIR__) . '/lib/next-patch-helpers.php';
np_maybe_cors($CONFIG);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $pdo = user_sync_db_connect($CONFIG);
} catch (Throwable $e) {
    error_log('[hotel-images] db: ' . $e->getMessage());
    user_sync_json_error('Database unavailable', 503);
}

if ($method === 'GET') {
    $idsRaw = isset($_GET['ids']) ? trim((string) $_GET['ids']) : '';
    if ($idsRaw === '') {
        user_sync_json_error('ids required (comma-separated)');
    }
    $ids = [];
    foreach (explode(',', $idsRaw) as $part) {
        $id = (int) trim($part);
        if ($id > 0) {
            $ids[] = $id;
        }
    }
    $ids = array_values(array_unique($ids));
    if ($ids === [] || count($ids) > 100) {
        user_sync_json_error('Provide 1..100 hotel ids');
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT hotel_id, picture_url FROM hotel_image_cache WHERE hotel_id IN ($placeholders)");
    $stmt->execute($ids);
    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        if (!is_array($row)) {
            continue;
        }
        $map[(string) $row['hotel_id']] = (string) $row['picture_url'];
    }

    $enrich = isset($_GET['enrich']) && (string) $_GET['enrich'] === '1';
    if ($enrich) {
        foreach ($ids as $hid) {
            if (isset($map[(string) $hid])) {
                continue;
            }
            $details = np_tourvisor_get($CONFIG, '/hotels/' . $hid);
            if (!is_array($details)) {
                continue;
            }
            $hotel = isset($details['data']) && is_array($details['data']) ? $details['data'] : $details;
            if (!is_array($hotel)) {
                continue;
            }
            $url = np_extract_hotel_image($hotel);
            if ($url) {
                np_upsert_hotel_image($pdo, $hid, $url);
                $map[(string) $hid] = $url;
            }
            usleep(80000);
        }
    }

    user_sync_json_ok(['images' => $map]);
}

if ($method === 'PUT' || $method === 'POST') {
    $cronToken = trim((string) ($CONFIG['cron_token'] ?? $CONFIG['health_check_token'] ?? ''));
    $gotCron = trim((string) ($_SERVER['HTTP_X_CRON_TOKEN'] ?? ''));
    if (!($cronToken !== '' && $gotCron !== '' && hash_equals($cronToken, $gotCron))) {
        auth_jwt_require_bearer($CONFIG);
    }

    $raw = file_get_contents('php://input') ?: '';
    $body = $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($body)) {
        $body = [];
    }
    $items = $body['items'] ?? null;
    if (!is_array($items) || $items === []) {
        user_sync_json_error('items[] required');
    }
    $saved = 0;
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $hid = (int) ($item['hotelId'] ?? 0);
        $url = isset($item['pictureUrl']) ? trim((string) $item['pictureUrl']) : '';
        if ($hid <= 0 || $url === '' || !preg_match('#^https?://#i', $url)) {
            continue;
        }
        np_upsert_hotel_image($pdo, $hid, $url);
        $saved++;
    }
    user_sync_json_ok(['saved' => $saved]);
}

user_sync_json_error('Method not allowed', 405);
