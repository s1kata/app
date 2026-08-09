<?php
/**
 * POST   /api/user/push-tokens.php  { token, platform?, deviceId?, appVersion? }
 * DELETE /api/user/push-tokens.php?token=...
 * GET    /api/user/push-tokens.php  — список токенов текущего пользователя
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
    error_log('[push-tokens] db: ' . $e->getMessage());
    user_sync_json_error('Database unavailable', 503);
}

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT token, platform, device_id, app_version, updated_at, last_seen_at
         FROM user_push_tokens WHERE user_id = ? ORDER BY updated_at DESC'
    );
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    $out = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $out[] = [
            'token' => (string) $row['token'],
            'platform' => (string) $row['platform'],
            'deviceId' => $row['device_id'] !== null ? (string) $row['device_id'] : null,
            'appVersion' => $row['app_version'] !== null ? (string) $row['app_version'] : null,
            'updatedAt' => (string) $row['updated_at'],
            'lastSeenAt' => (string) $row['last_seen_at'],
        ];
    }
    user_sync_json_ok($out);
}

if ($method === 'DELETE') {
    $token = isset($_GET['token']) ? trim((string) $_GET['token']) : '';
    if ($token === '') {
        user_sync_json_error('token required');
    }
    $stmt = $pdo->prepare('DELETE FROM user_push_tokens WHERE user_id = ? AND token = ?');
    $stmt->execute([$userId, $token]);
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

$token = isset($body['token']) ? trim((string) $body['token']) : '';
$platform = isset($body['platform']) ? strtolower(trim((string) $body['platform'])) : 'unknown';
$deviceId = isset($body['deviceId']) ? trim((string) $body['deviceId']) : null;
$appVersion = isset($body['appVersion']) ? trim((string) $body['appVersion']) : null;

if ($token === '' || strlen($token) < 20) {
    user_sync_json_error('Valid Expo push token required');
}
if (!in_array($platform, ['ios', 'android', 'web', 'unknown'], true)) {
    $platform = 'unknown';
}

$stmt = $pdo->prepare(
    'INSERT INTO user_push_tokens (user_id, token, platform, device_id, app_version, last_seen_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       platform = VALUES(platform),
       device_id = COALESCE(VALUES(device_id), device_id),
       app_version = COALESCE(VALUES(app_version), app_version),
       last_seen_at = NOW(),
       updated_at = NOW()'
);
$stmt->execute([$userId, $token, $platform, $deviceId ?: null, $appVersion ?: null]);

user_sync_json_ok([
    'token' => $token,
    'platform' => $platform,
    'registered' => true,
]);
