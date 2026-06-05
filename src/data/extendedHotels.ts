/**
 * Расширенные данные об отелях для категорий стран
 * С поддержкой разных валют и автофила для бронирования
 */

export interface ExtendedHotelData {
  id: string;
  slug: string;
  name: string;
  country: string;
  countrySlug: string;
  category: 'romantic' | 'exotic' | 'family' | 'adventure' | 'beach';
  location: string;
  city: string;
  description: string;
  shortDescription: string;
  images: string[];
  rating: number;
  reviews: number;
  priceFrom: {
    USD: number;
    EUR: number;
    RUB: number;
  };
  currency: 'USD' | 'EUR' | 'RUB';
  stars: number;
  amenities: string[];
  highlights: string[];
  bestFor: string[];
  distanceToBeach?: string;
  distanceToAirport?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  website?: string;
  bookingUrl: string;
  popular: boolean;
  featured: boolean;
  whyRecommended: string[];
  familyFriendly?: boolean;
  romanticFeatures?: string[];
  exoticHighlights?: string[];
}

// Отели для романтических направлений
export const ROMANTIC_HOTELS: ExtendedHotelData[] = [
  // Мальдивы
  {
    id: 'maldives-one-atoll',
    slug: 'maldives-one-atoll',
    name: 'One&Only Reethi Rah',
    country: 'Мальдивы',
    countrySlug: 'maldives',
    category: 'romantic',
    location: 'Атолл Баа, Мальдивы',
    city: 'One&Only Reethi Rah',
    description: 'Роскошный курорт на атолле Баа, сертифицированный как биосферный заповедник. Виллы над водой с персональными бассейнами, частный пляж, подводный ресторан и спа-центр мирового класса.',
    shortDescription: 'Виллы над водой в биосферном заповеднике',
    images: [
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800',
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800'
    ],
    rating: 9.8,
    reviews: 1247,
    priceFrom: { USD: 1200, EUR: 1100, RUB: 85000 },
    currency: 'USD',
    stars: 5,
    amenities: ['Wi-Fi', 'SPA', 'Бассейн', 'Ресторан', 'Фитнес', 'Подводный ресторан'],
    highlights: [
      'Виллы над водой с персональными бассейнами',
      'Подводный ресторан',
      'Частный пляж',
      'Биосферный заповедник UNESCO'
    ],
    bestFor: ['Медовый месяц', 'Юбилей', 'Романтический отдых'],
    distanceToBeach: 'Пляж у виллы',
    distanceToAirport: '45 мин на гидросамолете',
    coordinates: { lat: 5.0667, lng: 73.0167 },
    bookingUrl: 'https://travelhub63.ru/frontend/window/maldives-hotels.php?hotel=one-atoll',
    popular: true,
    featured: true,
    whyRecommended: [
      'Персональные бассейны в каждой вилле',
      'Подводный ресторан с морскими видами',
      'Уединение и приватность',
      'Экологичная концепция'
    ],
    romanticFeatures: [
      'Закатные круизы на яхте',
      'Романтические ужины на пляже',
      'Спа для двоих',
      'Шампанское в номере'
    ]
  },
  {
    id: 'maldives-two-atoll',
    slug: 'maldives-two-atoll',
    name: 'Anantara Dhigu',
    country: 'Мальдивы',
    countrySlug: 'maldives',
    category: 'romantic',
    location: 'Атолл Раа, Мальдивы',
    city: 'Anantara Dhigu',
    description: 'Роскошный курорт с современным дизайном и традиционной мальдивской гостеприимностью. Водные виллы, спа-центр с аюрведическими процедурами и рестораны с международной кухней.',
    shortDescription: 'Современный дизайн с традициями Мальдив',
    images: [
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800'
    ],
    rating: 9.5,
    reviews: 892,
    priceFrom: { USD: 850, EUR: 780, RUB: 62000 },
    currency: 'USD',
    stars: 5,
    amenities: ['Wi-Fi', 'SPA', 'Бассейн', 'Ресторан', 'Фитнес', 'Дайвинг центр'],
    highlights: [
      'Водные виллы с террасами',
      'Аюрведический спа-центр',
      'Современный дизайн',
      'Пляжные рестораны'
    ],
    bestFor: ['Романтический отдых', 'Свадебные путешествия'],
    distanceToBeach: 'Пляж у виллы',
    distanceToAirport: '30 мин на лодке',
    coordinates: { lat: 5.1167, lng: 73.0667 },
    bookingUrl: 'https://travelhub63.ru/frontend/window/maldives-hotels.php?hotel=two-atoll',
    popular: true,
    featured: false,
    whyRecommended: [
      'Современный дизайн вилл',
      'Аюрведические процедуры',
      'Отличное соотношение цена/качество',
      'Молодой и стильный курорт'
    ],
    romanticFeatures: [
      'Вечерние прогулки на лодке',
      'Романтические спа-процедуры',
      'Ужины при свечах',
      'Свадебные церемонии'
    ]
  },
  {
    id: 'maldives-three-atoll',
    slug: 'maldives-three-atoll',
    name: 'Sun Siyam Olhuveli',
    country: 'Мальдивы',
    countrySlug: 'maldives',
    category: 'romantic',
    location: 'Атолл Лавиани, Мальдивы',
    city: 'Sun Siyam Olhuveli',
    description: 'Уютный курорт с атмосферой домашнего тепла и романтической обстановкой. Прекрасные водные виллы, семейная атмосфера и персональный подход к каждому гостю.',
    shortDescription: 'Уютный курорт с домашней атмосферой',
    images: [
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800',
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800'
    ],
    rating: 9.2,
    reviews: 654,
    priceFrom: { USD: 650, EUR: 590, RUB: 48000 },
    currency: 'USD',
    stars: 5,
    amenities: ['Wi-Fi', 'SPA', 'Бассейн', 'Ресторан', 'Фитнес', 'Библиотека'],
    highlights: [
      'Домашняя атмосфера',
      'Персональный подход',
      'Уютные водные виллы',
      'Романтическая обстановка'
    ],
    bestFor: ['Спокойный романтический отдых'],
    distanceToBeach: 'Пляж у виллы',
    distanceToAirport: '40 мин на лодке',
    coordinates: { lat: 5.2167, lng: 73.1167 },
    bookingUrl: 'https://travelhub63.ru/frontend/window/maldives-hotels.php?hotel=three-atoll',
    popular: false,
    featured: true,
    whyRecommended: [
      'Домашняя уютная атмосфера',
      'Отличное обслуживание',
      'Спокойная романтическая обстановка',
      'Доступные цены для Мальдив'
    ],
    romanticFeatures: [
      'Романтические прогулки',
      'Ужины на вилле',
      'Массажи для двоих',
      'Приватные вечера'
    ]
  }
];

