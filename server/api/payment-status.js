/**
 * GET /api/payment-status/:transactionId
 * Только Firestore: intent + бронь (источник истины после webhook; без GetState — нельзя опросить чужой PaymentId).
 */
const admin = require('../lib/firebaseAdmin').getAdmin();

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

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

  const bearer = getBearerToken(req);
  if (!bearer) {
    return res.status(401).json({ error: 'Unauthorized: Bearer token required' });
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(bearer, true);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired auth token' });
  }

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
    const bookingSnap = await db.collection('bookings').doc(intent.bookingId).get();
    if (!bookingSnap.exists) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const b = bookingSnap.data();
    const mapped = mapBookingPaymentToStatus(b.paymentStatus);
    return res.status(200).json({
      success: true,
      status: mapped,
      source: 'firestore',
      amount: b.totalPrice != null ? Number(b.totalPrice) : null,
      paidAt: b.paidAt?.toDate ? b.paidAt.toDate().toISOString() : b.paidAt || null,
    });
  } catch (error) {
    console.error('Payment status error:', error);
    return res.status(500).json({ error: 'Failed to get payment status' });
  }
}

module.exports = handler;
