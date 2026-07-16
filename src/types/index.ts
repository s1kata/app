// Main application types
// Tourvisor API types: импортируйте из './tourvisor' (Country, TourHotel, TourSearchParams и т.д.)

export interface Tour {
  id: string;
  searchId?: number;
  title: string;
  description: string;
  price: number;
  currency: string;
  duration: number;
  location: string;
  country: string;
  category: string;
  rating: number;
  reviews: number;
  image: string;
  gallery: string[];
  included: string[];
  itinerary: {
    day: number;
    title: string;
    description: string;
  }[];
  tags: string[];
  available: boolean;
  maxParticipants: number;
  currentParticipants: number;
  hotel?: string;
  hotelStars?: number;
  mealType?: string;
  departureCity?: string;
  tourOperator?: string;
  transferIncluded?: boolean;
  insuranceIncluded?: boolean;
  pricePerPerson?: boolean;
  originalPrice?: number;
  discount?: number;
  hotDeal?: boolean;
  lastMinute?: boolean;
}

export interface Hotel {
  id: string;
  name: string;
  description: string;
  location: string;
  country: string;
  category: string;
  rating: number;
  reviews: number;
  price: number;
  currency: string;
  image: string;
  gallery: string[];
  amenities: string[];
  stars: number;
  mealTypes: string[];
  distanceToBeach?: number;
  distanceToCenter?: number;
  available: boolean;
}

/** Снимок тура при бронировании — для отображения в «Мои бронирования» без запроса API */
export interface TourSnapshot {
  hotelName: string;
  countryName?: string;
  hotelImage?: string;
  regionName?: string;
  subRegionName?: string;
  nights: number;
  currency: string;
  operatorName?: string;
  /** Ссылка на тур-пакет (отправляется в SOTA как r_tour_operator_link) */
  tourPackageUrl?: string;
}

export interface BookingParty {
  adults: number;
  /** Возраст детей (каждый элемент — один ребёнок) */
  childrenAges: number[];
}

