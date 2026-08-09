<?php
/**
 * GET  /api/user/recommendations.php?limit=8
 * POST /api/user/recommendations.php  { action: "remember-search", countryId, departureId?, countryName? }
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

$claims = auth_jwt_require_bearer($CONFIG);
$userId = (int) ($claims['sub'] ?? 0);
if ($userId <= 0) {
    user_sync_json_error('Invalid user', 401);
}

try {
    $pdo = user_sync_db_connect($CONFIG);
} catch (Throwable $e) {
    error_log('[recommendations] db: ' . $e->getMessage());
    user_sync_json_error('Database unavailable', 503);
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input') ?: '';
    $body = $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($body)) {
        $body = [];
    }
    $action = isset($body['action']) ? trim((string) $body['action']) : 'remember-search';
    if ($action !== 'remember-search') {
        user_sync_json_error('Unknown action');
    }
    $countryId = isset($body['countryId']) ? (int) $body['countryId'] : 0;
    if ($countryId <= 0) {
        user_sync_json_error('countryId required');
    }
    $departureId = isset($body['departureId']) ? (int) $body['departureId'] : null;
    $countryName = isset($body['countryName']) ? trim((string) $body['countryName']) : null;

    $stmt = $pdo->prepare(
        'INSERT INTO user_recent_searches (user_id, country_id, departure_id, country_name, searched_at)
         VALUES (?, ?, ?, ?, NOW())'
    );
    $stmt->execute([$userId, $countryId, $departureId ?: null, $countryName ?: null]);

    // Keep last 12 searches per user
    $pdo->prepare(
        'DELETE FROM user_recent_searches
         WHERE user_id = ?
           AND id NOT IN (
             SELECT id FROM (
               SELECT id FROM user_recent_searches WHERE user_id = ? ORDER BY searched_at DESC LIMIT 12
             ) t
           )'
    )->execute([$userId, $userId]);

    user_sync_json_ok(['saved' => true, 'countryId' => $countryId]);
}

if ($method !== 'GET') {
    user_sync_json_error('Method not allowed', 405);
}

$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 8;
if ($limit < 1 || $limit > 20) {
    $limit = 8;
}

$favStmt = $pdo->prepare(
    "SELECT item_id, payload FROM user_favorites
     WHERE user_id = ? AND item_type = 'tour' AND deleted_at IS NULL
     ORDER BY updated_at DESC LIMIT 20"
);
$favStmt->execute([$userId]);
$favorites = [];
foreach ($favStmt->fetchAll() as $row) {
    if (!is_array($row)) {
        continue;
    }
    $favorites[] = [
        'item_id' => (string) ($row['item_id'] ?? ''),
        'payload' => user_sync_decode_json(isset($row['payload']) ? (string) $row['payload'] : null) ?? [],
    ];
}

$recentStmt = $pdo->prepare(
    'SELECT country_id, departure_id, country_name, searched_at
     FROM user_recent_searches WHERE user_id = ?
     ORDER BY searched_at DESC LIMIT 8'
);
$recentStmt->execute([$userId]);
$recent = $recentStmt->fetchAll();
if (!is_array($recent)) {
    $recent = [];
}

$countryIds = [];
$departureId = 1;
foreach ($recent as $r) {
    if (!is_array($r)) {
        continue;
    }
    $cid = (int) ($r['country_id'] ?? 0);
    if ($cid > 0) {
        $countryIds[] = $cid;
    }
    if (!empty($r['departure_id'])) {
        $departureId = (int) $r['departure_id'];
    }
}
$countryIds = array_values(array_unique($countryIds));
if ($countryIds === []) {
    // Popular fallbacks if user has no history yet (Tourvisor country ids may vary by account)
    $countryIds = [4];
}

$hot = [];
$query = http_build_query([
    'departureId' => $departureId,
    'currency' => 'RUB',
    'onlyCharter' => 'false',
    'limit' => 30,
]);
// countryIds[] style
foreach ($countryIds as $i => $cid) {
    $query .= '&countryIds=' . rawurlencode((string) $cid);
}
$hotRaw = np_tourvisor_get($CONFIG, '/tours/hots?' . $query);
if (is_array($hotRaw)) {
    // Some gateways wrap in { data: [] }
    if (isset($hotRaw['data']) && is_array($hotRaw['data'])) {
        $hot = $hotRaw['data'];
    } else {
        $hot = $hotRaw;
    }
}

// Enrich image cache from hot + favorites
foreach ($favorites as $fav) {
    $hotel = is_array($fav['payload']['hotel'] ?? null) ? $fav['payload']['hotel'] : [];
    $hid = isset($hotel['id']) ? (int) $hotel['id'] : 0;
    $img = np_extract_hotel_image($hotel);
    if ($hid > 0 && $img) {
        np_upsert_hotel_image($pdo, $hid, $img);
    }
}
foreach ($hot as $h) {
    if (!is_array($h)) {
        continue;
    }
    $hotel = is_array($h['hotel'] ?? null) ? $h['hotel'] : [];
    $hid = isset($hotel['id']) ? (int) $hotel['id'] : 0;
    $img = np_extract_hotel_image($hotel);
    if ($hid > 0 && $img) {
        np_upsert_hotel_image($pdo, $hid, $img);
    }
}

$items = np_build_recommendations($favorites, $recent, is_array($hot) ? $hot : [], $limit);

// Fill missing images from cache
$missingIds = [];
foreach ($items as $it) {
    if (empty($it['image']) && !empty($it['tourId'])) {
        // try hotel id from favorites payload later
    }
}
user_sync_json_ok([
    'items' => $items,
    'meta' => [
        'favoritesUsed' => count($favorites),
        'recentCountries' => $countryIds,
        'generatedAt' => gmdate('c'),
    ],
]);
