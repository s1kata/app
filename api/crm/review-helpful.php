<?php
/**
 * POST /api/crm/review-helpful.php — отметить / снять «полезно».
 * Body: { reviewId: string, helpful: boolean }
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
require_once dirname(__DIR__) . '/lib/reviews-helpers.php';
crm_maybe_cors($CONFIG);

$claims = auth_jwt_require_bearer($CONFIG);
$userId = (int) $claims['sub'];
if ($userId <= 0) {
    reviews_json_error('Invalid user', 401);
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    reviews_json_error('Invalid JSON', 400);
}

$reviewId = (int) ($body['reviewId'] ?? 0);
$helpful = !empty($body['helpful']);
if ($reviewId <= 0) {
    reviews_json_error('reviewId required', 400);
}

try {
    $pdo = reviews_db_connect($CONFIG);
} catch (Throwable $e) {
    error_log('[crm/review-helpful] db: ' . $e->getMessage());
    reviews_json_error('Database unavailable', 503);
}

$check = $pdo->prepare('SELECT id FROM reviews WHERE id = ? AND deleted_at IS NULL LIMIT 1');
$check->execute([$reviewId]);
if (!$check->fetch()) {
    reviews_json_error('Review not found', 404);
}

$pdo->beginTransaction();
try {
    $exists = $pdo->prepare('SELECT id FROM review_helpful WHERE review_id = ? AND user_id = ? LIMIT 1');
    $exists->execute([$reviewId, $userId]);
    $has = (bool) $exists->fetch();

    if ($helpful && !$has) {
        $ins = $pdo->prepare('INSERT INTO review_helpful (review_id, user_id) VALUES (?, ?)');
        $ins->execute([$reviewId, $userId]);
        $pdo->prepare('UPDATE reviews SET helpful = helpful + 1 WHERE id = ?')->execute([$reviewId]);
    } elseif (!$helpful && $has) {
        $del = $pdo->prepare('DELETE FROM review_helpful WHERE review_id = ? AND user_id = ?');
        $del->execute([$reviewId, $userId]);
        $pdo->prepare('UPDATE reviews SET helpful = GREATEST(0, helpful - 1) WHERE id = ?')->execute([$reviewId]);
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    error_log('[crm/review-helpful] ' . $e->getMessage());
    reviews_json_error('Failed to update helpful', 500);
}

$cnt = $pdo->prepare('SELECT helpful FROM reviews WHERE id = ?');
$cnt->execute([$reviewId]);
$row = $cnt->fetch();
reviews_json_ok([
    'reviewId' => (string) $reviewId,
    'helpful' => (int) ($row['helpful'] ?? 0),
    'userMarkedHelpful' => $helpful,
]);