// Отели для экзотических направлений
export const EXOTIC_HOTELS: ExtendedHotelData[] = [
  // Япония
  {
    id: 'tokyo-imperial',
    slug: 'tokyo-imperial',
    name: 'The Imperial Hotel Tokyo',
    country: 'Япония',
    countrySlug: 'japan',
    category: 'exotic',
    location: 'Токио, Япония',
    city: 'Tokyo',
    description: 'Легендарный отель в центре Токио с видом на Императорский дворец. Современный дизайн, традиционное японское гостеприимство и высочайший уровень сервиса.',
    shortDescription: 'Легендарный отель в центре Токио',
    images: [
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
      'https://images.unsplash.com/photo-1528164344705-47542687000d?w=800',
      'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=800'
    ],
    rating: 9.6,
    reviews: 2156,
    priceFrom: { USD: 450, EUR: 410, RUB: 33000 },
    currency: 'USD',
    stars: 5,
    amenities: ['Wi-Fi', 'SPA', 'Бассейн', 'Ресторан', 'Фитнес', 'Консьерж'],
    highlights: [
      'Вид на Императорский дворец',
      'Традиционное японское гостеприимство',
      'Современный дизайн',
      'Центральное расположение'
    ],
    bestFor: ['Деловые поездки', 'Культурный туризм'],
    distanceToAirport: '1 час на поезде',
    coordinates: { lat: 35.6850, lng: 139.7514 },
    bookingUrl: 'https://travelhub63.ru/frontend/window/japan-hotels.php?hotel=tokyo-imperial',
    popular: true,
    featured: true,
    whyRecommended: [
      'Историческое значение',
      'Центральное расположение',
      'Высочайший уровень сервиса',
      'Традиционная японская архитектура'
    ]
  },
  {
    id: 'kyoto-traditional',
    slug: 'kyoto-traditional',
    name: 'Kyoto Granbell Hotel',
    country: 'Япония',
    countrySlug: 'japan',
    category: 'exotic',
    location: 'Киото, Япония',
    city: 'Kyoto',
    description: 'Отель в традиционном японском стиле с современными удобствами. Расположен рядом с древними храмами и садами Киото.',
    shortDescription: 'Традиционный отель в историческом Киото',
    images: [
      'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=800',
      'https://images.unsplash.com/photo-1528164344705-47542687000d?w=800',
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800'
    ],
    rating: 9.1,
    reviews: 1243,
    priceFrom: { USD: 180, EUR: 165, RUB: 13500 },
    currency: 'USD',
    stars: 4,
    amenities: ['Wi-Fi', 'Онсэн', 'Ресторан', 'Чайная церемония'],
    highlights: [
      'Традиционная архитектура',
      'Близость к храмам',
      'Онсэн (горячие источники)',
      'Чайная церемония'
    ],
    bestFor: ['Культурный туризм', 'Релакс'],
    distanceToAirport: '45 мин на поезде',
    coordinates: { lat: 35.0116, lng: 135.7681 },
    bookingUrl: 'https://travelhub63.ru/frontend/window/japan-hotels.php?hotel=kyoto-traditional',
    popular: true,
    featured: false,
    whyRecommended: [
      'Аутентичная японская атмосфера',
      'Близость к культурным достопримечательностям',
      'Онсэн для релакса',
      'Доступные цены'
    ]
  }
];

