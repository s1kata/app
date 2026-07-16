<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function cfg(array $cfg, string $key, string $env): string {
    $v = $cfg[$key] ?? null;
    if (is_string($v) && trim($v) !== '') return trim($v);
    $e = getenv($env);
    return is_string($e) ? trim($e) : '';
}
function tinkoffSign(array $params, string $password): string {
    $data = $params;
    unset($data['Token']);
    $data['Password'] = $password;
    ksort($data);
    $concat = '';
    foreach ($data as $value) {
        if (is_scalar($value) || $value === null) $concat .= (string)$value;
    }
    return hash('sha256', $concat);
}

$configPath = __DIR__ . '/auth-mobile.config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'auth-mobile.config.php not found']);
    exit;
}
$CONFIG = require $configPath;

$password = cfg($CONFIG, 'tinkoff_password', 'TINKOFF_PASSWORD');
if ($password === '') {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Tinkoff password not configured']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    echo json_encode(['success' => false, 'error' => 'invalid_json']);
    exit;
}

$tokenProvided = (string)($body['Token'] ?? '');
$withoutToken = $body;
unset($withoutToken['Token']);
$expected = tinkoffSign($withoutToken, $password);

if ($tokenProvided === '' || !hash_equals($expected, $tokenProvided)) {
    echo json_encode(['success' => false, 'error' => 'invalid_signature']);
    exit;
}

$line = json_encode([
    'at' => date('c'),
    'orderId' => $body['OrderId'] ?? null,
    'paymentId' => $body['PaymentId'] ?? null,
    'status' => $body['Status'] ?? null,
    'successFlag' => $body['Success'] ?? null,
], JSON_UNESCAPED_UNICODE);

@file_put_contents(__DIR__ . '/payment-webhook.log', $line . PHP_EOL, FILE_APPEND);

echo json_encode(['success' => true]);
