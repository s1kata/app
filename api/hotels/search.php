<?php
/**
 * Server-side hotel search (Tourvisor token stays on server).
 *
 * GET  /api/hotels/search.php?countryId=&regionId=&category=&rating=&page=&limit=&allPages=0|1&enrich=0|1
 * POST /api/hotels/search.php  { countryId, regionId?, category?, rating?, types?, page?, limit?, allPages?, enrich? }
 *
 * Response:
 * { success, data: { hotels: HotelCompact[], total, page, limit, totalPages, enriched } }
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

require_once dirname(__DIR__) . '/lib/user-sync-helpers.php';
require_once dirname(__DIR__) . '/lib/next-patch-helpers.php';
np_maybe_cors($CONFIG);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!in_array($method, ['GET', 'POST'], true)) {
    user_sync_json_error('Method not allowed', 405);
}

$params = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input') ?: '';
    $body = $raw !== '' ? json_decode($raw, true) : [];
    $params = is_array($body) ? $body : [];
} else {
    $params = $_GET;
}

$countryId = isset($params['countryId']) ? (int) $params['countryId'] : 0;
if ($countryId <= 0) {
    user_sync_json_error('countryId is required');
}

$regionId = isset($params['regionId']) && $params['regionId'] !== '' ? (int) $params['regionId'] : null;
$category = isset($params['category']) && $params['category'] !== '' ? (int) $params['category'] : null;
$rating = isset($params['rating']) && $params['rating'] !== '' ? (float) $params['rating'] : null;
$page = isset($params['page']) ? max(1, (int) $params['page']) : 1;
$limit = isset($params['limit']) ? (int) $params['limit'] : 100;
if ($limit < 1 || $limit > 100) {
    $limit = 100;
}
$allPages = !empty($params['allPages']) && (string) $params['allPages'] !== '0';
$enrich = !empty($params['enrich']) && (string) $params['enrich'] !== '0';

$types = null;
if (isset($params['types'])) {
    if (is_array($params['types'])) {
        $types = array_values(array_filter(array_map('intval', $params['types'])));
    } elseif (is_string($params['types']) && $params['types'] !== '') {
        $types = array_values(array_filter(array_map('intval', explode(',', $params['types']))));
    }
}

if (np_tourvisor_token($CONFIG) === '') {
    user_sync_json_error('Tourvisor token is not configured on server', 503);
}

try {
    $pdo = user_sync_db_connect($CONFIG);
} catch (Throwable $e) {
    // Image cache optional — search still works without DB
    $pdo = null;
    error_log('[hotels/search] db optional fail: ' . $e->getMessage());
}

/**
 * @param array<string, mixed> $query
 */
function np_hotels_build_query(array $query): string
{
    $parts = [];
    foreach ($query as $k => $v) {
        if ($v === null || $v === '') {
            continue;
        }
        if (is_array($v)) {
            foreach ($v as $item) {
                $parts[] = rawurlencode((string) $k) . '=' . rawurlencode((string) $item);
            }
            continue;
        }
        $parts[] = rawurlencode((string) $k) . '=' . rawurlencode((string) $v);
    }
    return implode('&', $parts);
}

/**
 * @return array{hotels:list<array<string,mixed>>,total:int,page:int,totalPages:int,status:int}
 */
function np_fetch_hotels_page(array $config, int $countryId, ?int $regionId, ?int $category, ?float $rating, ?array $types, int $page, int $limit): array
{
    $q = [
        'countryId' => $countryId,
        'page' => $page,
        'limit' => $limit,
    ];
    if ($regionId) {
        $q['regionId'] = $regionId;
    }
    if ($category) {
        $q['category'] = $category;
    }
    if ($rating) {
        $q['rating'] = $rating;
    }
    if ($types) {
        $q['types'] = $types;
    }

    $meta = np_tourvisor_get_meta($config, '/hotels?' . np_hotels_build_query($q));
    if (!$meta['ok']) {
        return [
            'hotels' => [],
            'total' => 0,
            'page' => $page,
            'totalPages' => 0,
            'status' => (int) ($meta['status'] ?? 0),
        ];
    }

    $json = $meta['json'];
    $list = [];
    if (is_array($json)) {
        $isList = array_keys($json) === range(0, count($json) - 1);
        if ($isList) {
            $list = $json;
        } elseif (isset($json['data']) && is_array($json['data'])) {
            $list = $json['data'];
        }
    }

    $headers = $meta['headers'] ?? [];
    $total = isset($headers['x-total-count']) ? (int) $headers['x-total-count'] : count($list);
    $totalPages = isset($headers['x-total-pages']) ? (int) $headers['x-total-pages'] : 1;
    if ($totalPages < 1) {
        $totalPages = 1;
    }

    /** @var list<array<string,mixed>> $hotels */
    $hotels = [];
    foreach ($list as $row) {
        if (is_array($row)) {
            $hotels[] = $row;
        }
    }

    return [
        'hotels' => $hotels,
        'total' => $total,
        'page' => $page,
        'totalPages' => $totalPages,
        'status' => (int) ($meta['status'] ?? 200),
    ];
}

try {
    $allHotels = [];
    $total = 0;
    $totalPages = 1;
    $currentPage = $page;
    $maxPages = $allPages ? 40 : 1;
    $lastStatus = 200;

    for ($i = 0; $i < $maxPages; $i++) {
        $chunk = np_fetch_hotels_page(
            $CONFIG,
            $countryId,
            $regionId,
            $category,
            $rating,
            $types,
            $currentPage,
            $limit
        );
        $lastStatus = $chunk['status'];
        if ($chunk['hotels'] === [] && $i === 0 && $lastStatus >= 400) {
            user_sync_json_error('Tourvisor hotels request failed', $lastStatus >= 400 ? $lastStatus : 502);
        }

        $allHotels = array_merge($allHotels, $chunk['hotels']);
        $total = $chunk['total'] > 0 ? $chunk['total'] : count($allHotels);
        $totalPages = max(1, (int) $chunk['totalPages']);

        if (!$allPages) {
            break;
        }
        if (count($chunk['hotels']) < $limit) {
            break;
        }
        if ($currentPage >= $totalPages) {
            break;
        }
        $currentPage++;
        usleep(80000);
    }

    // Deduplicate by id
    $uniq = [];
    $deduped = [];
    foreach ($allHotels as $h) {
        $hid = (int) ($h['id'] ?? 0);
        if ($hid <= 0 || isset($uniq[$hid])) {
            continue;
        }
        $uniq[$hid] = true;
        $deduped[] = $h;
    }
    $allHotels = $deduped;

    if ($pdo instanceof PDO) {
        $allHotels = np_enrich_hotels_with_images($pdo, $allHotels, $CONFIG, $enrich, $enrich ? min(20, count($allHotels)) : 0);
    }

    user_sync_json_ok([
        'hotels' => $allHotels,
        'total' => $allPages ? count($allHotels) : $total,
        'page' => $page,
        'limit' => $limit,
        'totalPages' => $allPages ? 1 : $totalPages,
        'allPages' => $allPages,
        'enriched' => $enrich,
    ]);
} catch (Throwable $e) {
    error_log('[hotels/search] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    user_sync_json_error('Hotel search failed', 500);
}