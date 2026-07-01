/**
 * Прокси чтения CRM (U-ON) — несколько GET-эндпоинтов.
 */
const {
  getUserDepartureDocuments,
  getBookingsByClient,
  getClientIdFromEmailPhone,
  getBonusTransactionsByUser,
} = require('../sota/readApi');
const { resolveAuthFromRequest } = require('../lib/resolveAuthUser');

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

function assertEmailPhoneAllowed(decoded, email, phone) {
  if (email && decoded.email && String(email).toLowerCase() !== String(decoded.email).toLowerCase()) {
    return 'Email does not match signed-in user';
  }
  const tokenPhone = decoded.phone_number ? normalizePhone(decoded.phone_number) : '';
  const qPhone = phone ? normalizePhone(phone) : '';
  if (qPhone && tokenPhone && qPhone !== tokenPhone) {
    return 'Phone does not match signed-in user';
  }
  return null;
}

function makeHandler(kind) {
  return async function handler(req, res) {
    const auth = await resolveAuthFromRequest(req);
    if (!auth) {
      return res.status(401).json({ error: 'Unauthorized: Bearer token required' });
    }
    const decoded = {
      email: auth.email,
      phone_number: auth.phone_number,
    };

    if (!process.env.UON_API_KEY && !process.env.SOTA_API_KEY) {
      return res.status(503).json({ error: 'CRM backend is not configured (UON_API_KEY)' });
    }

    const email = req.query.email ? String(req.query.email) : undefined;
    const phone = req.query.phone ? String(req.query.phone) : undefined;

    const err = assertEmailPhoneAllowed(decoded, email, phone);
    if (err) {
      return res.status(403).json({ error: err });
    }

    try {
      if (kind === 'departures') {
        const r = await getUserDepartureDocuments(email, phone);
        if (!r.success) {
          return res.status(502).json({ success: false, error: r.error });
        }
        return res.status(200).json({ success: true, data: r.data });
      }
      if (kind === 'bookings') {
        const r = await getBookingsByClient({ clientEmail: email, clientPhone: phone });
        if (!r.success) {
          return res.status(502).json({ success: false, error: r.error });
        }
        return res.status(200).json({ success: true, data: r.data });
      }
      if (kind === 'bonus') {
        const clientId = await getClientIdFromEmailPhone({
          email: email || undefined,
          phone: phone || undefined,
        });
        if (clientId == null) {
          return res.status(200).json({ success: true, data: { balance: 0, transactions: [] } });
        }
        const r = await getBonusTransactionsByUser(clientId);
        if (!r.success) {
          return res.status(502).json({ success: false, error: r.error });
        }
        const raw = r.data;
        let list = [];
        if (Array.isArray(raw)) list = raw;
        else if (raw && typeof raw === 'object') {
          if (Array.isArray(raw.rows)) list = raw.rows;
          else if (Array.isArray(raw.row)) list = raw.row;
          else if (Array.isArray(raw.data)) list = raw.data;
          else if (Array.isArray(raw.items)) list = raw.items;
        }
        const transactions = (list || []).map((t) => ({
          id: t.id,
          bcard_id: t.bcard_id,
          datetime: t.datetime || '',
          increase: t.increase ?? 0,
          decrease: t.decrease ?? 0,
          amount: t.amount ?? 0,
          amount_till_date: t.amount_till_date,
          reason: t.reason,
          manager_id: t.manager_id,
          request_id: t.request_id,
        }));
        let balance = 0;
        for (const t of transactions) {
          if (t.increase === 1) balance += t.amount ?? 0;
          if (t.decrease === 1) balance -= t.amount ?? 0;
        }
        return res.status(200).json({ success: true, data: { balance, transactions } });
      }
      return res.status(404).json({ error: 'Unknown CRM route' });
    } catch (e) {
      console.error('[crm-read]', e);
      return res.status(500).json({ error: e.message || 'CRM read failed' });
    }
  };
}

module.exports = {
  userDepartureDocuments: makeHandler('departures'),
  clientBookings: makeHandler('bookings'),
  bonusBalance: makeHandler('bonus'),
};
