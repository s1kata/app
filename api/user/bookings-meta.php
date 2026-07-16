<?php
/**
 * GET  /api/user/bookings-meta.php — метаданные бронирований пользователя (оплата, snapshot)
 * PUT  /api/user/bookings-meta.php — upsert одной записи
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

require_once dirname(__DIR__) . '/lib/auth-jwt.php';
require_once dirname(__DIR__) . '/lib/crm-read-helpers.php';
require_once dirname(__DIR__) . '/lib/user-sync-helpers.php';
crm_maybe_cors($CONFIG);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!in_array($method, ['GET', 'PUT'], true)) {
    user_sync_json_error('Method not allowed', 405);
}

$claims = auth_jwt_require_bearer($CONFIG);
$userId = (int) ($claims['sub'] ?? 0);
if ($userId <= 0) {
    user_sync_json_error('Invalid user', 401);
}

try {
    $pdo = user_sync_db_connect($CONFIG);
} catch (Throwable $e) {
    error_log('[user/bookings-meta] db: ' . $e->getMessage());
    user_sync_json_error('Database unavailable', 503);
}

/**
 * @param array<string, mixed> $row
 * @return array<string, mixed>
 */
function bookings_meta_row_to_dto(array $row): array
{
    return [
        'localBookingId' => $row['local_booking_id'] ?? null,
        'crmRequestId' => $row['crm_request_id'] ?? null,
        'idempotencyKey' => $row['idempotency_key'] ?? null,
        'paymentStatus' => (string) ($row['payment_status'] ?? 'pending'),
        'tourSnapshot' => user_sync_decode_json(isset($row['tour_snapshot']) ? (string) $row['tour_snapshot'] : null),
        'payableRub' => isset($row['payable_rub']) ? (float) $row['payable_rub'] : null,
        'bonusSpent' => isset($row['bonus_spent']) ? (int) $row['bonus_spent'] : 0,
        'paidAt' => $row['paid_at'] ?? null,
        'payment' => user_sync_decode_json(isset($row['payment_json']) ? (string) $row['payment_json'] : null),
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
        'createdAt' => (string) ($row['created_at'] ?? ''),
    ];
}

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT * FROM app_bookings WHERE user_id = ? ORDER BY updated_at DESC'
    );
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    $out = [];
    foreach ($rows as $row) {
        if (is_array($row)) {
            $out[] = bookings_meta_row_to_dto($row);
        }
    }
    user_sync_json_ok($out);
}

$raw = file_get_contents('php://input') ?: '';
$body = $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($body)) {
    $body = [];
}

$crmRequestId = isset($body['crmRequestId']) ? trim((string) $body['crmRequestId']) : '';
$idempotencyKey = isset($body['idempotencyKey']) ? trim((string) $body['idempotencyKey']) : '';
if ($crmRequestId === '' && $idempotencyKey === '') {
    user_sync_json_error('crmRequestId or idempotencyKey required');
}

$localBookingId = isset($body['localBookingId']) ? trim((string) $body['localBookingId']) : null;
$paymentStatus = isset($body['paymentStatus']) ? trim((string) $body['paymentStatus']) : 'pending';
$allowedStatuses = ['pending', 'payment_processing', 'paid', 'failed', 'refunded', 'cancelled'];
if (!in_array($paymentStatus, $allowedStatuses, true)) {
    user_sync_json_error('Invalid paymentStatus');
}

$tourSnapshot = $body['tourSnapshot'] ?? null;
$tourSnapshotJson = $tourSnapshot === null ? null : json_encode($tourSnapshot, JSON_UNESCAPED_UNICODE);
$payableRub = isset($body['payableRub']) ? (float) $body['payableRub'] : null;
$bonusSpent = isset($body['bonusSpent']) ? max(0, (int) $body['bonusSpent']) : 0;
$paidAt = isset($body['paidAt']) ? trim((string) $body['paidAt']) : null;
$payment = $body['payment'] ?? null;
$paymentJson = $payment === null ? null : json_encode($payment, JSON_UNESCAPED_UNICODE);

$existing = null;
if ($crmRequestId !== '') {
    $stmt = $pdo->prepare('SELECT * FROM app_bookings WHERE user_id = ? AND crm_request_id = ? LIMIT 1');
    $stmt->execute([$userId, $crmRequestId]);
    $existing = $stmt->fetch() ?: null;
}
if ($existing === null && $idempotencyKey !== '') {
    $stmt = $pdo->prepare('SELECT * FROM app_bookings WHERE user_id = ? AND idempotency_key = ? LIMIT 1');
    $stmt->execute([$userId, $idempotencyKey]);
    $existing = $stmt->fetch() ?: null;
}

    if (is_array($existing)) {
    $existingStatus = (string) ($existing['payment_status'] ?? 'pending');
    $existingUpdated = strtotime((string) ($existing['updated_at'] ?? '')) ?: 0;
    $incomingUpdated = isset($body['updatedAt']) ? strtotime((string) $body['updatedAt']) : time();
    if ($existingStatus === 'paid' && $paymentStatus !== 'paid' && $paymentStatus !== 'refunded') {
        if ($incomingUpdated <= $existingUpdated) {
            $paymentStatus = 'paid';
        }
    }
    if ($existingStatus === 'paid' && $paymentStatus === 'pending' && $incomingUpdated <= $existingUpdated) {
        $paymentStatus = 'paid';
    }

    $stmt = $pdo->prepare(
        'UPDATE app_bookings SET
            local_booking_id = COALESCE(?, local_booking_id),
            crm_request_id = COALESCE(NULLIF(?, \'\'), crm_request_id),
            idempotency_key = COALESCE(NULLIF(?, \'\'), idempotency_key),
            payment_status = ?,
            tour_snapshot = COALESCE(?, tour_snapshot),
            payable_rub = COALESCE(?, payable_rub),
            bonus_spent = ?,
            paid_at = COALESCE(?, paid_at),
            payment_json = COALESCE(?, payment_json)
         WHERE id = ?'
    );
    $stmt->execute([
        $localBookingId,
        $crmRequestId,
        $idempotencyKey,
        $paymentStatus,
        $tourSnapshotJson,
        $payableRub,
        $bonusSpent,
        $paidAt,
        $paymentJson,
        (int) $existing['id'],
    ]);
    $stmt = $pdo->prepare('SELECT * FROM app_bookings WHERE id = ?');
    $stmt->execute([(int) $existing['id']]);
    $row = $stmt->fetch();
    user_sync_json_ok(is_array($row) ? bookings_meta_row_to_dto($row) : []);
}

$stmt = $pdo->prepare(
    'INSERT INTO app_bookings
        (user_id, local_booking_id, crm_request_id, idempotency_key, payment_status, tour_snapshot, payable_rub, bonus_spent, paid_at, payment_json)
     VALUES (?, ?, NULLIF(?, \'\'), NULLIF(?, \'\'), ?, ?, ?, ?, ?, ?)'
);
$stmt->execute([
    $userId,
    $localBookingId,
    $crmRequestId,
    $idempotencyKey,
    $paymentStatus,
    $tourSnapshotJson,
    $payableRub,
    $bonusSpent,
    $paidAt,
    $paymentJson,
]);
$stmt = $pdo->prepare('SELECT * FROM app_bookings WHERE id = ?');
$stmt->execute([(int) $pdo->lastInsertId()]);
$row = $stmt->fetch();
user_sync_json_ok(is_array($row) ? bookings_meta_row_to_dto($row) : []);
