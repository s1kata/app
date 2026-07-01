<?php
/**
 * TravelHub — API авторизации для мобильного приложения (SQL, без Firebase).
 *
 * Разместите на сервере: https://travelhub63.ru/api/auth-mobile.php
 * Рядом положите auth-mobile.config.php (см. auth-mobile.config.example.php).
 *
 * Запросы: POST JSON { "action": "login|register|refresh|logout|me|forgot-password|reset-password|update-profile|delete-account", ... }
 * Ответы: JSON { "success": true/false, "error"?: "...", ... }
 * Защищённые методы: заголовок Authorization: Bearer <accessToken>
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/lib/auth-cors.php';
require_once __DIR__ . '/lib/rate-limit.php';

$configPath = __DIR__ . '/auth-mobile.config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Конфиг auth-mobile.config.php не найден']);
    exit;
}

/** @var array<string, mixed> $CONFIG */
$CONFIG = require $configPath;

auth_apply_cors($CONFIG);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Метод не поддерживается', 405);
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    json_error('Некорректный JSON', 400);
}

$action = isset($body['action']) ? trim((string) $body['action']) : '';
if ($action === '') {
    json_error('Укажите action', 400);
}

// Диагностика — только с секретным токеном, без раскрытия инфраструктуры
if ($action === 'health') {
    handle_health($CONFIG);
}

try {
    $pdo = db_connect($CONFIG);
} catch (Throwable $e) {
    error_log('[auth-mobile] DB: ' . $e->getMessage());
    $msg = 'Ошибка подключения к базе данных';
    if (!empty($CONFIG['debug'])) {
        $msg .= ': ' . $e->getMessage();
    }
    json_error($msg, 500, 'DB_CONNECT_FAILED');
}

try {
    switch ($action) {
        case 'login':
            handle_login($pdo, $CONFIG, $body);
            break;
        case 'register':
            handle_register($pdo, $CONFIG, $body);
            break;
        case 'refresh':
            handle_refresh($pdo, $CONFIG, $body);
            break;
        case 'logout':
            handle_logout($pdo, $CONFIG, $body);
            break;
        case 'me':
            handle_me($pdo, $CONFIG);
            break;
        case 'forgot-password':
            handle_forgot_password($pdo, $CONFIG, $body);
            break;
        case 'reset-password':
            handle_reset_password($pdo, $CONFIG, $body);
            break;
        case 'update-profile':
            handle_update_profile($pdo, $CONFIG, $body);
            break;
        case 'delete-account':
            handle_delete_account($pdo, $CONFIG);
            break;
        default:
            json_error('Неизвестный action: ' . $action, 400);
    }
} catch (Throwable $e) {
    error_log('[auth-mobile] ' . $e->getMessage());
    json_error('Внутренняя ошибка сервера', 500);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handle_health(array $config): void
{
    $expected = trim((string) ($config['health_check_token'] ?? ''));
    $provided = trim((string) ($_SERVER['HTTP_X_HEALTH_TOKEN'] ?? ''));
    if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
        json_error('Forbidden', 403, 'FORBIDDEN');
    }

    $report = [
        'success' => true,
        'php' => PHP_VERSION,
        'db' => ['connected' => false],
        'tables' => [],
    ];

    try {
        $pdo = db_connect($config);
        $report['db']['connected'] = true;

        $usersTable = $config['tables']['users'] ?? 'users';
        $stmt = $pdo->query(sprintf('SHOW TABLES LIKE %s', $pdo->quote($usersTable)));
        $report['tables']['users'] = (bool) $stmt->fetchColumn();

        foreach (['refresh_tokens', 'password_reset_tokens'] as $t) {
            $table = $config['tables'][$t] ?? $t;
            $st = $pdo->query(sprintf('SHOW TABLES LIKE %s', $pdo->quote($table)));
            $report['tables'][$t] = (bool) $st->fetchColumn();
        }
    } catch (Throwable $e) {
        $report['success'] = false;
        $report['error'] = 'health_check_failed';
        if (!empty($config['debug'])) {
            $report['debug'] = $e->getMessage();
        }
    }

    json_ok($report);
}

