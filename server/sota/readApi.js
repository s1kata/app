const { uonRequest } = require('./uonClient');

function mapUonRequestToBooking(r) {
  return {
    id: String(r.id ?? r.id_system ?? ''),
    bookingNumber: r.id_internal ?? r.id_system ?? String(r.id ?? ''),
    clientName: [r.client_surname, r.client_name, r.client_sname].filter(Boolean).join(' ') || '—',
    clientPhone: r.client_phone ?? r.client_phone_mobile ?? '',
    clientEmail: r.client_email ?? '',
    tourName: r.services?.[0]?.hotel ?? r.services?.[0]?.description ?? '—',
    departureDate: r.date_begin ?? '',
    returnDate: r.date_end ?? '',
    participants: 0,
    status: r.status ?? '—',
    totalPrice: r.calc_price ?? 0,
    currency: r.services?.[0]?.currency ?? 'RUB',
    documents: [],
    createdAt: r.dat ?? r.created_at ?? '',
    updatedAt: r.dat_updated ?? '',
  };
}

function extractFileUrl(file) {
  return file.url || file.link || file.file_url || file.file_link || file.src || file.path || '';
}

function detectDocumentType(fileName) {
  const lowerName = String(fileName).toLowerCase();
  if (lowerName.includes('ваучер') || lowerName.includes('voucher')) return 'voucher';
  if (lowerName.includes('билет') || lowerName.includes('ticket') || lowerName.includes('авиа') || lowerName.includes('avia'))
    return 'ticket';
  if (lowerName.includes('страхов') || lowerName.includes('insurance')) return 'insurance';
  if (lowerName.includes('виза') || lowerName.includes('visa')) return 'visa';
  if (lowerName.includes('паспорт') || lowerName.includes('passport')) return 'other';
  return 'other';
}

async function getBookingsByClient({ clientEmail, clientPhone }) {
  if (!clientEmail && !clientPhone) {
    return { success: false, error: 'Укажите email или телефон клиента', data: [] };
  }

  let clientId = null;
  if (clientEmail) {
    const emailRes = await uonRequest('user/email.json', {
      method: 'POST',
      body: JSON.stringify({ email: clientEmail }),
    });
    if (emailRes.success && emailRes.data?.id) clientId = emailRes.data.id;
  }
  if (clientId == null && clientPhone) {
    const phone = String(clientPhone).replace(/\D/g, '');
    const phoneRes = await uonRequest(`user/phone/${encodeURIComponent(phone)}.json`, { method: 'GET' });
    if (phoneRes.success && phoneRes.data?.id) clientId = phoneRes.data.id;
  }

  if (clientId == null) {
    return { success: true, data: [] };
  }

  const response = await uonRequest(`request-by-client/${clientId}/1.json`, { method: 'GET' });
  if (!response.success) {
    return { success: false, error: response.error, data: [] };
  }
  const list = Array.isArray(response.data) ? response.data : [];
  return { success: true, data: list.map((item) => mapUonRequestToBooking(item)) };
}

async function getDepartureDocuments(bookingId) {
  const requestResponse = await uonRequest(`request/${bookingId}.json`, { method: 'GET' });
  if (!requestResponse.success || !requestResponse.data) {
    return { success: false, error: requestResponse.error || 'Failed to fetch request data', data: [] };
  }
  const files = requestResponse.data.files || [];
  const documents = files.map((file, index) => ({
    id: String(file.id ?? file.file_id ?? `file_${index}`),
    bookingId,
    documentType: detectDocumentType(file.name || file.file_name || file.filename || ''),
    fileName: file.name || file.file_name || file.filename || `document_${index}`,
    fileUrl: extractFileUrl(file),
    mimeType: file.mime_type || file.type || file.mime || 'application/pdf',
    fileSize: file.size || file.file_size || 0,
    uploadedAt: file.date || file.created_at || file.uploaded_at || new Date().toISOString(),
    description: file.description || file.file_note || file.note || '',
  }));
  return { success: true, data: documents };
}

async function getUserDepartureDocuments(email, phone) {
  const bookingsResponse = await getBookingsByClient({ clientEmail: email, clientPhone: phone });
  if (!bookingsResponse.success || !bookingsResponse.data) {
    return bookingsResponse;
  }
  const result = [];
  for (const booking of bookingsResponse.data) {
    const documentsResponse = await getDepartureDocuments(booking.id);
    if (documentsResponse.success && documentsResponse.data?.length) {
      result.push({ booking, documents: documentsResponse.data });
    }
  }
  return { success: true, data: result };
}

async function getBonusTransactionsByUser(clientId) {
  return uonRequest(`bcard-bonus-by-user/${clientId}.json`, { method: 'GET' });
}

async function getClientIdFromEmailPhone({ email, phone }) {
  if (email) {
    const res = await uonRequest('user/email.json', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    });
    if (res.success && res.data?.id) return res.data.id;
  }
  if (phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    const res = await uonRequest(`user/phone/${encodeURIComponent(digits)}.json`, { method: 'GET' });
    if (res.success && res.data?.id) return res.data.id;
  }
  return null;
}

module.exports = {
  getBookingsByClient,
  getDepartureDocuments,
  getUserDepartureDocuments,
  getBonusTransactionsByUser,
  getClientIdFromEmailPhone,
  mapUonRequestToBooking,
};
