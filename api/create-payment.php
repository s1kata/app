<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function fail(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

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
        if (is_scalar($value) || $value === null) {
            $concat .= (string)$value;
        }
    }
    return hash('sha256', $concat);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail(405, 'Method not allowed');
}

$configPath = __DIR__ . '/auth-mobile.config.php';
if (!is_file($configPath)) {
    fail(500, 'auth-mobile.config.php not found');
}

/** @var array<string,mixed> $CONFIG */
$CONFIG = require $configPath;

require_once __DIR__ . '/lib/auth-jwt.php';

$claims = auth_jwt_require_bearer($CONFIG);
$authUserId = (string)($claims['sub'] ?? '');
if ($authUserId === '') {
    fail(401, 'Invalid auth token payload');
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    fail(400, 'Invalid JSON');
}

$amount = isset($body['amount']) ? (float)$body['amount'] : 0.0;
$orderId = isset($body['orderId']) ? trim((string)$body['orderId']) : '';
$userId = isset($body['userId']) ? trim((string)$body['userId']) : '';
$description = isset($body['description']) ? trim((string)$body['description']) : 'Оплата заказа';
$currency = isset($body['currency']) ? strtoupper(trim((string)$body['currency'])) : 'RUB';
$returnUrl = isset($body['returnUrl']) ? trim((string)$body['returnUrl']) : '';
$failReturnUrl = isset($body['failReturnUrl']) ? trim((string)$body['failReturnUrl']) : '';

if ($amount <= 0 || $orderId === '' || $userId === '') {
    fail(400, 'Required: amount, orderId, userId');
}

if ($userId !== $authUserId) {
    fail(403, 'Forbidden: userId mismatch');
}

if (mb_strlen($orderId) > 190) {
    fail(400, 'orderId too long');
}
if (preg_match('/^[A-Za-z0-9_-]+$/', $orderId) !== 1) {
    fail(400, 'orderId format invalid');
}

if ($currency === '') {
    $currency = 'RUB';
}

$terminalKey = cfg($CONFIG, 'tinkoff_terminal_key', 'TINKOFF_TERMINAL_KEY');
$password = cfg($CONFIG, 'tinkoff_password', 'TINKOFF_PASSWORD');
$appUrl = rtrim(cfg($CONFIG, 'app_url', 'APP_URL') ?: 'https://travelhub63.ru', '/');
$apiUrl = rtrim(cfg($CONFIG, 'api_url', 'API_URL') ?: 'https://travelhub63.ru', '/');

if ($terminalKey === '' || $password === '') {
    fail(500, 'Tinkoff is not configured');
}

$amountKopecks = (int)round($amount * 100);

$orderIdForProvider = str_replace('-', '_', $orderId);
$base = substr($orderIdForProvider, 0, 24);
$suffix = substr((string)time(), -10);
$uniqueOrderId = $base . '__' . $suffix;

// Deep link для приложения — только на landing-странице, не в SuccessURL Tinkoff.
$deepSuccess = $returnUrl !== ''
    ? $returnUrl
    : ('travelhub://booking-success?bookingId=' . rawurlencode($orderId));
$deepFail = $failReturnUrl !== ''
    ? $failReturnUrl
    : ('travelhub://booking-fail?bookingId=' . rawurlencode($orderId));

// Tinkoff принимает https; нейтральная страница, без «Оплата прошла» до GetState в приложении.
$successUrl = $appUrl . '/payment/success.php?orderId=' . rawurlencode($orderId)
    . '&returnTo=' . rawurlencode($deepSuccess);
$failUrl = $appUrl . '/payment/fail.php?orderId=' . rawurlencode($orderId)
    . '&returnTo=' . rawurlencode($deepFail);

$payload = [
    'TerminalKey' => $terminalKey,
    'Amount' => $amountKopecks,
    'OrderId' => $uniqueOrderId,
    'Description' => mb_substr($description, 0, 140),
    'SuccessURL' => $successUrl,
    'FailURL' => $failUrl,
    'NotificationURL' => $apiUrl . '/api/payment-webhook',
    'CustomerKey' => $authUserId,
];
$payload['Token'] = tinkoffSign($payload, $password);

$ch = curl_init('https://securepay.tinkoff.ru/v2/Init');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_CONNECTTIMEOUT => 5,
]);

$response = curl_exec($ch);
$curlErr = curl_error($ch);
$httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
    fail(502, 'Payment service unavailable: ' . ($curlErr ?: 'curl_error'));
}

if ($httpCode >= 500) {
    fail(502, 'Payment provider temporarily unavailable');
}

$data = json_decode((string)$response, true);
if (!is_array($data)) {
    fail(502, 'Invalid response from payment service');
}

if (empty($data['Success']) || empty($data['PaymentURL'])) {
    fail(400, (string)($data['Message'] ?? $data['Details'] ?? 'Tinkoff Init failed'));
}

$transactionId = (string)($data['PaymentId'] ?? $data['PaymentID'] ?? '');
if ($transactionId === '') {
    fail(500, 'Tinkoff did not return PaymentId');
}

echo json_encode([
    'success' => true,
    'paymentUrl' => (string)$data['PaymentURL'],
    'transactionId' => $transactionId,
], JSON_UNESCAPED_UNICODE);
exit;