function handle_login(PDO $pdo, array $config, array $body): void
{
    $email = normalize_email($body['email'] ?? '');
    $password = (string) ($body['password'] ?? '');

    if ($email === '' || $password === '') {
        json_error('Укажите email и пароль', 400);
    }

    rate_limit_enforce('login', $email, 5, 900);

    $user = find_user_by_email($pdo, $config, $email);
    if (!$user || !verify_user_password($pdo, $config, $password, $user)) {
        json_error('Неверный email или пароль', 401, 'INVALID_CREDENTIALS');
    }
    if (!(int) $user['is_active'] || !empty($user['deleted_at'])) {
        json_error('Аккаунт деактивирован', 403, 'ACCOUNT_DISABLED');
    }

    touch_last_login($pdo, $config, (int) $user['id']);
    issue_tokens_and_respond($pdo, $config, $user);
}

function handle_register(PDO $pdo, array $config, array $body): void
{
    $email = normalize_email($body['email'] ?? '');
    $password = (string) ($body['password'] ?? '');
    $fullName = trim((string) ($body['fullName'] ?? $body['full_name'] ?? ''));
    $phone = trim((string) ($body['phone'] ?? ''));

    if ($email === '' || $password === '' || $fullName === '') {
        json_error('Заполните email, пароль и имя', 400);
    }
    $passwordError = validate_password_strength($password);
    if ($passwordError !== null) {
        json_error($passwordError, 400, 'WEAK_PASSWORD');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Некорректный формат email', 400, 'INVALID_EMAIL');
    }
    if (find_user_by_email($pdo, $config, $email)) {
        json_error('Пользователь с таким email уже существует', 409, 'EMAIL_EXISTS');
    }

    $cols = $config['columns'];
    $table = $config['tables']['users'];
    $hash = password_hash($password, PASSWORD_DEFAULT);

    $sql = sprintf(
        'INSERT INTO `%s` (`%s`, `%s`, `%s`, `%s`, `%s`, `%s`, `%s`) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
        $table,
        $cols['email'],
        $cols['password'],
        $cols['full_name'],
        $cols['phone'],
        $cols['is_active'],
        $cols['created_at'],
        $cols['updated_at']
    );
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$email, $hash, $fullName, $phone]);

    $user = find_user_by_id($pdo, $config, (int) $pdo->lastInsertId());
    if (!$user) {
        json_error('Не удалось создать пользователя', 500);
    }

    http_response_code(201);
    issue_tokens_and_respond($pdo, $config, $user);
}

function handle_refresh(PDO $pdo, array $config, array $body): void
{
    $refreshToken = trim((string) ($body['refreshToken'] ?? ''));
    if ($refreshToken === '') {
        json_error('Укажите refreshToken', 400);
    }

    rate_limit_enforce('refresh', substr(hash('sha256', $refreshToken), 0, 16), 30, 900);

    $hash = hash('sha256', $refreshToken);
    $table = $config['tables']['refresh_tokens'];
    $stmt = $pdo->prepare(
        "SELECT * FROM `{$table}` WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1"
    );
    $stmt->execute([$hash]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $reuseStmt = $pdo->prepare(
            "SELECT * FROM `{$table}` WHERE token_hash = ? AND revoked_at IS NOT NULL LIMIT 1"
        );
        $reuseStmt->execute([$hash]);
        $reused = $reuseStmt->fetch(PDO::FETCH_ASSOC);
        if ($reused) {
            revoke_all_refresh_tokens_for_user($pdo, $config, (int) $reused['user_id']);
            error_log('[auth-mobile] Refresh token reuse detected for user ' . (int) $reused['user_id']);
            json_error('Недействительный refresh token', 401, 'REFRESH_REUSE');
        }
        json_error('Недействительный refresh token', 401, 'INVALID_REFRESH');
    }

    revoke_refresh_token($pdo, $config, (int) $row['id']);

    $user = find_user_by_id($pdo, $config, (int) $row['user_id']);
    if (!$user || !(int) $user['is_active'] || !empty($user['deleted_at'])) {
        json_error('Аккаунт недоступен', 403, 'ACCOUNT_DISABLED');
    }

    issue_tokens_and_respond($pdo, $config, $user);
}

