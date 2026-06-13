<?php
/**
 * POST /api/crm/bcard-activate
 * Активация бонусной карты U-ON (bcard-activate/create.json).
 * Тело: { "bc_number": "...", "user_id"?: number } — user_id = U-ON client id (опционально, ищем по email).
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
crm_maybe_cors($CONFIG);

$claims = auth_jwt_require_bearer($CONFIG);

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    auth_jwt_json_error('Некорректный JSON', 400);
}

$bcNumber = trim((string) ($body['bc_number'] ?? ''));
if ($bcNumber === '') {
    auth_jwt_json_error('Укажите bc_number', 400);
}

$key = trim((string) ($CONFIG['uon_api_key'] ?? getenv('UON_API_KEY') ?: getenv('SOTA_API_KEY') ?: ''));
if ($key === '') {
    auth_jwt_json_error('CRM backend is not configured (UON_API_KEY)', 503);
}

$userId = isset($body['user_id']) ? (int) $body['user_id'] : 0;
if ($userId <= 0) {
    $email = trim((string) ($claims['email'] ?? ''));
    $phone = trim((string) ($claims['phone_number'] ?? ''));
    $clientRes = crm_uon_get_client_id($CONFIG, $email ?: null, $phone ?: null);
    if (!$clientRes['success'] || $clientRes['data'] === null) {
        auth_jwt_json_error('Клиент не найден в CRM', 404);
    }
    $userId = (int) $clientRes['data'];
}

$response = uon_request('bcard-activate/create.json', $CONFIG, [
    'method' => 'POST',
    'body' => json_encode([
        'bc_number' => $bcNumber,
        'user_id' => $userId,
    ], JSON_UNESCAPED_UNICODE),
]);

if (!$response['success']) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $response['error'] ?? 'Activation failed'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['success' => true, 'data' => $response['data'] ?? null], JSON_UNESCAPED_UNICODE);
