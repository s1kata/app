/**
 * Тело обращения U-ON lead/create — логика синхронизирована с SotaCrmService.sendBookingToCrm.
 */
function normalizePhone(phone) {
  const s = String(phone || '')
    .trim()
    .replace(/\s/g, '');
  if (!s) return '';
  if (/^\+?[1-9]\d{1,14}$/.test(s)) return s.startsWith('+') ? s : `+${s}`;
  if (/^8\d{10}$/.test(s)) return `+7${s.slice(1)}`;
  return s;
}

function toDatetime(s) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (!s || typeof s !== 'string') return now;
  const trimmed = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed} 00:00:00`;
  const ddmmyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} 00:00:00`;
  }
  return now;
}

/**
 * @param {Record<string, unknown>} payload — как в CrmBookingQueuePayload + idempotencyKey
 */
function buildLeadCreateBody(payload) {
  const phone = normalizePhone(payload.contactInfo?.phone || '');
  const email = String(payload.contactInfo?.email || '').trim();
  if (!phone && !email) {
    throw new Error('Для создания обращения нужен телефон или email клиента');
  }

  const nameParts = String(payload.contactInfo?.name || '')
    .trim()
    .split(/\s+/);
  const uName = nameParts[0] || '';
  const uSurname = nameParts.slice(1).join(' ') || '';

  const isHotel = payload.type === 'hotel';
  const nights = Number(payload.nights) || payload.tourSnapshot?.nights || 0;
  const adults = Math.max(0, Number(payload.party?.adults || 0));
  const childrenAges = Array.isArray(payload.party?.childrenAges) ? payload.party.childrenAges : [];
  const childrenCount = childrenAges.length;
  const partyText =
    childrenCount > 0
      ? `${adults} взр., ${childrenCount} дет. (${childrenAges.join(', ')})`
      : `${adults} взр., 0 дет.`;

  const tourOperator = String(payload.tourOperator || payload.tourSnapshot?.operatorName || '').trim();

  const serviceDescription = isHotel
    ? ['Отель:', payload.tourSnapshot?.hotelName, payload.tourSnapshot?.regionName, nights ? `${nights} н.` : undefined]
        .filter(Boolean)
        .join(' ')
    : [payload.tourSnapshot?.hotelName, payload.tourSnapshot?.regionName, nights ? `${nights} н.` : undefined]
        .filter(Boolean)
        .join(', ') || 'Тур';

  const noteLines = [];
  if (payload.departureCity?.trim()) noteLines.push(`Город вылета: ${payload.departureCity.trim()}`);
  if (nights) noteLines.push(`Ночей: ${nights}`);
  noteLines.push(`Состав: ${partyText}`);
  if (tourOperator) noteLines.push(`Туроператор: ${tourOperator}`);
  if (payload.tourSnapshot?.hotelName) noteLines.push(`Отель: ${payload.tourSnapshot.hotelName}`);
  if (payload.tourSnapshot?.countryName) noteLines.push(`Страна: ${payload.tourSnapshot.countryName}`);
  if (payload.tourSnapshot?.regionName) noteLines.push(`Регион: ${payload.tourSnapshot.regionName}`);
  if (payload.specialRequests?.trim()) noteLines.push(`Комментарий: ${payload.specialRequests.trim()}`);
  if (payload.tourSnapshot?.tourPackageUrl) {
    noteLines.push(`Ссылка на тур (Tourvisor): ${payload.tourSnapshot.tourPackageUrl}`);
  }
  const note = noteLines.filter(Boolean).join('\n');

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rDatBegin = toDatetime(payload.startDate);
  const rDatEnd = toDatetime(payload.endDate);

  const body = {
    r_id_internal: payload.idempotencyKey,
    r_dat: now,
    date_from: rDatBegin.slice(0, 10),
    date_to: rDatEnd.slice(0, 10),
    nights_from: nights ? String(nights) : undefined,
    nights_to: nights ? String(nights) : undefined,
    tourist_count: String(adults),
    tourist_child_count: String(childrenCount),
    budget: Math.max(0, Math.round(Number(payload.totalPrice) || 0)),
    requirements_note: note,
    source: isHotel ? 'TravelHub App (Отель)' : 'TravelHub App',
    ...(tourOperator && { r_tour_operator: tourOperator }),
    ...(payload.tourSnapshot?.tourPackageUrl && { r_tour_operator_link: payload.tourSnapshot.tourPackageUrl }),
    u_name: uName,
    u_surname: uSurname,
    u_phone: phone || undefined,
    u_phone_mobile: phone || undefined,
    u_email: email || undefined,
    note: [serviceDescription ? `Подбор: ${serviceDescription}` : undefined, note].filter(Boolean).join('\n'),
  };

  return body;
}

module.exports = { buildLeadCreateBody };