function handle_logout(PDO $pdo, array $config, array $body): void
{
    $refreshToken = trim((string) ($body['refreshToken'] ?? ''));
    if ($refreshToken !== '') {
        $hash = hash('sha256', $refreshToken);
        $table = $config['tables']['refresh_tokens'];
        $stmt = $pdo->prepare("UPDATE `{$table}` SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL");
        $stmt->execute([$hash]);
    }
    json_ok(['success' => true]);
}

function handle_me(PDO $pdo, array $config): void
{
    $claims = require_auth($config);
    $user = find_user_by_id($pdo, $config, (int) $claims['sub']);
    if (!$user || !(int) $user['is_active'] || !empty($user['deleted_at'])) {
        json_error('Пользователь не найден', 404);
    }
    json_ok(['success' => true, 'user' => format_user($user)]);
}

function handle_forgot_password(PDO $pdo, array $config, array $body): void
{
    $email = normalize_email($body['email'] ?? '');
    rate_limit_enforce('forgot', $email !== '' ? $email : 'empty', 3, 3600);
    // Всегда 200 — не раскрываем наличие email
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_ok(['success' => true]);
        return;
    }

    $user = find_user_by_email($pdo, $config, $email);
    if ($user) {
        $token = bin2hex(random_bytes(32));
        $hash = hash('sha256', $token);
        $table = $config['tables']['password_reset_tokens'];
        $stmt = $pdo->prepare(
            "INSERT INTO `{$table}` (user_id, token_hash, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW())"
        );
        $stmt->execute([(int) $user['id'], $hash]);

        $resetUrl = rtrim((string) $config['site_url'], '/') . '/reset-password?token=' . urlencode($token);
        if (!empty($config['send_reset_email'])) {
            $subject = 'TravelHub — сброс пароля';
            $message = "Для сброса пароля перейдите по ссылке:\n{$resetUrl}\n\nСсылка действует 1 час.";
            @mail($email, $subject, $message, 'From: noreply@travelhub63.ru');
        } else {
            error_log('[auth-mobile] Password reset issued for user_id=' . (int) $user['id']);
        }
    }

    json_ok(['success' => true]);
}

function handle_reset_password(PDO $pdo, array $config, array $body): void
{
    $token = trim((string) ($body['token'] ?? ''));
    $newPassword = (string) ($body['newPassword'] ?? '');

    if ($token === '' || $newPassword === '') {
        json_error('Укажите token и newPassword', 400);
    }
    rate_limit_enforce('reset-password', substr(hash('sha256', $token), 0, 16), 5, 3600);
    $passwordError = validate_password_strength($newPassword);
    if ($passwordError !== null) {
        json_error($passwordError, 400, 'WEAK_PASSWORD');
    }

    $hash = hash('sha256', $token);
    $table = $config['tables']['password_reset_tokens'];
    $stmt = $pdo->prepare(
        "SELECT * FROM `{$table}` WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1"
    );
    $stmt->execute([$hash]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        json_error('Неверный или просроченный код', 400, 'INVALID_TOKEN');
    }

    $userId = (int) $row['user_id'];
    $cols = $config['columns'];
    $usersTable = $config['tables']['users'];
    $newHash = password_hash($newPassword, PASSWORD_DEFAULT);

    $pdo->prepare(
        sprintf('UPDATE `%s` SET `%s` = ?, `%s` = NOW() WHERE `%s` = ?', $usersTable, $cols['password'], $cols['updated_at'], $cols['id'])
    )->execute([$newHash, $userId]);

    $pdo->prepare("UPDATE `{$table}` SET used_at = NOW() WHERE id = ?")->execute([(int) $row['id']]);

    json_ok(['success' => true]);
}