// Отели для семейного отдыха
export const FAMILY_HOTELS: ExtendedHotelData[] = [
  // Турция
  {
    id: 'antalya-family-resort',
    slug: 'antalya-family-resort',
    name: 'Club Hotel Sera',
    country: 'Турция',
    countrySlug: 'turkey-family',
    category: 'family',
    location: 'Анталия, Турция',
    city: 'Antalya',
    description: 'Семейный отель с детской анимацией, водными горками и мини-клубом. Все включено, песчаный пляж и разнообразные развлечения для всей семьи.',
    shortDescription: 'Семейный отель с анимацией для детей',
    images: [
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800'
    ],
    rating: 8.9,
    reviews: 2156,
    priceFrom: { USD: 120, EUR: 110, RUB: 8500 },
    currency: 'USD',
    stars: 5,
    amenities: ['Wi-Fi', 'Бассейн', 'Ресторан', 'Мини-клуб', 'Аквапарк', 'Анимация'],
    highlights: [
      'Детская анимация',
      'Водные горки',
      'Мини-клуб для детей',
      'Семейные номера'
    ],
    bestFor: ['Отдых с детьми', 'Семейные каникулы'],
    distanceToBeach: '50 метров',
    distanceToAirport: '25 км',
    coordinates: { lat: 36.8969, lng: 30.7133 },
    bookingUrl: 'https://travelhub63.ru/frontend/window/turkey-hotels.php?hotel=antalya-family',
    popular: true,
    featured: true,
    whyRecommended: [
      'Отличная детская анимация',
      'Безопасный песчаный пляж',
      'Все включено по доступной цене',
      'Семейная атмосфера'
    ],
    familyFriendly: true
  },
  {
    id: 'belek-kids-club',
    slug: 'belek-kids-club',
    name: 'Regnum Carya Golf & Spa',
    country: 'Турция',
    countrySlug: 'turkey-family',
    category: 'family',
    location: 'Белек, Турция',
    city: 'Belek',
    description: 'Роскошный семейный отель с гольф-полями, спа-центром и детским клубом. Идеальное место для семейного отдыха с высоким уровнем сервиса.',
    shortDescription: 'Роскошный семейный отель с гольфом',
    images: [
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
      'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800',
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800'
    ],
    rating: 9.3,
    reviews: 1847,
    priceFrom: { USD: 200, EUR: 185, RUB: 15000 },
    currency: 'USD',
    stars: 5,
    amenities: ['Wi-Fi', 'SPA', 'Бассейн', 'Ресторан', 'Гольф', 'Детский клуб'],
    highlights: [
      'Гольф-поле',
      'SPA-центр',
      'Детский клуб',
      'Роскошное обслуживание'
    ],
    bestFor: ['Премиальный семейный отдых'],
    distanceToBeach: '200 метров',
    distanceToAirport: '35 км',
    coordinates: { lat: 36.8628, lng: 31.0578 },
    bookingUrl: 'https://travelhub63.ru/frontend/window/turkey-hotels.php?hotel=belek-kids-club',
    popular: true,
    featured: false,
    whyRecommended: [
      'Высокий уровень сервиса',
      'Гольф для всей семьи',
      'Отличный детский клуб',
      'Премиальное обслуживание'
    ],
    familyFriendly: true
  }
];

// Все отели по категориям
export const EXTENDED_HOTELS = {
  romantic: ROMANTIC_HOTELS,
  exotic: EXOTIC_HOTELS,
  family: FAMILY_HOTELS
};

// Получить отели по категории
export const getHotelsByCategory = (category: keyof typeof EXTENDED_HOTELS): ExtendedHotelData[] => {
  return EXTENDED_HOTELS[category] || [];
};

// Получить отель по slug
export const getHotelBySlug = (slug: string): ExtendedHotelData | undefined => {
  for (const category of Object.values(EXTENDED_HOTELS)) {
    const hotel = category.find(h => h.slug === slug);
    if (hotel) return hotel;
  }
  return undefined;
};

// Получить популярные отели
export const getPopularHotels = (category?: keyof typeof EXTENDED_HOTELS): ExtendedHotelData[] => {
  const hotels = category ? EXTENDED_HOTELS[category] : Object.values(EXTENDED_HOTELS).flat();
  return hotels.filter(hotel => hotel.popular);
};