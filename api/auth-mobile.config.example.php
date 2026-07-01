<?php
/**
 * Пример конфигурации auth-mobile.php — скопируйте в auth-mobile.config.php на сервере.
 * НЕ коммитьте реальный auth-mobile.config.php с секретами.
 */
return [
    'jwt_secret' => 'CHANGE_ME_min_32_random_chars',
    'jwt_issuer' => 'travelhub-auth',
    'site_url' => 'https://travelhub63.ru',
    'health_check_token' => 'CHANGE_ME_health_token',
    'allowed_origins' => [
        'https://travelhub63.ru',
    ],
    'debug' => false,
    'send_reset_email' => true,
    'access_ttl' => 3600,
    'refresh_ttl' => 31536000,
    'uon_api_key' => '', // или getenv на сервере
    'tables' => [
        'users' => 'users',
        'refresh_tokens' => 'refresh_tokens',
        'password_reset_tokens' => 'password_reset_tokens',
    ],
    'columns' => [
        'id' => 'id',
        'email' => 'email',
        'password' => 'password',
        'full_name' => 'full_name',
        'phone' => 'phone',
        'is_active' => 'is_active',
        'deleted_at' => 'deleted_at',
        'created_at' => 'created_at',
        'updated_at' => 'updated_at',
        'last_login_at' => 'last_login_at',
        'passport_json' => 'passport_json',
    ],
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'database_name',
        'user' => 'db_user',
        'pass' => 'db_password',
        'charset' => 'utf8mb4',
    ],
];