function handle_update_profile(PDO $pdo, array $config, array $body): void
{
    $claims = require_auth($config);
    $userId = (int) $claims['sub'];
    $cols = $config['columns'];
    $table = $config['tables']['users'];

    $updates = [];
    $params = [];

    if (isset($body['fullName'])) {
        $updates[] = "`{$cols['full_name']}` = ?";
        $params[] = trim((string) $body['fullName']);
    }
    if (isset($body['phone'])) {
        $updates[] = "`{$cols['phone']}` = ?";
        $params[] = trim((string) $body['phone']);
    }
    if (isset($body['email'])) {
        $email = normalize_email($body['email']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_error('Некорректный email', 400);
        }
        $existing = find_user_by_email($pdo, $config, $email);
        if ($existing && (int) $existing['id'] !== $userId) {
            json_error('Email уже используется', 409);
        }
        $updates[] = "`{$cols['email']}` = ?";
        $params[] = $email;
    }
    if (array_key_exists('passport', $body) && isset($cols['passport_json'])) {
        $passportJson = $body['passport'] === null
            ? null
            : json_encode($body['passport'], JSON_UNESCAPED_UNICODE);
        $updates[] = "`{$cols['passport_json']}` = ?";
        $params[] = $passportJson;
    }

    if ($updates === []) {
        json_error('Нет полей для обновления', 400);
    }

    $updates[] = "`{$cols['updated_at']}` = NOW()";
    $params[] = $userId;

    $sql = sprintf('UPDATE `%s` SET %s WHERE `%s` = ?', $table, implode(', ', $updates), $cols['id']);
    $pdo->prepare($sql)->execute($params);

    $user = find_user_by_id($pdo, $config, $userId);
    json_ok(['success' => true, 'user' => format_user($user)]);
}

function handle_delete_account(PDO $pdo, array $config): void
{
    $claims = require_auth($config);
    $userId = (int) $claims['sub'];
    $cols = $config['columns'];
    $table = $config['tables']['users'];

    $sql = sprintf(
        'UPDATE `%s` SET `%s` = 0, `%s` = NOW(), `%s` = NOW() WHERE `%s` = ?',
        $table,
        $cols['is_active'],
        $cols['deleted_at'],
        $cols['updated_at'],
        $cols['id']
    );
    $pdo->prepare($sql)->execute([$userId]);

    json_ok(['success' => true]);
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function issue_tokens_and_respond(PDO $pdo, array $config, array $user): void
{
    $accessTtl = (int) ($config['access_ttl'] ?? 3600);
    $refreshTtl = (int) ($config['refresh_ttl'] ?? 2592000);
    $secret = (string) $config['jwt_secret'];

    $now = time();
    $issuer = jwt_issuer($config);
    $accessToken = jwt_encode([
        'iss' => $issuer,
        'sub' => (string) $user['id'],
        'email' => (string) $user['email'],
        'phone_number' => (string) ($user['phone'] ?? ''),
        'name' => (string) ($user['full_name'] ?? ''),
        'iat' => $now,
        'exp' => $now + $accessTtl,
    ], $secret);

    $refreshToken = bin2hex(random_bytes(32));
    store_refresh_token($pdo, $config, (int) $user['id'], $refreshToken, $refreshTtl);

    json_ok([
        'success' => true,
        'user' => format_user($user),
        'accessToken' => $accessToken,
        'refreshToken' => $refreshToken,
        'expiresIn' => $accessTtl,
    ]);
}

function store_refresh_token(PDO $pdo, array $config, int $userId, string $token, int $ttl): void
{
    $table = $config['tables']['refresh_tokens'];
    $hash = hash('sha256', $token);
    $stmt = $pdo->prepare(
        "INSERT INTO `{$table}` (user_id, token_hash, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), NOW())"
    );
    $stmt->execute([$userId, $hash, $ttl]);
}

function revoke_refresh_token(PDO $pdo, array $config, int $id): void
{
    $table = $config['tables']['refresh_tokens'];
    $pdo->prepare("UPDATE `{$table}` SET revoked_at = NOW() WHERE id = ?")->execute([$id]);
}

function revoke_all_refresh_tokens_for_user(PDO $pdo, array $config, int $userId): void
{
    $table = $config['tables']['refresh_tokens'];
    $pdo->prepare("UPDATE `{$table}` SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL")
        ->execute([$userId]);
}

function require_auth(array $config): array
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
        json_error('Unauthorized: Bearer token required', 401, 'NO_TOKEN');
    }
    $token = trim($m[1]);
    $claims = jwt_decode($token, (string) $config['jwt_secret'], jwt_issuer($config));
    if (!$claims || empty($claims['sub'])) {
        json_error('Invalid or expired auth token', 401, 'INVALID_TOKEN');
    }
    return $claims;
}

