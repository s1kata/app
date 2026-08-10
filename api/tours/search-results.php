<?php
/**
 * Tour search results (+ operator filter).
 * GET /api/tours/search-results.php?id=&limit=25
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
require_once dirname(__DIR__) . '/lib/tourvisor-operators.php';
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

$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 25;
if ($limit < 1) {
    $limit = 25;
}
if ($limit > 500) {
    $limit = 500;
}

if (np_tourvisor_token($CONFIG) === '') {
    user_sync_json_error('Tourvisor token is not configured on server', 503);
}

$path = '/tours/search/' . $searchId . '?' . np_query_encode(['limit' => $limit]);
$meta = np_tourvisor_get_meta($CONFIG, $path);

if (!$meta['ok']) {
    $status = (int) ($meta['status'] ?? 502);
    http_response_code($status >= 400 && $status < 600 ? $status : 502);
    echo json_encode([
        'success' => false,
        'error' => 'Tourvisor search results failed',
        'status' => $meta['status'] ?? 0,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = np_unwrap_tourvisor_payload($meta['json']);
$hotels = [];
if (is_array($payload)) {
    $isList = $payload === [] || array_keys($payload) === range(0, count($payload) - 1);
    $hotels = $isList ? $payload : [];
}

if (function_exists('tv_filter_tour_hotels_by_country_operators') && empty($_GET['skipOperatorFilter'])) {
    $hotels = tv_filter_tour_hotels_by_country_operators($hotels);
}

user_sync_json_ok([
    'hotels' => $hotels,
    'count' => count($hotels),
    'searchId' => $searchId,
    'limit' => $limit,
]);
