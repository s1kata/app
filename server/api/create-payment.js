/**
 * POST /api/create-payment — Init Tinkoff + paymentIntents + payment_processing (Admin SDK).
 *
 * Идемпотентность: заголовок Idempotency-Key (или body.idempotencyKey) — повторный запрос
 * с тем же ключом возвращает тот же paymentUrl/transactionId (в пределах 24ч).
 */
const crypto = require('crypto');
const admin = require('../lib/firebaseAdmin').getAdmin();
const { FieldValue } = require('firebase-admin/firestore');
const { resolveAuthFromRequest } = require('../lib/resolveAuthUser');

const TINKOFF_INIT_URL = 'https://securepay.tinkoff.ru/v2/Init';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function buildTinkoffToken(params, password) {
  const data = { ...params, Password: password };
  const keys = Object.keys(data).sort();
  const concat = keys.map((k) => String(data[k])).join('');
  return crypto.createHash('sha256').update(concat).digest('hex');
}

function getBookingAmountKopecks(booking) {
  const major = booking.totalPrice != null ? Number(booking.totalPrice) : Number(booking.price);
  if (!Number.isFinite(major)) return null;
  return Math.round(major * 100);
}

/** Материализует бронь в Firestore для локальных ID (AsyncStorage), если документа ещё нет. */
async function resolveBookingForPayment(db, orderId, userId, parsedAmount, currency) {
  const bookingRef = db.collection('bookings').doc(orderId);
  const bookingSnap = await bookingRef.get();
  if (bookingSnap.exists) {
    const booking = bookingSnap.data();
    if (booking.userId !== userId) {
      const err = new Error('Forbidden: not your booking');
      err.statusCode = 403;
      throw err;
    }
    return { bookingRef, booking };
  }

  const synthetic = {
    userId,
    totalPrice: parsedAmount,
    currency: String(currency || 'RUB').toUpperCase(),
    paymentStatus: 'pending',
    status: 'pending',
    source: 'app_local',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await bookingRef.set(synthetic, { merge: true });
  return { bookingRef, booking: synthetic };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, orderId, description, currency = 'RUB', userId, idempotencyKey: bodyIdem } = req.body || {};
    const idempotencyKey =
      (req.headers['idempotency-key'] && String(req.headers['idempotency-key']).slice(0, 128)) ||
      (bodyIdem && String(bodyIdem).slice(0, 128)) ||
      '';

    if (!amount || !orderId || !userId) {
      return res.status(400).json({ error: 'Required: amount, orderId, userId' });
    }
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return res.status(400).json({
        error: 'Idempotency-Key header or body idempotencyKey required (min 8 chars)',
      });
    }
    const parsedAmount = Number(amount);
    const normalizedOrderId = String(orderId);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(normalizedOrderId)) {
      return res.status(400).json({ error: 'Invalid orderId format' });
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(String(userId))) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    const auth = await resolveAuthFromRequest(req);
    if (!auth) {
      return res.status(401).json({ error: 'Invalid or expired auth token' });
    }
    if (auth.userId !== String(userId)) {
      return res.status(403).json({ error: 'Forbidden: userId mismatch' });
    }
    const decoded = { uid: auth.userId };

    const db = admin.firestore();

    // Идемпотентность повторного Init (двойной клик / retry)
    const idemId = `${decoded.uid}_${normalizedOrderId}_${idempotencyKey}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 400);
    const idemRef = db.collection('paymentCreateDedup').doc(idemId);
    const idemSnap = await idemRef.get();
    if (idemSnap.exists) {
      const d = idemSnap.data();
      const created = d.createdAt;
      const tsMs =
        created && typeof created.toMillis === 'function'
          ? created.toMillis()
          : typeof created === 'number'
            ? created
            : 0;
      if (tsMs && Date.now() - tsMs < IDEMPOTENCY_TTL_MS && d.paymentUrl && d.transactionId) {
        return res.status(200).json({
          success: true,
          paymentUrl: d.paymentUrl,
          transactionId: String(d.transactionId),
          amount: parsedAmount,
          idempotentReplay: true,
        });
      }
    }

    let bookingRef;
    let booking;
    try {
      const resolved = await resolveBookingForPayment(
        db,
        normalizedOrderId,
        decoded.uid,
        parsedAmount,
        currency,
      );
      bookingRef = resolved.bookingRef;
      booking = resolved.booking;
    } catch (e) {
      if (e.statusCode === 403) {
        return res.status(403).json({ error: e.message });
      }
      throw e;
    }

    const expectedKopecks = getBookingAmountKopecks(booking);
    const requestKopecks = Math.round(parsedAmount * 100);
    if (expectedKopecks == null || expectedKopecks !== requestKopecks) {
      return res.status(400).json({ error: 'Amount does not match booking' });
    }

    const cur = String(booking.currency || 'RUB').toUpperCase();
    if (String(currency).toUpperCase() !== cur) {
      return res.status(400).json({ error: 'Currency does not match booking' });
    }

    const ps = booking.paymentStatus;
    if (ps === 'paid') {
      return res.status(400).json({ error: 'Booking is already paid', code: 'ALREADY_PAID' });
    }
    if (ps === 'cancelled') {
      return res.status(400).json({ error: 'Booking is cancelled' });
    }
    // payment_processing: повторный Init допустим (новый PaymentId), webhook привязывается к providerPaymentId на брони.
    // Защита от двойной оплаты: бронь уже paid → выше; идемпотентность Init → Idempotency-Key.

    const terminalKey = process.env.TINKOFF_TERMINAL_KEY;
    const password = process.env.TINKOFF_PASSWORD;
    const appUrl = process.env.APP_URL || 'https://travelhub63.ru';
    const apiUrl = process.env.API_URL || appUrl;

    if (!terminalKey || !password) {
      return res.status(500).json({ error: 'Tinkoff not configured (TINKOFF_TERMINAL_KEY / TINKOFF_PASSWORD)' });
    }

    const uniqueOrderId = normalizedOrderId + '__ts__' + Date.now();

    const initBody = {
      TerminalKey: terminalKey,
      Amount: requestKopecks,
      OrderId: uniqueOrderId,
      Description: (description || '').slice(0, 140),
      SuccessURL: `${appUrl}/payment/success?orderId=${encodeURIComponent(normalizedOrderId)}`,
      FailURL: `${appUrl}/payment/fail?orderId=${encodeURIComponent(normalizedOrderId)}`,
      NotificationURL: `${apiUrl}/api/payment-webhook`,
    };

    const tokenValue = buildTinkoffToken(initBody, password);
    const requestBody = { ...initBody, Token: tokenValue };

    const tkResponse = await fetch(TINKOFF_INIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await tkResponse.json().catch(() => ({}));

    if (!data.Success || !data.PaymentURL) {
      return res.status(400).json({
        success: false,
        error: data.Message || data.Details || 'Tinkoff Init failed',
      });
    }

    const paymentUrl = data.PaymentURL;
    const transactionId = data.PaymentId || data.PaymentID;

    if (!paymentUrl || !transactionId) {
      return res.status(500).json({ error: 'Tinkoff did not return PaymentURL / PaymentId' });
    }

    const tid = String(transactionId);
    const batch = db.batch();
    batch.set(
      db.collection('paymentIntents').doc(tid),
      {
        bookingId: normalizedOrderId,
        userId: decoded.uid,
        amountKopecks: requestKopecks,
        tinkoffOrderId: uniqueOrderId,
        currency: cur,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    batch.set(
      bookingRef,
      {
        paymentStatus: 'payment_processing',
        payment: {
          provider: 'tinkoff',
          providerPaymentId: tid,
          amountKopecks: requestKopecks,
          tinkoffOrderId: uniqueOrderId,
          currency: cur,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    batch.set(
      db.collection('paymentCreateDedup').doc(idemId),
      {
        paymentUrl,
        transactionId: tid,
        bookingId: normalizedOrderId,
        userId: decoded.uid,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await batch.commit();

    return res.status(200).json({
      success: true,
      paymentUrl,
      transactionId: tid,
      amount: parsedAmount,
    });
  } catch (error) {
    console.error('Payment creation error (Tinkoff):', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create payment',
      message: error?.message,
    });
  }
}

module.exports = handler;
