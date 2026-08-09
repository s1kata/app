<?php
/**
 * Cron: check favorite tour price watches and send Expo pushes on drops.
 *
 * GET/POST /api/cron/price-watch.php
 * Header: X-Cron-Token: <cron_token|health_check_token>
 * Query:  limit=50 (optional)
 *
 * SpaceWeb cron example (every hour):
 * curl -s -H "X-Cron-Token: YOUR_TOKEN" "https://travelhub63.ru/api/cron/price-watch.php"
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
require_once dirname(__DIR__) . '/lib/user-sync-helpers.php';
require_once dirname(__DIR__) . '/lib/next-patch-helpers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

auth_jwt_require_cron($CONFIG);

try {
    $pdo = user_sync_db_connect($CONFIG);
} catch (Throwable $e) {
    error_log('[cron/price-watch] db: ' . $e->getMessage());
    user_sync_json_error('Database unavailable', 503);
}

$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 50;
if ($limit < 1 || $limit > 200) {
    $limit = 50;
}

$stmt = $pdo->prepare(
    'SELECT * FROM user_price_watches
     WHERE active = 1
     ORDER BY COALESCE(last_checked_at, \'1970-01-01\') ASC
     LIMIT ' . (int) $limit
);
$stmt->execute();
$watches = $stmt->fetchAll();

$checked = 0;
$drops = 0;
$pushed = 0;
$errors = 0;

foreach ($watches as $watch) {
    if (!is_array($watch)) {
        continue;
    }
    $watchId = (int) ($watch['id'] ?? 0);
    $userId = (int) ($watch['user_id'] ?? 0);
    $itemId = (string) ($watch['item_id'] ?? '');
    $currency = (string) ($watch['currency'] ?? 'RUB');
    $lastSeen = (float) ($watch['last_seen_price'] ?? 0);
    $minDrop = (int) ($watch['min_drop_percent'] ?? 5);
    $hotelName = (string) ($watch['hotel_name'] ?? 'Тур');
    $countryName = (string) ($watch['country_name'] ?? '');

    if ($watchId <= 0 || $userId <= 0 || $itemId === '') {
        continue;
    }

    $path = '/tours/' . rawurlencode($itemId) . '?currency=' . rawurlencode($currency);
    $tour = np_tourvisor_get($CONFIG, $path);
    $checked++;

    if (!is_array($tour)) {
        $errors++;
        $pdo->prepare('UPDATE user_price_watches SET last_checked_at = NOW() WHERE id = ?')->execute([$watchId]);
        usleep(120000);
        continue;
    }
    // unwrap
    if (isset($tour['data']) && is_array($tour['data'])) {
        $tour = $tour['data'];
    }

    $newPrice = isset($tour['price']) ? (float) $tour['price'] : 0.0;
    if ($newPrice <= 0) {
        $pdo->prepare('UPDATE user_price_watches SET last_checked_at = NOW() WHERE id = ?')->execute([$watchId]);
        usleep(80000);
        continue;
    }

    // Cache hotel image if present
    $hotel = is_array($tour['hotel'] ?? null) ? $tour['hotel'] : [];
    $hid = isset($hotel['id']) ? (int) $hotel['id'] : 0;
    $img = np_extract_hotel_image($hotel);
    if (!$img && !empty($tour['picture']) && is_string($tour['picture'])) {
        $img = $tour['picture'];
    }
    if ($hid > 0 && $img) {
        np_upsert_hotel_image($pdo, $hid, $img);
    }

    $dropPct = 0;
    if ($lastSeen > 0 && $newPrice < $lastSeen) {
        $dropPct = (int) round((($lastSeen - $newPrice) / $lastSeen) * 100);
    }

    $shouldNotify = $dropPct >= $minDrop;
    // Avoid spam: at most once per 12h for same watch
    if ($shouldNotify && !empty($watch['last_notified_at'])) {
        $lastNotifiedTs = strtotime((string) $watch['last_notified_at']);
        if ($lastNotifiedTs && (time() - $lastNotifiedTs) < 12 * 3600) {
            $shouldNotify = false;
        }
    }

    if ($shouldNotify) {
        $drops++;
        $tokStmt = $pdo->prepare('SELECT token FROM user_push_tokens WHERE user_id = ?');
        $tokStmt->execute([$userId]);
        $tokens = [];
        foreach ($tokStmt->fetchAll() as $tr) {
            if (is_array($tr) && !empty($tr['token'])) {
                $tokens[] = (string) $tr['token'];
            }
        }
        $title = 'Снижение цены в избранном';
        $label = trim($hotelName . ($countryName !== '' ? ', ' . $countryName : ''));
        $body = $label . ' — −' . $dropPct . '% (было '
            . number_format($lastSeen, 0, '.', ' ') . ' ₽, стало '
            . number_format($newPrice, 0, '.', ' ') . ' ₽)';
        $push = np_expo_push($tokens, $title, $body, [
            'type' => 'favorite_discount',
            'tourId' => $itemId,
            'oldPrice' => $lastSeen,
            'newPrice' => $newPrice,
            'discount' => $dropPct,
        ]);
        $pushed += (int) ($push['sent'] ?? 0);

        $pdo->prepare(
            'UPDATE user_price_watches
             SET last_seen_price = ?, last_checked_at = NOW(), last_notified_at = NOW(), updated_at = NOW()
             WHERE id = ?'
        )->execute([$newPrice, $watchId]);
    } else {
        $pdo->prepare(
            'UPDATE user_price_watches
             SET last_seen_price = ?, last_checked_at = NOW(), updated_at = NOW()
             WHERE id = ?'
        )->execute([$newPrice, $watchId]);
    }

    usleep(100000);
}

user_sync_json_ok([
    'checked' => $checked,
    'drops' => $drops,
    'pushed' => $pushed,
    'errors' => $errors,
    'limit' => $limit,
    'at' => gmdate('c'),
]);
