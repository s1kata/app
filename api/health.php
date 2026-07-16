<?php
/**
 * Простой health endpoint для внешнего мониторинга.
 * GET /api/health.php
 *
 * Безопасность:
 * - при наличии health_check_token в auth-mobile.config.php
 *   требуется заголовок X-Health-Token.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$configPath = __DIR__ . '/auth-mobile.config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'auth-mobile.config.php not found'], JSON_UNESCAPED_UNICODE);
    exit;
}

/** @var array<string, mixed> $config */
$config = require $configPath;
$expected = trim((string) ($config['health_check_token'] ?? ''));
$provided = trim((string) ($_SERVER['HTTP_X_HEALTH_TOKEN'] ?? ''));

if ($expected !== '' && ($provided === '' || !hash_equals($expected, $provided))) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden', 'code' => 'FORBIDDEN'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $db = is_array($config['db'] ?? null) ? $config['db'] : [];
    $host = (string) ($db['host'] ?? getenv('DB_HOST') ?: 'localhost');
    $port = (int) ($db['port'] ?? 3306);
    $name = (string) ($db['name'] ?? getenv('DB_NAME') ?: '');
    $user = (string) ($db['user'] ?? getenv('DB_USER') ?: '');
    $pass = (string) ($db['pass'] ?? getenv('DB_PASSWORD') ?: '');
    $charset = (string) ($db['charset'] ?? 'utf8mb4');

    if ($name === '' || $user === '') {
        throw new RuntimeException('DB config is incomplete');
    }

    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $name, $charset),
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
    $pdo->query('SELECT 1');

    echo json_encode(
        [
            'success' => true,
            'status' => 'ok',
            'service' => 'travelhub-api',
            'time' => gmdate('c'),
        ],
        JSON_UNESCAPED_UNICODE
    );
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(
        [
            'success' => false,
            'status' => 'error',
            'error' => 'health_check_failed',
            'time' => gmdate('c'),
        ],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}
