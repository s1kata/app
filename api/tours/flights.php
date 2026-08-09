<?php
/**
 * Tour flights.
 * GET /api/tours/flights.php?id=&currency=RUB
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

$tourId = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
if ($tourId === '') {
    user_sync_json_error('id is required');
}
$currency = isset($_GET['currency']) && $_GET['currency'] !== ''
    ? strtoupper(trim((string) $_GET['currency']))
    : 'RUB';

if (np_tourvisor_token($CONFIG) === '') {
    user_sync_json_error('Tourvisor token is not configured on server', 503);
}

$path = '/tours/' . rawurlencode($tourId) . '/flights?' . np_query_encode(['currency' => $currency]);
$meta = np_tourvisor_get_meta($CONFIG, $path);

if (!$meta['ok']) {
    $status = (int) ($meta['status'] ?? 502);
    http_response_code($status >= 400 && $status < 600 ? $status : 502);
    echo json_encode([
        'success' => false,
        'error' => 'Tourvisor tour flights failed',
        'status' => $meta['status'] ?? 0,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = np_unwrap_tourvisor_payload($meta['json']);
user_sync_json_ok(is_array($payload) ? $payload : []);
