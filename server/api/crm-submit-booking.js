/**
 * POST /api/crm/submit-booking
 * Создание обращения в U-ON с сервера (секрет UON_API_KEY не в клиенте).
 * Auth: Firebase ID token ИЛИ JWT из auth-mobile.php (JWT_SECRET / AUTH_MOBILE_JWT_SECRET).
 */
const { buildLeadCreateBody } = require('../crm/submitBookingCore');
const { uonRequest } = require('../sota/uonClient');
const { resolveUserIdFromToken } = require('../lib/resolveAuthUser');

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Bearer token required' });
  }

  const userId = await resolveUserIdFromToken(token);
  if (!userId) {
    return res.status(401).json({ error: 'Invalid or expired auth token' });
  }

  const body = req.body || {};
  const idempotencyKey = body.idempotencyKey;
  const payload = body.payload;
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || !payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Required: idempotencyKey, payload' });
  }

  if (String(payload.userId) !== userId) {
    return res.status(403).json({ error: 'Forbidden: userId mismatch' });
  }

  if (!process.env.UON_API_KEY && !process.env.SOTA_API_KEY) {
    return res.status(503).json({ error: 'CRM backend is not configured (UON_API_KEY)' });
  }

  let requestBody;
  try {
    requestBody = buildLeadCreateBody({ ...payload, idempotencyKey });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Invalid payload' });
  }

  const response = await uonRequest('lead/create.json', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });

  if (!response.success || !response.data) {
    return res.status(502).json({
      success: false,
      error: response.error || 'CRM request failed',
    });
  }

  const data = response.data;
  const id = data.id ?? data.id_system;
  return res.status(200).json({
    success: true,
    data: {
      id: id != null ? String(id) : undefined,
      requestId: id != null ? String(id) : undefined,
      bookingNumber: data.id_internal != null ? String(data.id_internal) : id != null ? String(id) : undefined,
    },
  });
}

module.exports = handler;
