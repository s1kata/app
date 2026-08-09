<?php
/**
 * Available tour dates.
 * GET /api/tours/dates.php?departureId=&countryId=&arrivalId=&onlyCharter=0
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

$departureId = isset($_GET['departureId']) ? (int) $_GET['departureId'] : 0;
$countryId = isset($_GET['countryId']) ? (int) $_GET['countryId'] : 0;
if ($departureId <= 0 || $countryId <= 0) {
    user_sync_json_error('departureId and countryId are required');
}

$query = [
    'departureId' => $departureId,
    'countryId' => $countryId,
];
if (isset($_GET['arrivalId']) && $_GET['arrivalId'] !== '') {
    $query['arrivalId'] = (int) $_GET['arrivalId'];
}
if (isset($_GET['onlyCharter']) && $_GET['onlyCharter'] !== '') {
    $query['onlyCharter'] = !empty($_GET['onlyCharter']) && (string) $_GET['onlyCharter'] !== '0';
}

if (np_tourvisor_token($CONFIG) === '') {
    user_sync_json_error('Tourvisor token is not configured on server', 503);
}

$path = '/tours/dates?' . np_query_encode($query);
$meta = np_tourvisor_get_meta($CONFIG, $path);

if (!$meta['ok']) {
    $status = (int) ($meta['status'] ?? 502);
    http_response_code($status >= 400 && $status < 600 ? $status : 502);
    echo json_encode([
        'success' => false,
        'error' => 'Tourvisor dates failed',
        'status' => $meta['status'] ?? 0,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = np_unwrap_tourvisor_payload($meta['json']);
$dates = [];
if (is_array($payload)) {
    $isList = $payload === [] || array_keys($payload) === range(0, count($payload) - 1);
    if ($isList) {
        $dates = array_values(array_map('strval', $payload));
    }
}

user_sync_json_ok(['dates' => $dates, 'count' => count($dates)]);
