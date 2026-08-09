<?php
/**
 * Tour search status.
 * GET /api/tours/search-status.php?id=&operatorStatus=0|1
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

$searchId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if ($searchId <= 0) {
    user_sync_json_error('id (searchId) is required');
}

$operatorStatus = !empty($_GET['operatorStatus']) && (string) $_GET['operatorStatus'] !== '0';

if (np_tourvisor_token($CONFIG) === '') {
    user_sync_json_error('Tourvisor token is not configured on server', 503);
}

$path = '/tours/search/' . $searchId . '/status?' . np_query_encode(['operatorStatus' => $operatorStatus]);
$meta = np_tourvisor_get_meta($CONFIG, $path);

if (!$meta['ok']) {
    $status = (int) ($meta['status'] ?? 502);
    http_response_code($status >= 400 && $status < 600 ? $status : 502);
    echo json_encode([
        'success' => false,
        'error' => 'Tourvisor search status failed',
        'status' => $meta['status'] ?? 0,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = np_unwrap_tourvisor_payload($meta['json']);
user_sync_json_ok(is_array($payload) ? $payload : []);
