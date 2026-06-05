/**
 * POST /api/payment-webhook — Tinkoff NotificationURL.
 * Подпись, идемпотентность и обновление брони в ОДНОЙ транзакции (race-safe).
 */
const crypto = require('crypto');
const admin = require('../lib/firebaseAdmin').getAdmin();
const { FieldValue } = require('firebase-admin/firestore');
const { runPostPaymentCrmHooks } = require('../lib/sotaPaymentHooks');

function buildTinkoffToken(params, password) {
  const data = { ...params, Password: password };
  const keys = Object.keys(data).sort();
  const concat = keys.map((k) => String(data[k])).join('');
  return crypto.createHash('sha256').update(concat).digest('hex');
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const password = process.env.TINKOFF_PASSWORD;
  if (!password) {
    console.error('Tinkoff webhook: TINKOFF_PASSWORD is not set');
    return res.status(500).json({ error: 'Server is not configured' });
  }

  let body = {};
  try {
    if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      body = JSON.parse(String(req.body || '{}'));
    }
  } catch (e) {
    console.error('Tinkoff webhook: invalid JSON', e?.message);
    return res.status(200).json({ success: false, error: 'invalid_json' });
  }

  const { OrderId, Success, Status, PaymentId, Token: tokenProvided } = body;

  const { Token: _omitToken, ...withoutToken } = body;
  const expectedToken = buildTinkoffToken(withoutToken, password);

  if (!tokenProvided || tokenProvided !== expectedToken) {
    console.error('Tinkoff webhook: invalid token');
    // 200 — чтобы провайдер не ретраил бесконечно на «плохой» подписи; смотреть логи
    return res.status(200).json({ success: false, error: 'invalid_signature' });
  }

  console.log(
    '[webhook_in]',
    JSON.stringify({
      at: new Date().toISOString(),
      OrderId: body.OrderId,
      PaymentId: body.PaymentId,
      Status: body.Status,
      Success: body.Success,
      Amount: body.Amount,
      ErrorCode: body.ErrorCode,
    }),
  );

  const db = admin.firestore();
  const paymentIdStr = PaymentId != null ? String(PaymentId) : '';
  const statusStr = (Status || '').toUpperCase();

  if (!OrderId || !paymentIdStr) {
    return res.status(200).json({ success: true, ignored: true });
  }

  const dedupId = `${paymentIdStr}_${statusStr}`;
  const dedupRef = db.collection('paymentWebhookDedup').doc(dedupId);
  const bookingId = String(OrderId).split('__ts__')[0] || String(OrderId);
  const bookingRef = db.collection('bookings').doc(bookingId);
  const intentRef = db.collection('paymentIntents').doc(paymentIdStr);

  const confirmed = Success === true && statusStr === 'CONFIRMED';
  const failed =
    statusStr === 'REJECTED' ||
    statusStr === 'CANCELLED' ||
    statusStr === 'REVERSED' ||
    statusStr === 'REFUNDED' ||
    statusStr === 'DEADLINE_EXPIRED' ||
    (Success === false && statusStr !== 'AUTHORIZED' && statusStr !== 'NEW' && statusStr !== 'FORM_SHOWED');

  try {
    let outcome = 'noop';
    let crmPayload = null;

    if (confirmed) {
      await db.runTransaction(async (tx) => {
        const dSnap = await tx.get(dedupRef);
        if (dSnap.exists) {
          outcome = 'duplicate';
          return;
        }

        const bSnap = await tx.get(bookingRef);
        if (!bSnap.exists) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            result: 'ignored',
            note: 'booking_not_found',
          });
          outcome = 'missing_booking';
          return;
        }

        const b = bSnap.data();
        if (b.paymentStatus === 'paid') {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            result: 'duplicate',
            note: 'already_paid',
          });
          outcome = 'already_paid';
          return;
        }

        const iSnap = await tx.get(intentRef);
        if (!iSnap.exists) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            result: 'rejected',
            note: 'intent_missing',
          });
          outcome = 'intent_missing';
          return;
        }
        const intent = iSnap.data();
        if (intent.userId !== b.userId || intent.bookingId !== bookingId) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            result: 'rejected',
            note: 'intent_user_booking_mismatch',
          });
          outcome = 'intent_mismatch';
          return;
        }
        const orderIdStr = String(OrderId);
        if (intent.tinkoffOrderId && String(intent.tinkoffOrderId) !== orderIdStr) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            result: 'rejected',
            note: 'order_id_mismatch',
          });
          outcome = 'order_mismatch';
          return;
        }
        const amountFromBody = body.Amount != null ? Number(body.Amount) : null;
        const expectedKopecks = Number(intent.amountKopecks);
        if (!Number.isFinite(amountFromBody) || !Number.isFinite(expectedKopecks) || amountFromBody !== expectedKopecks) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            result: 'rejected',
            note: 'amount_mismatch',
          });
          outcome = 'amount_mismatch';
          return;
        }

        const pay = b.payment;
        if (pay && pay.providerPaymentId && String(pay.providerPaymentId) !== paymentIdStr) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            result: 'rejected',
            note: 'payment_id_mismatch',
          });
          outcome = 'payment_mismatch';
          return;
        }

        tx.set(
          bookingRef,
          {
            paymentStatus: 'paid',
            status: 'confirmed',
            paidAt: FieldValue.serverTimestamp(),
            transactionId: paymentIdStr,
            payment: {
              ...(b.payment || {}),
              provider: 'tinkoff',
              providerPaymentId: paymentIdStr,
              lastWebhookStatus: statusStr,
              lastWebhookAt: FieldValue.serverTimestamp(),
            },
            syncVersion: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        tx.set(dedupRef, {
          at: FieldValue.serverTimestamp(),
          bookingId,
          result: 'paid',
        });
        outcome = 'paid';
        crmPayload = { ...b, id: bookingId, contactInfo: b.contactInfo };
      });

      if (outcome === 'paid' && crmPayload) {
        await runPostPaymentCrmHooks(crmPayload).catch((e) =>
          console.warn('[webhook] CRM hooks:', e.message),
        );
      }

      return res.status(200).json({ success: true, outcome });
    }

    if (failed) {
      await db.runTransaction(async (tx) => {
        const dSnap = await tx.get(dedupRef);
        if (dSnap.exists) {
          outcome = 'duplicate';
          return;
        }

        const bSnap = await tx.get(bookingRef);
        if (!bSnap.exists) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            note: 'missing_booking',
          });
          outcome = 'missing_booking';
          return;
        }

        const b = bSnap.data();
        if (b.paymentStatus === 'paid') {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            note: 'already_paid_ignore_fail',
          });
          outcome = 'already_paid';
          return;
        }

        const iSnap = await tx.get(intentRef);
        if (!iSnap.exists) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            note: 'intent_missing',
          });
          outcome = 'intent_missing';
          return;
        }
        const intent = iSnap.data();
        if (intent.userId !== b.userId || intent.bookingId !== bookingId) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            note: 'intent_mismatch',
          });
          outcome = 'intent_mismatch';
          return;
        }
        const orderIdStr = String(OrderId);
        if (intent.tinkoffOrderId && String(intent.tinkoffOrderId) !== orderIdStr) {
          tx.set(dedupRef, {
            at: FieldValue.serverTimestamp(),
            bookingId,
            note: 'order_id_mismatch',
          });
          outcome = 'order_mismatch';
          return;
        }

        tx.set(
          bookingRef,
          {
            paymentStatus: 'failed',
            transactionId: paymentIdStr,
            payment: {
              ...(b.payment || {}),
              providerPaymentId: paymentIdStr,
              lastWebhookStatus: statusStr,
              lastWebhookAt: FieldValue.serverTimestamp(),
              failureReason: String(body.ErrorCode || statusStr || 'failed'),
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        tx.set(dedupRef, {
          at: FieldValue.serverTimestamp(),
          bookingId,
          result: 'failed',
        });
        outcome = 'failed';
      });

      return res.status(200).json({ success: true, outcome });
    }

    await dedupRef.set({
      at: FieldValue.serverTimestamp(),
      bookingId,
      status: statusStr,
      note: 'no_terminal_state',
    });
    return res.status(200).json({ success: true, outcome: 'ignored_status', status: statusStr });
  } catch (error) {
    console.error('Tinkoff webhook error:', error);
    // 200 — чтобы Тинькофф не долбил retry при нашей внутренней ошибке (см. логи)
    return res.status(200).json({ success: false, error: 'internal' });
  }
}

module.exports = handler;
