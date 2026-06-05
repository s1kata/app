<?php
/**
 * Скопируйте в auth-mobile.config.php рядом с auth-mobile.php на сервере.
 * НЕ коммитьте auth-mobile.config.php с реальными паролями в git.
 */
return [
    // MySQL сайта (те же credentials, что у основного сайта)
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'travelhub_db',
        'user' => 'db_user',
        'pass' => 'db_password',
        'charset' => 'utf8mb4',
    ],

    // Секрет для JWT (минимум 32 случайных символа)
    'jwt_secret' => 'CHANGE_ME_TO_RANDOM_STRING_AT_LEAST_32_CHARS',

    // Время жизни access token (секунды)
    'access_ttl' => 3600,

    // Время жизни refresh token (секунды) — 30 дней
    'refresh_ttl' => 2592000,

    // Имена таблиц/полей — подстройте под существующую БД сайта
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
        'created_at' => 'created_at',
        'updated_at' => 'updated_at',
        'last_login_at' => 'last_login_at',
        'deleted_at' => 'deleted_at',
        'passport_json' => 'passport_json',
    ],

    // URL сайта для ссылок сброса пароля
    'site_url' => 'https://travelhub63.ru',

    // Отправка email сброса пароля (true — mail(), false — только лог в error_log для dev)
    'send_reset_email' => true,

    // CORS: * для мобильного приложения (нет Origin) — оставьте true
    'allow_cors' => true,
];
