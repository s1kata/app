<?php
/**
 * /api/crm/reviews.php — отзывы (JWT Bearer, MySQL).
 * GET    ?tourId=&hotelId=  — список
 * POST   { tourId?, hotelId?, rating, text }
 * PUT    { id, rating, text }
 * DELETE ?id=
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
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

try {
    $pdo = reviews_db_connect($CONFIG);
} catch (Throwable $e) {
    error_log('[crm/reviews] db: ' . $e->getMessage());
    reviews_json_error('Database unavailable', 503);
}

if ($method === 'GET') {
    $tourId = isset($_GET['tourId']) ? trim((string) $_GET['tourId']) : '';
    $hotelId = isset($_GET['hotelId']) ? trim((string) $_GET['hotelId']) : '';
    $viewerId = null;
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        $secret = (string) ($CONFIG['jwt_secret'] ?? '');
        $claims = $secret !== '' ? auth_jwt_decode(trim($m[1]), $secret, auth_jwt_issuer($CONFIG)) : null;
        if ($claims && !empty($claims['sub'])) {
            $viewerId = (int) $claims['sub'];
        }
    }
    reviews_json_ok(reviews_list($pdo, $tourId ?: null, $hotelId ?: null, $viewerId));
}

$claims = auth_jwt_require_bearer($CONFIG);
$userId = (int) $claims['sub'];
if ($userId <= 0) {
    reviews_json_error('Invalid user', 401);
}

$userName = trim((string) ($claims['name'] ?? $claims['email'] ?? 'Пользователь'));
if ($userName === '') {
    $userName = 'Пользователь';
}

$raw = file_get_contents('php://input') ?: '';
$body = $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($body)) {
    $body = [];
}

if ($method === 'POST') {
    $tourId = isset($body['tourId']) ? trim((string) $body['tourId']) : '';
    $hotelId = isset($body['hotelId']) ? trim((string) $body['hotelId']) : '';
    if ($tourId === '' && $hotelId === '') {
        reviews_json_error('Укажите tourId или hotelId', 400);
    }
    reviews_assert_single_per_target($pdo, $userId, $tourId ?: null, $hotelId ?: null);
    $rating = reviews_clamp_rating($body['rating'] ?? 5);
    $text = reviews_sanitize_text((string) ($body['text'] ?? ''));

    $stmt = $pdo->prepare(
        'INSERT INTO reviews (user_id, user_name, tour_id, hotel_id, rating, review_text, verified)
         VALUES (?, ?, ?, ?, ?, ?, 1)'
    );
    $stmt->execute([
        $userId,
        $userName,
        $tourId !== '' ? $tourId : null,
        $hotelId !== '' ? $hotelId : null,
        $rating,
        $text,
    ]);
    $newId = (int) $pdo->lastInsertId();
    reviews_json_ok(['id' => (string) $newId]);
}

if ($method === 'PUT') {
    $id = (int) ($body['id'] ?? $_GET['id'] ?? 0);
    if ($id <= 0) {
        reviews_json_error('id required', 400);
    }
    $stmt = $pdo->prepare('SELECT user_id FROM reviews WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row || (int) $row['user_id'] !== $userId) {
        reviews_json_error('Forbidden', 403);
    }
    $rating = reviews_clamp_rating($body['rating'] ?? 5);
    $text = reviews_sanitize_text((string) ($body['text'] ?? ''));
    $upd = $pdo->prepare('UPDATE reviews SET rating = ?, review_text = ?, updated_at = NOW() WHERE id = ?');
    $upd->execute([$rating, $text, $id]);
    reviews_json_ok(['id' => (string) $id]);
}

if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? $body['id'] ?? 0);
    if ($id <= 0) {
        reviews_json_error('id required', 400);
    }
    $stmt = $pdo->prepare('SELECT user_id FROM reviews WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row || (int) $row['user_id'] !== $userId) {
        reviews_json_error('Forbidden', 403);
    }
    $upd = $pdo->prepare('UPDATE reviews SET deleted_at = NOW() WHERE id = ?');
    $upd->execute([$id]);
    reviews_json_ok(['id' => (string) $id]);
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
