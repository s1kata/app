/**
 * Локальный сервер API платежей Т-Касса для тестирования.
 * Загружает .env из корня проекта и поднимает эндпоинты create-payment, payment-webhook, payment-status.
 *
 * Запуск из корня проекта: npm run server
 * Для теста с телефона в одной сети задай в .env:
 *   PAYMENT_PAGE_URL=http://ТВОЙ_IP:3334
 * и в приложении запросы пойдут на этот сервер.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

require('./lib/firebaseAdmin').getAdmin();

const express = require('express');
const createPayment = require('./api/create-payment');
const paymentWebhook = require('./api/payment-webhook');
const paymentStatus = require('./api/payment-status');
const crmSubmitBooking = require('./api/crm-submit-booking');
const crmRead = require('./api/crm-read');

const app = express();
const PORT = process.env.PAYMENT_SERVER_PORT || 3334;

app.use(express.json({ limit: '256kb' }));

app.post('/api/create-payment', createPayment);
app.post('/api/payment-webhook', paymentWebhook);
app.get('/api/payment-status/:transactionId', paymentStatus);
app.post('/api/crm/submit-booking', crmSubmitBooking);
app.get('/api/crm/user-departure-documents', crmRead.userDepartureDocuments);
app.get('/api/crm/client-bookings', crmRead.clientBookings);
app.get('/api/crm/bonus-balance', crmRead.bonusBalance);

// Страница успешной оплаты: без кнопки «На главную», авто-возврат в приложение через 5 сек
app.get('/payment/success', (req, res) => {
  const orderId = String(req.query.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const returnUrl = 'travelhub://booking-success?bookingId=' + encodeURIComponent(orderId);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Оплата прошла</title>' +
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;background:#f0f4f8;}' +
    '.card{background:#fff;border-radius:16px;padding:32px;max-width:360px;width:100%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08);}' +
    'h1{margin:0 0 12px;font-size:22px;color:#0f172a;}p{margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.5;}' +
    'a{display:inline-block;background:#3ba3ff;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600;font-size:16px;}.countdown{font-size:14px;color:#94a3b8;margin-top:16px;}</style></head><body>' +
    '<div class="card"><h1>✓ Оплата прошла</h1>' +
    '<p>Через <span id="sec">5</span> сек. вы вернётесь в приложение.</p>' +
    '<a href="' + returnUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" id="link">Вернуться в приложение</a>' +
    '<p class="countdown" id="countdown"></p></div>' +
    '<script>var returnUrl=' + JSON.stringify(returnUrl) + ';var sec=5;var el=document.getElementById("sec");' +
    'var t=setInterval(function(){sec--;if(el)el.textContent=sec;if(sec<=0){clearInterval(t);window.location.href=returnUrl;}},1000);</script></body></html>'
  );
});

// Страница ошибки/отмены оплаты (редирект в приложение без кнопки «На главную»)
app.get('/payment/fail', (req, res) => {
  const orderId = String(req.query.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const returnUrl = 'travelhub://booking-fail?bookingId=' + encodeURIComponent(orderId);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Оплата не завершена</title>' +
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;background:#f0f4f8;}' +
    '.card{background:#fff;border-radius:16px;padding:32px;max-width:360px;width:100%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08);}' +
    'h1{margin:0 0 12px;font-size:22px;color:#0f172a;}p{margin:0 0 24px;color:#64748b;font-size:15px;}' +
    'a{display:inline-block;background:#3ba3ff;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600;font-size:16px;}</style></head><body>' +
    '<div class="card"><h1>Оплата не завершена</h1><p>Вы вернётесь в приложение.</p>' +
    '<a href="' + returnUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">Вернуться в приложение</a></div></body></html>'
  );
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Payment API (T-Kassa) http://0.0.0.0:${PORT}`);
  console.log('  POST /api/create-payment');
  console.log('  POST /api/payment-webhook');
  console.log('  GET  /api/payment-status/:transactionId');
  console.log('  POST /api/crm/submit-booking');
  console.log('  GET  /api/crm/user-departure-documents | client-bookings | bonus-balance');
  console.log('  GET  /payment/success (5 сек → возврат в приложение, без кнопки «На главную»)');
  console.log('  GET  /payment/fail');
  if (!process.env.TINKOFF_TERMINAL_KEY || !process.env.TINKOFF_PASSWORD) {
    console.warn('  Warning: TINKOFF_TERMINAL_KEY or TINKOFF_PASSWORD not set in .env');
  }
  if (!process.env.UON_API_KEY && !process.env.SOTA_API_KEY) {
    console.warn('  Warning: UON_API_KEY not set — CRM proxy and post-payment hooks will fail');
  }
});
