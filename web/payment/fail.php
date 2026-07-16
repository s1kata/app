<?php
declare(strict_types=1);

$orderId = isset($_GET['orderId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$_GET['orderId']) : '';
$returnTo = isset($_GET['returnTo']) ? trim((string)$_GET['returnTo']) : '';
if ($returnTo === '' || !preg_match('#^travelhub://#i', $returnTo)) {
    $returnTo = 'travelhub://booking-fail?bookingId=' . rawurlencode($orderId);
}

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Оплата не завершена</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;background:#f0f4f8;}
    .card{background:#fff;border-radius:16px;padding:32px;max-width:360px;width:100%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08);}
    h1{margin:0 0 12px;font-size:22px;color:#0f172a;}
    p{margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.5;}
    a{display:inline-block;background:#3ba3ff;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600;font-size:16px;}
  </style>
</head>
<body>
  <div class="card">
    <h1>Оплата не завершена</h1>
    <p>Вы можете вернуться в приложение и оплатить снова.</p>
    <a href="<?= htmlspecialchars($returnTo, ENT_QUOTES, 'UTF-8') ?>">Вернуться в приложение</a>
  </div>
</body>
</html>
