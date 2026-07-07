<?php
/**
 * GET    /api/user/favorites.php — список избранного
 * POST   /api/user/favorites.php — добавить/обновить { itemType, itemId, payload }
 * DELETE /api/user/favorites.php?itemType=&itemId= — мягкое удаление
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
require_once dirname(__DIR__) . '/lib/crm-read-helpers.php';
require_once dirname(__DIR__) . '/lib/user-sync-helpers.php';
crm_maybe_cors($CONFIG);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!in_array($method, ['GET', 'POST', 'DELETE'], true)) {
    user_sync_json_error('Method not allowed', 405);
}

$claims = auth_jwt_require_bearer($CONFIG);
$userId = (int) ($claims['sub'] ?? 0);
if ($userId <= 0) {
    user_sync_json_error('Invalid user', 401);
}

try {
    $pdo = user_sync_db_connect($CONFIG);
} catch (Throwable $e) {
    error_log('[user/favorites] db: ' . $e->getMessage());
    user_sync_json_error('Database unavailable', 503);
}

/**
 * @param array<string, mixed> $row
 * @return array<string, mixed>
 */
function favorites_row_to_dto(array $row): array
{
    return [
        'itemType' => (string) ($row['item_type'] ?? ''),
        'itemId' => (string) ($row['item_id'] ?? ''),
        'payload' => user_sync_decode_json(isset($row['payload']) ? (string) $row['payload'] : null) ?? [],
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
        'createdAt' => (string) ($row['created_at'] ?? ''),
    ];
}

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT * FROM user_favorites WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC'
    );
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    $out = [];
    foreach ($rows as $row) {
        if (is_array($row)) {
            $out[] = favorites_row_to_dto($row);
        }
    }
    user_sync_json_ok($out);
}

if ($method === 'DELETE') {
    $itemType = isset($_GET['itemType']) ? trim((string) $_GET['itemType']) : '';
    $itemId = isset($_GET['itemId']) ? trim((string) $_GET['itemId']) : '';
    if (!in_array($itemType, ['tour', 'hotel'], true) || $itemId === '') {
        user_sync_json_error('itemType and itemId required');
    }
    $stmt = $pdo->prepare(
        'UPDATE user_favorites SET deleted_at = NOW() WHERE user_id = ? AND item_type = ? AND item_id = ?'
    );
    $stmt->execute([$userId, $itemType, $itemId]);
    user_sync_json_ok(['deleted' => true]);
}

$raw = file_get_contents('php://input') ?: '';
$body = $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($body)) {
    $body = [];
}

$itemType = isset($body['itemType']) ? trim((string) $body['itemType']) : '';
$itemId = isset($body['itemId']) ? trim((string) $body['itemId']) : '';
$payload = $body['payload'] ?? null;
if (!in_array($itemType, ['tour', 'hotel'], true) || $itemId === '' || !is_array($payload)) {
    user_sync_json_error('itemType, itemId and payload required');
}

$payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE);
$stmt = $pdo->prepare(
    'INSERT INTO user_favorites (user_id, item_type, item_id, payload, deleted_at)
     VALUES (?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), deleted_at = NULL, updated_at = CURRENT_TIMESTAMP'
);
$stmt->execute([$userId, $itemType, $itemId, $payloadJson]);

$stmt = $pdo->prepare(
    'SELECT * FROM user_favorites WHERE user_id = ? AND item_type = ? AND item_id = ? LIMIT 1'
);
$stmt->execute([$userId, $itemType, $itemId]);
$row = $stmt->fetch();
user_sync_json_ok(is_array($row) ? favorites_row_to_dto($row) : []);
