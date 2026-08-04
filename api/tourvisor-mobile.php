<?php
/**
 * TravelHub — прокси Tourvisor API для мобильного приложения.
 *
 * Разместите на сервере:
 * - public_html/backend/api/tourvisor-mobile.php (текущий rewrite в api/.htaccess)
 * - public_html/backend/api/lib/tourvisor-operators.php
 * - public_html/api/.htaccess (rewrite на backend)
 *
 * JWT Tourvisor хранится только на сервере (auth-mobile.config.php или env).
 *
 * GET /tours/search/{id} — фильтрует результаты по allowlist операторов.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/lib/tourvisor-operators.php';

$configPath = __DIR__ . '/auth-mobile.config.php';
$config = is_file($configPath) ? require $configPath : [];

$tourvisorToken = trim((string) (
    $config['tourvisor_token']
    ?? $config['tourvisor_jwt_token']
    ?? $config['TOURVISOR_TOKEN']
    ?? $config['TOURVISOR_JWT_TOKEN']
    ?? getenv('TOURVISOR_TOKEN')
    ?: getenv('TOURVISOR_JWT_TOKEN')
    ?: ''
));

if ($tourvisorToken === '') {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Tourvisor token is not configured on server',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$tourvisorBase = rtrim((string) (
    $config['tourvisor_api_base']
    ?? $config['TOURVISOR_API_BASE']
    ?? getenv('TOURVISOR_API_BASE')
    ?: 'https://api.tourvisor.ru/search/api/v1'
), '/');

$requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '');
$scriptName = (string) ($_SERVER['SCRIPT_NAME'] ?? '');
$pathInfo = (string) ($_SERVER['PATH_INFO'] ?? '');

$relativePath = $pathInfo;
if ($relativePath === '') {
    if (preg_match('#/tourvisor-mobile(?:\.php)?(/.*)?$#', $requestUri, $matches)) {
        $relativePath = (string) ($matches[1] ?? '');
    } elseif ($scriptName !== '' && str_starts_with($requestUri, $scriptName)) {
        $relativePath = substr($requestUri, strlen($scriptName));
    }
}

$queryPos = strpos($relativePath, '?');
if ($queryPos !== false) {
    $relativePath = substr($relativePath, 0, $queryPos);
}

if ($relativePath !== '' && !str_starts_with($relativePath, '/')) {
    $relativePath = '/' . $relativePath;
}

if ($relativePath === '' || $relativePath === '/') {
    echo json_encode(['success' => true, 'service' => 'tourvisor-mobile-proxy'], JSON_UNESCAPED_UNICODE);
    exit;
}

$queryString = (string) ($_SERVER['QUERY_STRING'] ?? '');
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

$isTourSearchResults = $method === 'GET' && preg_match('#^/tours/search/\d+$#', $relativePath) === 1;

$targetUrl = $tourvisorBase . $relativePath . ($queryString !== '' ? '?' . $queryString : '');

$body = file_get_contents('php://input') ?: '';

$headers = [
    'Accept: application/json',
    'Authorization: Bearer ' . $tourvisorToken,
];

if ($method === 'POST' && $body !== '') {
    $headers[] = 'Content-Type: application/json';
}

$ch = curl_init($targetUrl);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 20,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_POSTFIELDS => $method === 'POST' ? $body : null,
]);

$responseBody = curl_exec($ch);
$curlError = curl_error($ch);
$statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($responseBody === false) {
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'error' => 'Tourvisor upstream request failed',
        'details' => $curlError,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code($statusCode > 0 ? $statusCode : 502);

if ($isTourSearchResults && $statusCode >= 200 && $statusCode < 300) {
    $decoded = json_decode($responseBody, true);
    if (is_array($decoded)) {
        if (array_is_list($decoded)) {
            $decoded = tv_filter_tour_hotels_by_country_operators($decoded);
            echo json_encode($decoded, JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (isset($decoded['data']) && is_array($decoded['data']) && array_is_list($decoded['data'])) {
            $decoded['data'] = tv_filter_tour_hotels_by_country_operators($decoded['data']);
            echo json_encode($decoded, JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
}

echo $responseBody;