export interface Booking {
  id: string;
  userId: string;
  tourId?: string;
  hotelId?: string;
  type: 'tour' | 'hotel';
  status: BookingStatus;
  bookingDate: string;
  /** Город вылета (заполняется пользователем при бронировании) */
  departureCity?: string;
  startDate: string;
  endDate: string;
  /** Количество ночей (дублируем для удобства; также есть в tourSnapshot.nights) */
  nights?: number;
  totalPrice: number;
  currency: string;
  participants: number;
  /** Состав: взрослые + дети с возрастами */
  party?: BookingParty;
  /** Туроператор (для туров обязателен, для отелей может быть указан) */
  tourOperator?: string;
  contactInfo: {
    name: string;
    phone: string;
    email: string;
  };
  specialRequests?: string;
  paymentStatus:
    | 'pending'
    | 'payment_processing'
    | 'paid'
    | 'failed'
    | 'refunded'
    | 'cancelled';
  /** Данные провайдера оплаты (заполняет сервер) */
  payment?: {
    provider?: string;
    providerPaymentId?: string;
    amountKopecks?: number;
    tinkoffOrderId?: string;
    lastWebhookStatus?: string;
    failureReason?: string;
  };
  paidAt?: string;
  /** Tinkoff PaymentId (дублирует payment.providerPaymentId для запросов) */
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
  /** Снимок тура для отображения в списке бронирований */
  tourSnapshot?: TourSnapshot;
  // Данные из SOTA
  sotaBookingId?: string;
  /** Ключ идемпотентности (совпадает с r_id_internal в CRM) */
  idempotencyKey?: string;
  /** Версия записи кэша для разрешения конфликтов (последняя запись выигрывает при merge) */
  syncVersion?: number;
  departureDocuments?: DepartureDocument[];
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

// Типы для документов на вылет из SOTA
export interface DepartureDocument {
  id: string;
  bookingId: string;
  documentType: 'voucher' | 'ticket' | 'insurance' | 'visa' | 'other';
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  description?: string;
}

export interface SotaBooking {
  id: string;
  bookingNumber: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  tourName: string;
  departureDate: string;
  returnDate: string;
  participants: number;
  status: string;
  totalPrice: number;
  currency: string;
  documents: DepartureDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface SotaApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Типы для WebHook событий U-ON.Travel
export type WebHookTypeId = 
  | 1   // Создание обращения
  | 2   // Создание заявки
  | 3   // Создание клиента
  | 4   // Изменение клиента
  | 5   // Удаление клиента
  | 6   // Создание платежа
  | 7   // Изменение платежа
  | 8   // Удаление платежа
  | 9   // Создание услуги в заявке
  | 10  // Изменение услуги в заявке
  | 11  // Удаление услуги из заявки
  | 12  // Создание партнера
  | 13  // Изменение партнера
  | 14  // Удаление партнера
  | 15  // Отправка сообщения в чате
  | 16  // Изменение статуса в обращении
  | 17  // Изменение статуса в заявке
  | 18  // Изменение цены нетто в заявке
  | 19  // Изменение цены клиента в заявке
  | 20  // Прикрепление файла в заявке
  | 21  // Удаление файла из заявки
  | 22  // Добавление туриста в заявке
  | 23  // Удаление туриста из заявки
  | 24  // Начисление баллов клиенту
  | 25  // Прикрепление покупателя в заявке
  | 26  // Открепление покупателя от заявки
  | 27  // Изменение причины отказа в обращении
  | 28  // Прикрепление бонусной карты к туристу
  | 29  // Изменение менеджера в обращении
  | 30  // Изменение менеджера в заявке
  | 31  // Добавление комментария
  | 32  // Уведомление туриста о событиях
  | 33  // Изменение номера брони в заявке
  | 34  // Добавление задачи
  | 35  // Добавление номера брони в заявке
  | 36  // Добавление цены нетто в заявке
  | 37  // Добавление цены клиента в заявке
  | 39  // Подпись документа по смс
  | 40  // Изменение планового платежа на оплаченный
  | 44  // Пропущенный звонок по телефонии
  | 45  // Операция при онлайн-оплате (заморозка)
  | 46  // Операция при онлайн-оплате (списание)
  | 47  // Клик по номеру телефона клиента
  | 48  // Получение письма от туроператора
  | 49  // Создание счета на оплату
  | 50  // Изменение статуса в заявке (по оплате)
  | 51  // Изменение офиса в обращении
  | 52  // Изменение офиса в заявке
  | 53  // Изменение типа обращения
  | 54  // Изменение типа заявки
  | 55  // Удаление обращения
  | 56  // Удаление заявки
  | 57  // Отправка SMS (вручную менеджером)
  | 58  // Отправка E-mail (вручную менеджером)
  | 59  // Изменение туроператора в заявке
  | 60  // Создание менеджера
  | 61  // Изменение менеджера
  | 63  // Отправка ссылки на подпись документа по смс
  | 64  // Добавление отзыва туриста
  | 65  // Изменение отзыва туриста
  | 66  // Удаление отзыва туриста
  | 67  // Изменение статуса менеджера
  | 68  // Удаление прикрепленного файла у туриста/клиента
  | 69  // Создание копии заявки
  | 70  // Добавление прикрепленного файла у клиента/туриста
  | 71  // Ошибка фискализации в заявке
  | 72  // Изменение примечания в обращении
  | 73  // Изменение примечания в заявке
  | 74; // Отправка кода подтверждения на подпись документа по смс

export interface SotaWebHookPayload {
  uon_id: string;
  uon_subdomain: string;
  datetime: string; // YYYY-mm-dd HH:ii:ss
  type_id: WebHookTypeId;
  [key: string]: any; // Дополнительные поля зависят от type_id
}

// WebHook: Прикрепление файла в заявке (type_id = 20)
export interface FileAttachedWebHook extends SotaWebHookPayload {
  type_id: 20;
  r_id: string; // ID заявки
  file_id: string; // ID прикрепленного файла
}

// WebHook: Уведомление туриста о событиях (type_id = 32)
export interface TouristNotificationWebHook extends SotaWebHookPayload {
  type_id: 32;
  notification_id: number; // ID уведомления (44 = Перед вылетом, 45 = По возвращению и т.д.)
  request_id: string; // ID заявки
  client_id: string; // ID туриста
  is_sms?: number; // 1 - да / 2 - нет
  is_mail?: number; // 1 - да / 2 - нет
  text_sms?: string;
  text_email?: string;
}

// WebHook: Создание заявки (type_id = 2)
export interface RequestCreatedWebHook extends SotaWebHookPayload {
  type_id: 2;
  request_id: string; // ID заявки
}

export interface User {
  id: string;
  email: string;
  phone: string;
  name: string;
  password: string;
  createdAt: Date;
}

/** Транзакция бонусов из U-ON (bcard-bonus-by-user / bcard-bonus-by-card) */
export interface BonusTransaction {
  id: number;
  bcard_id: number;
  datetime: string;
  increase: number; // 1 — начисление, 0 — нет
  decrease: number; // 1 — списание, 0 — нет
  amount: number;
  amount_till_date?: string;
  reason?: string;
  manager_id?: number;
  request_id?: number;
}

/** Баланс бонусов (вычисляется по транзакциям или из SOTA) */
export interface BonusBalance {
  balance: number;
  /** Доступно с учётом срока действия (amount_till_date) */
  availableBalance?: number;
  expiringWithin7Days?: number;
  bcId?: number | null;
  transactions: BonusTransaction[];
  rules?: {
    bonusToRub: number;
    minDiscountPct: number;
    maxDiscountPct: number;
    minBonusesToUse: number;
    sliderStep: number;
  };
}
