<?php
/**
 * GET    /api/user/price-watches.php
 * POST   /api/user/price-watches.php  { itemId, baselinePrice, currency?, hotelName?, countryName?, payload?, minDropPercent? }
 * DELETE /api/user/price-watches.php?itemId=
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
    error_log('[price-watches] db: ' . $e->getMessage());
    user_sync_json_error('Database unavailable', 503);
}

/**
 * @param array<string, mixed> $row
 * @return array<string, mixed>
 */
function np_watch_dto(array $row): array
{
    return [
        'itemType' => (string) ($row['item_type'] ?? 'tour'),
        'itemId' => (string) ($row['item_id'] ?? ''),
        'hotelName' => $row['hotel_name'] !== null ? (string) $row['hotel_name'] : null,
        'countryName' => $row['country_name'] !== null ? (string) $row['country_name'] : null,
        'currency' => (string) ($row['currency'] ?? 'RUB'),
        'baselinePrice' => (float) ($row['baseline_price'] ?? 0),
        'lastSeenPrice' => (float) ($row['last_seen_price'] ?? 0),
        'minDropPercent' => (int) ($row['min_drop_percent'] ?? 5),
        'active' => (bool) ($row['active'] ?? 1),
        'lastCheckedAt' => $row['last_checked_at'] !== null ? (string) $row['last_checked_at'] : null,
        'lastNotifiedAt' => $row['last_notified_at'] !== null ? (string) $row['last_notified_at'] : null,
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
        'createdAt' => (string) ($row['created_at'] ?? ''),
    ];
}

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT * FROM user_price_watches WHERE user_id = ? AND active = 1 ORDER BY updated_at DESC'
    );
    $stmt->execute([$userId]);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        if (is_array($row)) {
            $out[] = np_watch_dto($row);
        }
    }
    user_sync_json_ok($out);
}

if ($method === 'DELETE') {
    $itemId = isset($_GET['itemId']) ? trim((string) $_GET['itemId']) : '';
    if ($itemId === '') {
        user_sync_json_error('itemId required');
    }
    $stmt = $pdo->prepare(
        'UPDATE user_price_watches SET active = 0, updated_at = NOW()
         WHERE user_id = ? AND item_type = \'tour\' AND item_id = ?'
    );
    $stmt->execute([$userId, $itemId]);
    user_sync_json_ok(['deleted' => true]);
}

if ($method !== 'POST') {
    user_sync_json_error('Method not allowed', 405);
}

$raw = file_get_contents('php://input') ?: '';
$body = $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($body)) {
    $body = [];
}

$itemId = isset($body['itemId']) ? trim((string) $body['itemId']) : '';
$baseline = isset($body['baselinePrice']) ? (float) $body['baselinePrice'] : 0.0;
$currency = isset($body['currency']) ? strtoupper(trim((string) $body['currency'])) : 'RUB';
$hotelName = isset($body['hotelName']) ? trim((string) $body['hotelName']) : null;
$countryName = isset($body['countryName']) ? trim((string) $body['countryName']) : null;
$minDrop = isset($body['minDropPercent']) ? (int) $body['minDropPercent'] : 5;
$payload = isset($body['payload']) && is_array($body['payload']) ? $body['payload'] : null;

if ($itemId === '' || $baseline <= 0) {
    user_sync_json_error('itemId and baselinePrice (>0) required');
}
if ($minDrop < 1 || $minDrop > 50) {
    $minDrop = 5;
}
if ($currency === '') {
    $currency = 'RUB';
}

$payloadJson = $payload !== null ? json_encode($payload, JSON_UNESCAPED_UNICODE) : null;
$stmt = $pdo->prepare(
    'INSERT INTO user_price_watches
      (user_id, item_type, item_id, hotel_name, country_name, currency, baseline_price, last_seen_price, min_drop_percent, payload, active)
     VALUES (?, \'tour\', ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       hotel_name = COALESCE(VALUES(hotel_name), hotel_name),
       country_name = COALESCE(VALUES(country_name), country_name),
       currency = VALUES(currency),
       baseline_price = VALUES(baseline_price),
       last_seen_price = VALUES(last_seen_price),
       min_drop_percent = VALUES(min_drop_percent),
       payload = COALESCE(VALUES(payload), payload),
       active = 1,
       updated_at = NOW()'
);
$stmt->execute([
    $userId,
    $itemId,
    $hotelName,
    $countryName,
    $currency,
    $baseline,
    $baseline,
    $minDrop,
    $payloadJson,
]);

$stmt = $pdo->prepare(
    'SELECT * FROM user_price_watches WHERE user_id = ? AND item_type = \'tour\' AND item_id = ? LIMIT 1'
);
$stmt->execute([$userId, $itemId]);
$row = $stmt->fetch();
user_sync_json_ok(is_array($row) ? np_watch_dto($row) : []);
