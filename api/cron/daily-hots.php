<?php
/**
 * Cron: daily hot-tours digest push to all registered Expo tokens.
 *
 * GET/POST /api/cron/daily-hots.php
 * Header: X-Cron-Token: <cron_token>
 *
 * SpaceWeb (daily 12:00 MSK):
 * curl -s -H "X-Cron-Token: YOUR_TOKEN" "https://travelhub63.ru/api/cron/daily-hots.php"
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

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

auth_jwt_require_cron($CONFIG);

try {
    $pdo = user_sync_db_connect($CONFIG);
} catch (Throwable $e) {
    error_log('[cron/daily-hots] db: ' . $e->getMessage());
    user_sync_json_error('Database unavailable', 503);
}

$stmt = $pdo->query(
    'SELECT DISTINCT token FROM user_push_tokens
     WHERE token IS NOT NULL AND token <> \'\'
     ORDER BY updated_at DESC
     LIMIT 5000'
);
$rows = $stmt ? $stmt->fetchAll() : [];
$tokens = [];
foreach ($rows as $row) {
    if (!is_array($row)) {
        continue;
    }
    $t = trim((string) ($row['token'] ?? ''));
    if ($t !== '') {
        $tokens[] = $t;
    }
}

$title = 'Горящие туры на сегодня';
$body = 'Свежие предложения со скидкой — откройте приложение и выберите отпуск';
$data = [
    'type' => 'daily_hot_tours',
    'deepLink' => 'travelhub://Home/ApiHotTours',
];

$push = np_expo_push($tokens, $title, $body, $data);

user_sync_json_ok([
    'tokens' => count($tokens),
    'sent' => (int) ($push['sent'] ?? 0),
    'ok' => !empty($push['ok']),
]);
