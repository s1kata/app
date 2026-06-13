<?php
/**
 * POST /api/crm/bcard-bonus-create
 * Начисление/списание бонусов U-ON (bcard-bonus/create.json).
 * Тело: { "bc_id": number, "type": 1|2, "bonuses": number, "reason"?: string, "datetime"?: string }
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

auth_jwt_require_bearer($CONFIG);

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    auth_jwt_json_error('Некорректный JSON', 400);
}

$bcId = (int) ($body['bc_id'] ?? 0);
$type = (int) ($body['type'] ?? 0);
$bonuses = (int) ($body['bonuses'] ?? 0);

if ($bcId <= 0 || ($type !== 1 && $type !== 2) || $bonuses <= 0) {
    auth_jwt_json_error('Required: bc_id, type (1|2), bonuses > 0', 400);
}

$key = trim((string) ($CONFIG['uon_api_key'] ?? getenv('UON_API_KEY') ?: getenv('SOTA_API_KEY') ?: ''));
if ($key === '') {
    auth_jwt_json_error('CRM backend is not configured (UON_API_KEY)', 503);
}

$datetime = trim((string) ($body['datetime'] ?? ''));
if ($datetime === '') {
    $datetime = date('Y-m-d H:i:s');
}

$payload = [
    'bc_id' => $bcId,
    'datetime' => $datetime,
    'type' => $type,
    'bonuses' => $bonuses,
];
if (!empty($body['reason'])) {
    $payload['reason'] = (string) $body['reason'];
}
if (!empty($body['till_date'])) {
    $payload['till_date'] = (string) $body['till_date'];
}

$response = uon_request('bcard-bonus/create.json', $CONFIG, [
    'method' => 'POST',
    'body' => json_encode($payload, JSON_UNESCAPED_UNICODE),
]);

if (!$response['success']) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $response['error'] ?? 'Bonus operation failed'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['success' => true, 'data' => $response['data'] ?? null], JSON_UNESCAPED_UNICODE);
