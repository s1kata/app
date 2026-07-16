<?php
/**
 * GET /api/crm/client-bookings?email=&phone=
 * Список заявок U-ON по клиенту. JWT Bearer (auth-mobile.php).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

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
crm_maybe_cors($CONFIG);

$claims = auth_jwt_require_bearer($CONFIG);

$email = isset($_GET['email']) ? trim((string) $_GET['email']) : '';
$phone = isset($_GET['phone']) ? trim((string) $_GET['phone']) : '';

if ($email === '' && isset($claims['email'])) {
    $email = trim((string) $claims['email']);
}
if ($phone === '' && isset($claims['phone_number'])) {
    $phone = trim((string) $claims['phone_number']);
}

$deny = crm_assert_email_phone_allowed($claims, $email ?: null, $phone ?: null);
if ($deny) {
    auth_jwt_json_error($deny, 403);
}

$key = trim((string) ($CONFIG['uon_api_key'] ?? getenv('UON_API_KEY') ?: getenv('SOTA_API_KEY') ?: ''));
if ($key === '') {
    auth_jwt_json_error('CRM backend is not configured (UON_API_KEY)', 503);
}

/**
 * @param array<string, mixed> $r
 * @return array<string, mixed>
 */
function client_bookings_map_uon(array $r): array
{
    $services = $r['services'] ?? [];
    $firstService = is_array($services) && isset($services[0]) && is_array($services[0]) ? $services[0] : [];

    return [
        'id' => (string) ($r['id'] ?? $r['id_system'] ?? ''),
        'bookingNumber' => (string) ($r['id_internal'] ?? $r['id_system'] ?? $r['id'] ?? ''),
        'clientName' => trim(implode(' ', array_filter([
            $r['client_surname'] ?? '',
            $r['client_name'] ?? '',
            $r['client_sname'] ?? '',
        ]))) ?: '—',
        'clientPhone' => (string) ($r['client_phone'] ?? $r['client_phone_mobile'] ?? ''),
        'clientEmail' => (string) ($r['client_email'] ?? ''),
        'tourName' => (string) ($firstService['hotel'] ?? $firstService['description'] ?? '—'),
        'departureDate' => (string) ($r['date_begin'] ?? ''),
        'returnDate' => (string) ($r['date_end'] ?? ''),
        'participants' => 0,
        'status' => (string) ($r['status'] ?? '—'),
        'totalPrice' => (float) ($r['calc_price'] ?? 0),
        'currency' => (string) ($firstService['currency'] ?? 'RUB'),
        'documents' => [],
        'createdAt' => (string) ($r['dat'] ?? $r['created_at'] ?? ''),
        'updatedAt' => (string) ($r['dat_updated'] ?? ''),
    ];
}

try {
    $clientRes = crm_uon_get_client_id($CONFIG, $email ?: null, $phone ?: null);
    if (!$clientRes['success']) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $clientRes['error'] ?? 'CRM error'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $clientId = $clientRes['data'];
    if ($clientId === null) {
        echo json_encode(['success' => true, 'data' => []], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $response = uon_request('request-by-client/' . (int) $clientId . '/1.json', $CONFIG, ['method' => 'GET']);
    if (!$response['success']) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $response['error'] ?? 'CRM error'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $list = is_array($response['data'] ?? null) ? $response['data'] : [];
    $bookings = [];
    foreach ($list as $item) {
        if (is_array($item)) {
            $bookings[] = client_bookings_map_uon($item);
        }
    }

    echo json_encode(['success' => true, 'data' => $bookings], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[crm/client-bookings] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'CRM read failed'], JSON_UNESCAPED_UNICODE);
}