// ---------------------------------------------------------------------------
// JWT (HS256, без внешних библиотек)
// ---------------------------------------------------------------------------

function jwt_encode(array $payload, string $secret): string
{
    $header = base64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $body = base64url_encode(json_encode($payload));
    $sig = base64url_encode(hash_hmac('sha256', "{$header}.{$body}", $secret, true));
    return "{$header}.{$body}.{$sig}";
}

function jwt_issuer(array $config): string
{
    $iss = trim((string) ($config['jwt_issuer'] ?? 'travelhub-auth'));
    return $iss !== '' ? $iss : 'travelhub-auth';
}

function jwt_decode(string $token, string $secret, ?string $expectedIssuer = null): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    [$h, $p, $s] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "{$h}.{$p}", $secret, true));
    if (!hash_equals($expected, $s)) {
        return null;
    }
    $payload = json_decode(base64url_decode($p), true);
    if (!is_array($payload)) {
        return null;
    }
    if (isset($payload['exp']) && time() >= (int) $payload['exp']) {
        return null;
    }
    if ($expectedIssuer !== null && $expectedIssuer !== '') {
        $iss = isset($payload['iss']) ? (string) $payload['iss'] : '';
        if ($iss === '' || !hash_equals($expectedIssuer, $iss)) {
            return null;
        }
    }
    return $payload;
}

