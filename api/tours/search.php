<?php
/**
 * Start tour search (Tourvisor token on server only).
 *
 * POST /api/tours/search.php
 * Body: TourSearchParams JSON (departureId, countryId, dateFrom, dateTo, nightsFrom, nightsTo, adults, currency, ...)
 *
 * Response: { success, data: { searchId } }
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

$required = ['departureId', 'countryId', 'dateFrom', 'dateTo', 'nightsFrom', 'nightsTo', 'adults', 'currency'];
foreach ($required as $key) {
    if (!isset($params[$key]) || $params[$key] === '' || $params[$key] === null) {
        user_sync_json_error($key . ' is required');
    }
}

if (np_tourvisor_token($CONFIG) === '') {
    user_sync_json_error('Tourvisor token is not configured on server', 503);
}

// priceFrom/priceTo intentionally omitted — breaks Tourvisor yield; filter client-side.
$query = [
    'departureId' => (int) $params['departureId'],
    'countryId' => (int) $params['countryId'],
    'dateFrom' => (string) $params['dateFrom'],
    'dateTo' => (string) $params['dateTo'],
    'nightsFrom' => (int) $params['nightsFrom'],
    'nightsTo' => (int) $params['nightsTo'],
    'adults' => (int) $params['adults'],
    'currency' => strtoupper(trim((string) $params['currency'])),
    'onlyCharter' => !empty($params['onlyCharter']) && (string) $params['onlyCharter'] !== '0',
];

if (isset($params['childs']) && is_array($params['childs'])) {
    $query['childs'] = array_values(array_map('intval', $params['childs']));
}
foreach (['meal', 'hotelCategory', 'arrivalId'] as $opt) {
    if (isset($params[$opt]) && $params[$opt] !== '' && $params[$opt] !== null) {
        $query[$opt] = $params[$opt];
    }
}
if (isset($params['regionIds']) && is_array($params['regionIds'])) {
    $query['regionIds'] = array_values(array_filter(array_map('intval', $params['regionIds'])));
}
if (isset($params['hotelIds']) && is_array($params['hotelIds'])) {
    $query['hotelIds'] = array_values(array_filter(array_map('intval', $params['hotelIds'])));
}

$path = '/tours/search?' . np_query_encode($query);
$meta = np_tourvisor_get_meta($CONFIG, $path);

if (!$meta['ok']) {
    $status = (int) ($meta['status'] ?? 502);
    http_response_code($status >= 400 && $status < 600 ? $status : 502);
    echo json_encode([
        'success' => false,
        'error' => 'Tourvisor search start failed',
        'status' => $meta['status'] ?? 0,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = np_unwrap_tourvisor_payload($meta['json']);
$searchId = 0;
if (is_array($payload)) {
    $searchId = (int) ($payload['searchId'] ?? $payload['id'] ?? 0);
}

if ($searchId <= 0) {
    user_sync_json_error('Invalid searchId from Tourvisor', 502);
}

user_sync_json_ok(['searchId' => $searchId]);
