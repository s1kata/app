<?php
/**
 * GET /api/crm/bonus-balance?email=&phone=
 * Баланс и история бонусов U-ON. JWT Bearer (auth-mobile.php).
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

try {
    $clientRes = crm_uon_get_client_id($CONFIG, $email ?: null, $phone ?: null);
    if (!$clientRes['success']) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $clientRes['error'] ?? 'CRM error'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $clientId = $clientRes['data'];
    if ($clientId === null) {
        echo json_encode(['success' => true, 'data' => ['balance' => 0, 'transactions' => []]], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $bonusRes = crm_uon_get_bonus_transactions_by_user($CONFIG, (int) $clientId);
    if (!$bonusRes['success']) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $bonusRes['error'] ?? 'CRM error'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $transactions = $bonusRes['data'] ?? [];
    $balance = crm_compute_bonus_balance($transactions);

    echo json_encode([
        'success' => true,
        'data' => ['balance' => $balance, 'transactions' => $transactions],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[crm/bonus-balance] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'CRM read failed'], JSON_UNESCAPED_UNICODE);
}
