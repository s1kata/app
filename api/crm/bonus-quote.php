<?php
/**
 * POST /api/crm/bonus-quote
 * Расчёт скидки бонусами при бронировании тура.
 * Тело: { "tourPrice": number, "bonusesToSpend": number, "email"?: string, "phone"?: string }
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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
require_once dirname(__DIR__) . '/lib/bonus-engine.php';
crm_maybe_cors($CONFIG);

$claims = auth_jwt_require_bearer($CONFIG);

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    auth_jwt_json_error('Некорректный JSON', 400);
}

$tourPrice = (int) ($body['tourPrice'] ?? 0);
$bonusesToSpend = (int) ($body['bonusesToSpend'] ?? 0);

$email = isset($body['email']) ? trim((string) $body['email']) : '';
$phone = isset($body['phone']) ? trim((string) $body['phone']) : '';
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

try {
    $clientRes = crm_uon_get_client_id($CONFIG, $email ?: null, $phone ?: null);
    if (!$clientRes['success']) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $clientRes['error'] ?? 'CRM error'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $clientId = $clientRes['data'];
    $available = 0;
    $bcId = null;
    if ($clientId !== null) {
        $bonusRes = crm_uon_get_bonus_transactions_by_user($CONFIG, (int) $clientId);
        if (!$bonusRes['success']) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => $bonusRes['error'] ?? 'CRM error'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stats = bonus_compute_balance_stats($bonusRes['data'] ?? []);
        $available = (int) $stats['availableBalance'];
        $bcId = $stats['bcId'];
    }

    $quote = bonus_compute_quote($tourPrice, $bonusesToSpend, $available);
    if (empty($quote['success'])) {
        auth_jwt_json_error($quote['error'] ?? 'Invalid quote', 400);
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'tourPrice' => $quote['tourPrice'],
            'bonusesToSpend' => $quote['bonusesToSpend'],
            'discountRub' => $quote['discountRub'],
            'payableRub' => $quote['payableRub'],
            'maxBonuses' => $quote['maxBonuses'],
            'minBonuses' => $quote['minBonuses'],
            'availableBalance' => $quote['availableBalance'],
            'bcId' => $bcId,
            'rules' => bonus_rules_for_client(),
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[crm/bonus-quote] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Bonus quote failed'], JSON_UNESCAPED_UNICODE);
}
