/**
 * GET /api/payment-status/:transactionId
 * Источник истины: Tinkoff GetState. paid только при CONFIRMED.
 * Firestore обновляется при подтверждении / финальном fail (если ещё не paid).
 */
const admin = require('../lib/firebaseAdmin').getAdmin();
const { FieldValue } = require('firebase-admin/firestore');
const { resolveAuthFromRequest } = require('../lib/resolveAuthUser');
const { getTinkoffPaymentState, mapTinkoffStatusToApi } = require('../lib/tinkoff');

function mapBookingPaymentToStatus(paymentStatus) {
  if (paymentStatus === 'paid') return 'success';
  if (paymentStatus === 'cancelled') return 'cancelled';
  if (paymentStatus === 'failed') return 'failed';
  return 'pending';
}

async function handler(req, res) {
  const transactionId = req.params?.transactionId || req.query?.transactionId;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId required' });
  }
  if (!/^\d{1,32}$/.test(String(transactionId))) {
    return res.status(400).json({ error: 'Invalid transactionId format' });
  }

  const auth = await resolveAuthFromRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Invalid or expired auth token' });
  }
  const decoded = { uid: auth.userId };

  const db = admin.firestore();
  const tid = String(transactionId);

  try {
    const intentSnap = await db.collection('paymentIntents').doc(tid).get();
    if (!intentSnap.exists) {
      return res.status(403).json({ error: 'Unknown or expired payment' });
    }
    const intent = intentSnap.data();
    if (intent.userId !== decoded.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const bookingRef = db.collection('bookings').doc(intent.bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const b = bookingSnap.data();
    const state = await getTinkoffPaymentState(tid);

    if (!state.ok) {
      // Нет ответа банка: success только если Firestore уже paid (webhook раньше).
      // Иначе — pending/failed/cancelled из Firestore, никогда «success на глаз».
      const mapped = mapBookingPaymentToStatus(b.paymentStatus);
      return res.status(200).json({
        success: true,
        status: mapped,
        source: 'firestore_fallback',
        bankError: state.error || 'GetState failed',
        amount: b.totalPrice != null ? Number(b.totalPrice) : null,
        paidAt:
          mapped === 'success'
            ? b.paidAt?.toDate
              ? b.paidAt.toDate().toISOString()
              : b.paidAt || null
            : null,
        bookingId: intent.bookingId,
      });
    }

    const apiStatus = mapTinkoffStatusToApi(state.status);
    let paidAt = null;

    if (apiStatus === 'success') {
      if (b.paymentStatus !== 'paid') {
        await bookingRef.set(
          {
            paymentStatus: 'paid',
            paidAt: FieldValue.serverTimestamp(),
            transactionId: tid,
            payment: {
              ...(b.payment || {}),
              provider: 'tinkoff',
              providerPaymentId: tid,
              lastWebhookStatus: state.status,
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      paidAt = b.paidAt?.toDate
        ? b.paidAt.toDate().toISOString()
        : b.paidAt || new Date().toISOString();
    } else if (apiStatus === 'failed' || apiStatus === 'cancelled') {
      // Банк сказал не оплачено — не оставляем ложный paid.
      if (b.paymentStatus !== apiStatus) {
        await bookingRef.set(
          {
            paymentStatus: apiStatus,
            paidAt: FieldValue.delete(),
            payment: {
              ...(b.payment || {}),
              provider: 'tinkoff',
              providerPaymentId: tid,
              lastWebhookStatus: state.status,
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    } else if (b.paymentStatus === 'paid' && apiStatus === 'pending') {
      // Расхождение: Firestore paid, банк ещё/уже не CONFIRMED → клиенту pending, не success.
      return res.status(200).json({
        success: true,
        status: 'pending',
        source: 'tinkoff_getstate',
        tinkoffStatus: state.status,
        amount: b.totalPrice != null ? Number(b.totalPrice) : null,
        paidAt: null,
        bookingId: intent.bookingId,
        note: 'firestore_paid_but_bank_not_confirmed',
      });
    }

    return res.status(200).json({
      success: true,
      status: apiStatus,
      source: 'tinkoff_getstate',
      tinkoffStatus: state.status,
      amount: b.totalPrice != null ? Number(b.totalPrice) : null,
      paidAt,
      bookingId: intent.bookingId,
    });
  } catch (error) {
    console.error('Payment status error:', error);
    return res.status(500).json({ error: 'Failed to get payment status' });
  }
}

module.exports = handler;
