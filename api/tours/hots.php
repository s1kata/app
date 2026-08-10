<?php
/**
 * Server-side hot tours (Tourvisor token stays on server).
 *
 * GET  /api/tours/hots.php?departureId=&currency=RUB&onlyCharter=0&limit=40&countryIds=1,2
 * POST /api/tours/hots.php  { departureId, currency?, onlyCharter?, limit?, countryIds?, dateFrom?, dateTo?, ... }
 *
 * Response: { success, data: { tours: TourHot[] } }
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

if (!in_array($method, ['GET', 'POST'], true)) {
    user_sync_json_error('Method not allowed', 405);
}

$params = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input') ?: '';
    $body = $raw !== '' ? json_decode($raw, true) : [];
    $params = is_array($body) ? $body : [];
} else {
    $params = $_GET;
}

$departureId = isset($params['departureId']) ? (int) $params['departureId'] : 0;
if ($departureId <= 0) {
    user_sync_json_error('departureId is required');
}

$currency = isset($params['currency']) && is_string($params['currency']) && $params['currency'] !== ''
    ? strtoupper(trim($params['currency']))
    : 'RUB';
$onlyCharter = !empty($params['onlyCharter']) && (string) $params['onlyCharter'] !== '0' && $params['onlyCharter'] !== false;
$limit = isset($params['limit']) ? (int) $params['limit'] : 40;
if ($limit < 1 || $limit > 200) {
    $limit = 40;
}

$countryIds = [];
if (isset($params['countryIds'])) {
    if (is_array($params['countryIds'])) {
        $countryIds = array_values(array_filter(array_map('intval', $params['countryIds'])));
    } elseif (is_string($params['countryIds']) && $params['countryIds'] !== '') {
        $countryIds = array_values(array_filter(array_map('intval', explode(',', $params['countryIds']))));
    }
}

$regionIds = [];
if (isset($params['regionIds'])) {
    if (is_array($params['regionIds'])) {
        $regionIds = array_values(array_filter(array_map('intval', $params['regionIds'])));
    } elseif (is_string($params['regionIds']) && $params['regionIds'] !== '') {
        $regionIds = array_values(array_filter(array_map('intval', explode(',', $params['regionIds']))));
    }
}

if (np_tourvisor_token($CONFIG) === '') {
    user_sync_json_error('Tourvisor token is not configured on server', 503);
}

$queryParts = [
    'departureId=' . rawurlencode((string) $departureId),
    'currency=' . rawurlencode($currency),
    'onlyCharter=' . ($onlyCharter ? 'true' : 'false'),
    'limit=' . rawurlencode((string) $limit),
];

foreach ($countryIds as $cid) {
    $queryParts[] = 'countryIds=' . rawurlencode((string) $cid);
}
foreach ($regionIds as $rid) {
    $queryParts[] = 'regionIds=' . rawurlencode((string) $rid);
}

$optionalScalars = ['dateFrom', 'dateTo', 'meal', 'hotelCategory', 'noVisa'];
foreach ($optionalScalars as $key) {
    if (!isset($params[$key]) || $params[$key] === '' || $params[$key] === null) {
        continue;
    }
    if ($key === 'noVisa') {
        $val = !empty($params[$key]) && (string) $params[$key] !== '0' ? 'true' : 'false';
        $queryParts[] = 'noVisa=' . $val;
        continue;
    }
    $queryParts[] = rawurlencode($key) . '=' . rawurlencode((string) $params[$key]);
}

if (isset($params['operatorIds']) && is_array($params['operatorIds'])) {
    foreach (array_filter(array_map('intval', $params['operatorIds'])) as $oid) {
        $queryParts[] = 'operatorIds=' . rawurlencode((string) $oid);
    }
}

$path = '/tours/hots?' . implode('&', $queryParts);
$meta = np_tourvisor_get_meta($CONFIG, $path);

$tours = [];
$source = 'tourvisor_hots';
if ($meta['ok']) {
    $json = $meta['json'];
    if (is_array($json)) {
        $isList = array_keys($json) === range(0, count($json) - 1);
        if ($isList) {
            $tours = $json;
        } elseif (isset($json['data']) && is_array($json['data'])) {
            $tours = $json['data'];
        }
    }
}

// Модуль «Горящие» у Tourvisor часто 403 (не подключён) — берём акции с сайта / live search.
if ($tours === []) {
    $tours = np_hot_tours_fallback($CONFIG, $departureId, $countryIds, $currency, $limit);
    $source = 'promo_fallback';
    if ($tours === []) {
        $status = (int) ($meta['status'] ?? 502);
        if ($status < 400) {
            $status = 502;
        }
        http_response_code($status >= 400 && $status < 600 ? $status : 502);
        echo json_encode([
            'success' => false,
            'error' => 'Tourvisor hot tours request failed',
            'status' => $meta['status'] ?? 0,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// Optional: seed hotel image cache from hot tours pictures
try {
    $pdo = user_sync_db_connect($CONFIG);
    $pairs = [];
    foreach ($tours as $row) {
        if (!is_array($row)) {
            continue;
        }
        $hotel = $row['hotel'] ?? null;
        if (!is_array($hotel)) {
            continue;
        }
        $hid = isset($hotel['id']) ? (int) $hotel['id'] : 0;
        $pic = isset($hotel['picturelink']) ? trim((string) $hotel['picturelink']) : '';
        if ($hid > 0 && $pic !== '') {
            $pairs[] = ['hotelId' => $hid, 'pictureUrl' => $pic];
        }
    }
    if ($pairs !== []) {
        foreach ($pairs as $pair) {
            np_upsert_hotel_image($pdo, (int) $pair['hotelId'], (string) $pair['pictureUrl']);
        }
    }
} catch (Throwable $e) {
    error_log('[tours/hots] image cache optional: ' . $e->getMessage());
}

user_sync_json_ok([
    'tours' => $tours,
    'count' => count($tours),
    'departureId' => $departureId,
    'currency' => $currency,
    'limit' => $limit,
    'source' => $source,
]);