function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string
{
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return (string) base64_decode(strtr($data, '-_', '+/'));
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Подтягивает настройки БД: auth-mobile.config.php → db_include (конфиг сайта) → env.
 */
function resolve_db_settings(array $config): array
{
    $db = is_array($config['db'] ?? null) ? $config['db'] : [];

    if (!empty($config['db_include'])) {
        $paths = [$config['db_include']];
        if (!is_file($paths[0])) {
            $paths[] = __DIR__ . '/' . ltrim((string) $config['db_include'], '/');
            $paths[] = dirname(__DIR__) . '/' . ltrim((string) $config['db_include'], '/');
        }
        foreach ($paths as $path) {
            if (!is_file($path)) {
                continue;
            }
            $included = include $path;
            if (is_array($included)) {
                if (isset($included['db']) && is_array($included['db'])) {
                    $db = array_merge($db, $included['db']);
                } else {
                    $db = array_merge($db, $included);
                }
            }
            break;
        }
    }

    $constMap = [
        'DB_HOST' => 'host',
        'DB_PORT' => 'port',
        'DB_NAME' => 'name',
        'DB_DATABASE' => 'name',
        'DB_USER' => 'user',
        'DB_USERNAME' => 'user',
        'DB_PASS' => 'pass',
        'DB_PASSWORD' => 'pass',
    ];
    foreach ($constMap as $const => $key) {
        if (defined($const) && empty($db[$key])) {
            $db[$key] = constant($const);
        }
    }

    if (empty($db['host']) && getenv('DB_HOST')) {
        $db['host'] = getenv('DB_HOST');
    }
    if (empty($db['name']) && getenv('DB_NAME')) {
        $db['name'] = getenv('DB_NAME');
    }
    if (empty($db['user']) && getenv('DB_USER')) {
        $db['user'] = getenv('DB_USER');
    }
    if (empty($db['pass']) && getenv('DB_PASSWORD')) {
        $db['pass'] = getenv('DB_PASSWORD');
    }

    if (empty($db['host']) && !empty($db['unix_socket'])) {
        $db['host'] = 'localhost';
    }
    if (empty($db['port'])) {
        $db['port'] = 3306;
    }
    if (empty($db['charset'])) {
        $db['charset'] = 'utf8mb4';
    }

    return $db;
}

function db_connect(array $config): PDO
{
    $db = resolve_db_settings($config);
    if (empty($db['name']) || empty($db['user'])) {
        throw new RuntimeException('Не заданы db.name или db.user в auth-mobile.config.php');
    }

    if (!empty($db['unix_socket'])) {
        $dsn = sprintf(
            'mysql:unix_socket=%s;dbname=%s;charset=%s',
            $db['unix_socket'],
            $db['name'],
            $db['charset']
        );
    } else {
        $host = $db['host'] ?? 'localhost';
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $host,
            (int) $db['port'],
            $db['name'],
            $db['charset']
        );
    }

    return new PDO($dsn, (string) $db['user'], (string) ($db['pass'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

/** bcrypt; legacy md5-хеши автоматически обновляются при успешном входе */
function verify_user_password(PDO $pdo, array $config, string $password, array $user): bool
{
    $cols = $config['columns'];
    $hash = (string) ($user[$cols['password']] ?? '');
    if ($hash === '') {
        return false;
    }

    if (password_get_info($hash)['algo'] !== 0) {
        if (!password_verify($password, $hash)) {
            return false;
        }
        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            upgrade_user_password_hash($pdo, $config, (int) $user['id'], $password);
        }
        return true;
    }

    if (preg_match('/^[a-f0-9]{32}$/i', $hash) && hash_equals(strtolower($hash), md5($password))) {
        upgrade_user_password_hash($pdo, $config, (int) $user['id'], $password);
        return true;
    }

    return false;
}

function upgrade_user_password_hash(PDO $pdo, array $config, int $userId, string $password): void
{
    $cols = $config['columns'];
    $table = $config['tables']['users'];
    $newHash = password_hash($password, PASSWORD_DEFAULT);
    $sql = sprintf(
        'UPDATE `%s` SET `%s` = ?, `%s` = NOW() WHERE `%s` = ?',
        $table,
        $cols['password'],
        $cols['updated_at'],
        $cols['id']
    );
    $pdo->prepare($sql)->execute([$newHash, $userId]);
}

function validate_password_strength(string $password): ?string
{
    if (strlen($password) < 8) {
        return 'Пароль слишком слабый. Минимум 8 символов.';
    }
    if (!preg_match('/\d/', $password)) {
        return 'Пароль должен содержать хотя бы одну цифру.';
    }
    return null;
}

function find_user_by_email(PDO $pdo, array $config, string $email): ?array
{
    $cols = $config['columns'];
    $table = $config['tables']['users'];
    $sql = sprintf(
        'SELECT * FROM `%s` WHERE `%s` = ? LIMIT 1',
        $table,
        $cols['email']
    );
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function find_user_by_id(PDO $pdo, array $config, int $id): ?array
{
    $cols = $config['columns'];
    $table = $config['tables']['users'];
    $sql = sprintf('SELECT * FROM `%s` WHERE `%s` = ? LIMIT 1', $table, $cols['id']);
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function touch_last_login(PDO $pdo, array $config, int $userId): void
{
    $cols = $config['columns'];
    $table = $config['tables']['users'];
    $sql = sprintf('UPDATE `%s` SET `%s` = NOW() WHERE `%s` = ?', $table, $cols['last_login_at'], $cols['id']);
    $pdo->prepare($sql)->execute([$userId]);
}

function format_user(array $row): array
{
    $passport = null;
    if (!empty($row['passport_json'])) {
        $decoded = json_decode((string) $row['passport_json'], true);
        if (is_array($decoded)) {
            $passport = $decoded;
        }
    }
    return [
        'id' => (string) $row['id'],
        'email' => (string) $row['email'],
        'fullName' => (string) ($row['full_name'] ?? ''),
        'phone' => (string) ($row['phone'] ?? ''),
        'isActive' => (bool) ((int) ($row['is_active'] ?? 1)),
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
        'passport' => $passport,
    ];
}

function normalize_email(string $email): string
{
    return strtolower(trim($email));
}

function json_ok(array $data): void
{
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $code = 400, ?string $errorCode = null): void
{
    http_response_code($code);
    $out = ['success' => false, 'error' => $message];
    if ($errorCode) {
        $out['code'] = $errorCode;
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}
