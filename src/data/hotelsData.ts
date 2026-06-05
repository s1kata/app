/**
 * Данные об отелях Турции для приложения Travel Hub
 */

export interface HotelData {
  id: string;
  slug: string;
  name: string;
  location: string;
  city: 'Antalya' | 'Belek' | 'Kemer' | 'Istanbul' | 'Bodrum' | 'Marmaris';
  description: string;
  shortDescription: string;
  images: string[];
  rating: number;
  reviews: number;
  priceFrom: number;
  currency: string;
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
  bookingUrl: string; // URL на страницу отеля на сайте
  popular: boolean;
  featured: boolean;
}

// База URL для страницы отелей
const HOTELS_PAGE_URL = 'https://travelhub63.ru/frontend/window/turkey-vip-hotels.php';

// Отели Турции
export const HOTELS_LIST: HotelData[] = [
  // Antalya - Лара
  {
    id: '1',
    slug: 'lara-barut-collection',
    name: 'Lara Barut Collection',
    location: 'Лара, Анталия',
    city: 'Antalya',
    description: 'Роскошный отель на побережье в районе Лара. Элегантный дизайн, просторные номера с видом на море, собственный пляж и полный спектр услуг для комфортного отдыха.',
    shortDescription: 'Роскошный отель на побережье',
    images: [
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800'
    ],
    rating: 4.8,
    reviews: 1850,
    priceFrom: 18500,
    currency: 'RUB',
    stars: 5,
    amenities: ['Собственный пляж', 'СПА-центр', 'Бассейны', 'Рестораны', 'Фитнес-центр', 'Консьерж'],
    highlights: [
      'Собственный песчаный пляж',
      'Вид на Средиземное море',
      'Роскошные номера с балконами',
      'Полный пансион включен'
    ],
    bestFor: ['Пары', 'Роскошный отдых', 'Медовый месяц'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '15 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-lara-barut-collection`,
    popular: true,
    featured: true
  },
  {
    id: '2',
    slug: 'nirvana-cosmopolitan',
    name: 'Nirvana Cosmopolitan',
    location: 'Центр, Анталия',
    city: 'Antalya',
    description: 'Современный отель с панорамным видом на море в самом центре Анталии. Ультрасовременный дизайн, rooftop бассейн и все удобства для городского отдыха.',
    shortDescription: 'Современный отель в центре с видом на море',
    images: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
      'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=800',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
      'https://images.unsplash.com/photo-1573052905904-34ad8c27f0cc?w=800'
    ],
    rating: 4.6,
    reviews: 2100,
    priceFrom: 15200,
    currency: 'RUB',
    stars: 5,
    amenities: ['Rooftop бассейн', 'Вид на море', 'СПА', 'Фитнес', 'Бар на крыше', 'Трансфер в центр'],
    highlights: [
      'Панорамный вид на море',
      'Rooftop бассейн с джакузи',
      'Современный дизайн',
      'Бесплатный Wi-Fi'
    ],
    bestFor: ['Пары', 'Бизнес-путешественники', 'Городской отдых'],
    distanceToBeach: '800м до пляжа',
    distanceToAirport: '12 км до аэропорта Анталии',
    coordinates: { lat: 36.8841, lng: 30.7058 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-nirvana-cosmopolitan`,
    popular: true,
    featured: false
  },
  {
    id: '3',
    slug: 'rixos-downtown-antalya',
    name: 'Rixos Downtown Antalya',
    location: 'Исторический центр, Анталия',
    city: 'Antalya',
    description: 'Элегантный отель в историческом центре Анталии. Роскошные номера, спа-центр и близость к достопримечательностям Старого города.',
    shortDescription: 'Элегантный отель в историческом центре',
    images: [
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
      'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=800',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800',
      'https://images.unsplash.com/photo-1615460549969-36fa19521a4f?w=800'
    ],
    rating: 4.7,
    reviews: 1650,
    priceFrom: 16800,
    currency: 'RUB',
    stars: 5,
    amenities: ['СПА-центр', 'Бассейн', 'Рестораны', 'Фитнес', 'Консьерж', 'Трансфер в Старый город'],
    highlights: [
      'Рядом со Старым городом',
      'Роскошные номера',
      'СПА с хаммамом',
      'Завтрак "шведский стол"'
    ],
    bestFor: ['Пары', 'Культурный отдых', 'Экскурсии'],
    distanceToBeach: '2 км до пляжа',
    distanceToAirport: '10 км до аэропорта Анталии',
    coordinates: { lat: 36.8861, lng: 30.7025 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-rixos-downtown-antalya`,
    popular: true,
    featured: false
  },
  {
    id: '4',
    slug: 'titanic-deluxe-lara',
    name: 'Titanic Deluxe Lara',
    location: 'Лара, Анталия',
    city: 'Antalya',
    description: 'Премиальный отель с собственным пляжем в районе Лара. Огромная территория, аквапарк, спа-центр и полный спектр развлечений.',
    shortDescription: 'Премиальный отель с собственным пляжем',
    images: [
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800',
      'https://images.unsplash.com/photo-1587213811864-46e59f6873b1?w=800',
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800',
      'https://images.unsplash.com/photo-1573052905904-34ad8c27f0cc?w=800'
    ],
    rating: 4.5,
    reviews: 2300,
    priceFrom: 14200,
    currency: 'RUB',
    stars: 5,
    amenities: ['Собственный пляж', 'Аквапарк', 'СПА', 'Бассейны', 'Анимация', 'Детский клуб'],
    highlights: [
      'Собственный песчаный пляж',
      'Аквапарк для всей семьи',
      '4 ресторана',
      'Мини-клуб для детей'
    ],
    bestFor: ['Семьи с детьми', 'Молодежь', 'Активный отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '18 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-titanic-deluxe-lara`,
    popular: true,
    featured: false
  },
  {
    id: '5',
    slug: 'mardan-palace',
    name: 'Mardan Palace',
    location: 'Анталия',
    city: 'Antalya',
    description: 'Эксклюзивный люксовый отель с частным пляжем. Роскошные виллы, личный консьерж и высочайший уровень сервиса для взыскательных гостей.',
    shortDescription: 'Эксклюзивный люксовый отель',
    images: [
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800',
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800',
      'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'
    ],
    rating: 4.9,
    reviews: 890,
    priceFrom: 28500,
    currency: 'RUB',
    stars: 5,
    amenities: ['Частный пляж', 'Личный консьерж', 'СПА', 'Бассейны', 'Рестораны', 'Трансфер'],
    highlights: [
      'Частный пляж с лежаками',
      'Роскошные виллы',
      'Личный дворецкий',
      'Эксклюзивный сервис'
    ],
    bestFor: ['VIP-гости', 'Роскошный отдых', 'Свадьбы'],
    distanceToBeach: 'Частный пляж',
    distanceToAirport: '25 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-mardan-palace`,
    popular: true,
    featured: true
  },
  {
    id: '6',
    slug: 'voyage-kundu-hotel',
    name: 'Voyage Kundu Hotel',
    location: 'Кунду, Анталия',
    city: 'Antalya',
    description: 'Современный отель с аквапарком в районе Кунду. Большая территория, разнообразные развлечения и отличное соотношение цены и качества.',
    shortDescription: 'Современный отель с аквапарком',
    images: [
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
      'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=800',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800',
      'https://images.unsplash.com/photo-1615460549969-36fa19521a4f?w=800'
    ],
    rating: 4.4,
    reviews: 1750,
    priceFrom: 12800,
    currency: 'RUB',
    stars: 5,
    amenities: ['Аквапарк', 'Бассейны', 'Анимация', 'СПА', 'Рестораны', 'Детский клуб'],
    highlights: [
      'Большой аквапарк',
      '3 бассейна',
      'Анимационная программа',
      'Мини-диско для детей'
    ],
    bestFor: ['Семьи с детьми', 'Молодежь', 'Бюджетный отдых'],
    distanceToBeach: '1.5 км до пляжа',
    distanceToAirport: '22 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-voyage-kundu-hotel`,
    popular: true,
    featured: false
  },

  // Belek
  {
    id: '7',
    slug: 'cullinan-golf-resort-belek',
    name: 'Cullinan Golf Resort Belek',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Гольф-курорт с полями мирового класса. Роскошные номера, спа-центр, несколько ресторанов и полный спектр услуг для любителей гольфа.',
    shortDescription: 'Гольф-курорт с полями мирового класса',
    images: [
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800',
      'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800',
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'
    ],
    rating: 4.8,
    reviews: 1200,
    priceFrom: 22500,
    currency: 'RUB',
    stars: 5,
    amenities: ['Гольф-поле', 'СПА', 'Бассейны', 'Рестораны', 'Фитнес', 'Конный спорт'],
    highlights: [
      'Поле для гольфа 18 лунок',
      'СПА-центр премиум класса',
      '3 ресторана',
      'Теннисные корты'
    ],
    bestFor: ['Гольфисты', 'Роскошный отдых', 'Спортивный туризм'],
    distanceToBeach: '800м до пляжа',
    distanceToAirport: '35 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-cullinan-golf-resort-belek`,
    popular: true,
    featured: true
  },
  {
    id: '8',
    slug: 'ethno-hotel-belek',
    name: 'Ethno Hotel Belek',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Отель в этническом стиле с традиционной архитектурой. Комфортные номера, бассейны, рестораны и атмосфера, погружающая в культуру региона.',
    shortDescription: 'Отель в этническом стиле',
    images: [
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800',
      'https://images.unsplash.com/photo-1615460549969-36fa19521a4f?w=800',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800'
    ],
    rating: 4.5,
    reviews: 950,
    priceFrom: 15800,
    currency: 'RUB',
    stars: 4,
    amenities: ['Бассейны', 'Рестораны', 'СПА', 'Фитнес', 'Анимация', 'Бар'],
    highlights: [
      'Этническая архитектура',
      'Традиционная турецкая кухня',
      'Бассейн с подогревом',
      'Спокойная атмосфера'
    ],
    bestFor: ['Культурный отдых', 'Пары', 'Спокойный отдых'],
    distanceToBeach: '1 км до пляжа',
    distanceToAirport: '32 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-ethno-hotel-belek`,
    popular: true,
    featured: false
  },
  {
    id: '9',
    slug: 'gloria-serenity-resort',
    name: 'Gloria Serenity Resort',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Премиальный курорт с гольф-полями и спа. Огромная территория, роскошные номера, несколько бассейнов и полный спектр развлечений.',
    shortDescription: 'Премиальный курорт с гольф-полями',
    images: [
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'
    ],
    rating: 4.7,
    reviews: 1800,
    priceFrom: 19500,
    currency: 'RUB',
    stars: 5,
    amenities: ['Гольф', 'СПА', 'Бассейны', 'Рестораны', 'Теннис', 'Конный спорт'],
    highlights: [
      'Гольф-поле 18 лунок',
      'СПА-центр 2000 кв.м',
      '5 ресторанов',
      'Профессиональный теннисный центр'
    ],
    bestFor: ['Гольфисты', 'Роскошный отдых', 'Семьи'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '30 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-gloria-serenity-resort`,
    popular: true,
    featured: true
  },
  {
    id: '10',
    slug: 'kempinski-hotel-the-dome',
    name: 'Kempinski Hotel The Dome',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Люксовый отель сети Kempinski. Роскошные номера, спа-центр мирового уровня, несколько ресторанов и безупречный сервис.',
    shortDescription: 'Люксовый отель сети Kempinski',
    images: [
      'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=800',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
      'https://images.unsplash.com/photo-1573052905904-34ad8c27f0cc?w=800',
      'https://images.unsplash.com/photo-1587213811864-46e59f6873b1?w=800'
    ],
    rating: 4.9,
    reviews: 1100,
    priceFrom: 26500,
    currency: 'RUB',
    stars: 5,
    amenities: ['СПА', 'Бассейны', 'Рестораны', 'Фитнес', 'Консьерж', 'Трансфер'],
    highlights: [
      'СПА Kempinski The Spa',
      '3 ресторана',
      'Частный пляж',
      'Личный консьерж'
    ],
    bestFor: ['Роскошный отдых', 'Бизнес-путешественники', 'VIP-гости'],
    distanceToBeach: 'Частный пляж',
    distanceToAirport: '28 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-kempinski-hotel-the-dome`,
    popular: true,
    featured: true
  },
  {
    id: '11',
    slug: 'maxx-royal-belek-golf-spa',
    name: 'Maxx Royal Belek Golf & SPA',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Премиальный отель с гольф-полями и спа. Современный дизайн, комфортабельные номера и отличное соотношение цены и качества.',
    shortDescription: 'Премиальный отель с гольф-полями',
    images: [
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800',
      'https://images.unsplash.com/photo-1573052905904-34ad8c27f0cc?w=800',
      'https://images.unsplash.com/photo-1587213811864-46e59f6873b1?w=800',
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800'
    ],
    rating: 4.6,
    reviews: 1400,
    priceFrom: 17500,
    currency: 'RUB',
    stars: 5,
    amenities: ['Гольф', 'СПА', 'Бассейны', 'Рестораны', 'Фитнес', 'Анимация'],
    highlights: [
      'Гольф-поле премиум класса',
      'СПА-центр с турецким хаммамом',
      '4 бассейна',
      'Международная кухня'
    ],
    bestFor: ['Гольфисты', 'Семьи', 'Активный отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '35 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-maxx-royal-belek-golf-spa`,
    popular: true,
    featured: false
  },
  {
    id: '12',
    slug: 'regnum-carya-golf-spa',
    name: 'Regnum Carya Golf & SPA',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Эксклюзивный гольф-курорт с полями мирового уровня. Роскошные номера, спа-центр и полный спектр услуг для комфортного отдыха.',
    shortDescription: 'Эксклюзивный гольф-курорт',
    images: [
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800',
      'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800',
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'
    ],
    rating: 4.8,
    reviews: 1350,
    priceFrom: 21200,
    currency: 'RUB',
    stars: 5,
    amenities: ['Гольф', 'СПА', 'Бассейны', 'Рестораны', 'Теннис', 'Фитнес'],
    highlights: [
      'Гольф-поле 18 лунок',
      'СПА с талассотерапией',
      '6 ресторанов',
      'Конный клуб'
    ],
    bestFor: ['Гольфисты', 'Роскошный отдых', 'Семьи'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '32 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-regnum-carya-golf-spa`,
    popular: true,
    featured: true
  },
  {
    id: '13',
    slug: 'regnum-the-crown',
    name: 'Regnum The Crown',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Роскошный отель премиум-класса с огромной территорией, спа-центром и несколькими ресторанами. Идеально для взыскательных гостей.',
    shortDescription: 'Роскошный отель премиум-класса',
    images: [
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800'
    ],
    rating: 4.9,
    reviews: 980,
    priceFrom: 24800,
    currency: 'RUB',
    stars: 5,
    amenities: ['СПА', 'Бассейны', 'Рестораны', 'Фитнес', 'Консьерж', 'Трансфер'],
    highlights: [
      'Роскошные королевские номера',
      'СПА-центр премиум класса',
      '4 ресторана',
      'Личный дворецкий'
    ],
    bestFor: ['VIP-гости', 'Роскошный отдых', 'Свадьбы'],
    distanceToBeach: 'Частный пляж',
    distanceToAirport: '30 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-regnum-the-crown`,
    popular: true,
    featured: true
  },
  {
    id: '14',
    slug: 'rixos-premium-belek',
    name: 'Rixos Premium Belek',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Премиальный курорт сети Rixos с аквапарком. Огромная территория, роскошные номера, спа-центр и полный спектр развлечений.',
    shortDescription: 'Премиальный курорт с аквапарком',
    images: [
      'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=800',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
      'https://images.unsplash.com/photo-1573052905904-34ad8c27f0cc?w=800',
      'https://images.unsplash.com/photo-1587213811864-46e59f6873b1?w=800'
    ],
    rating: 4.7,
    reviews: 2100,
    priceFrom: 18900,
    currency: 'RUB',
    stars: 5,
    amenities: ['Аквапарк', 'СПА', 'Бассейны', 'Рестораны', 'Анимация', 'Детский клуб'],
    highlights: [
      'Аквапарк премиум класса',
      'СПА-центр с хаммамом',
      '6 ресторанов',
      'Мини-клуб для детей'
    ],
    bestFor: ['Семьи с детьми', 'Роскошный отдых', 'Активный отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '35 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-rixos-premium-belek`,
    popular: true,
    featured: true
  },
  {
    id: '15',
    slug: 'titanic-deluxe-golf-belek',
    name: 'Titanic Deluxe Golf Belek',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Люксовый гольф-курорт с полями мирового класса. Роскошные номера, спа-центр и полный спектр услуг для любителей гольфа.',
    shortDescription: 'Люксовый гольф-курорт',
    images: [
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800',
      'https://images.unsplash.com/photo-1573052905904-34ad8c27f0cc?w=800',
      'https://images.unsplash.com/photo-1587213811864-46e59f6873b1?w=800',
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800'
    ],
    rating: 4.6,
    reviews: 1650,
    priceFrom: 17800,
    currency: 'RUB',
    stars: 5,
    amenities: ['Гольф', 'СПА', 'Бассейны', 'Рестораны', 'Фитнес', 'Теннис'],
    highlights: [
      'Гольф-поле 18 лунок',
      'СПА с сауной и хаммамом',
      '4 ресторана',
      'Теннисные корты'
    ],
    bestFor: ['Гольфисты', 'Роскошный отдых', 'Активный отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '33 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-titanic-deluxe-golf-belek`,
    popular: true,
    featured: false
  },
  {
    id: '16',
    slug: 'voyage-belek-golf-spa',
    name: 'Voyage Belek Golf & SPA',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Премиальный курорт с гольф-полями и спа. Современный дизайн, комфортабельные номера и отличное обслуживание.',
    shortDescription: 'Премиальный курорт с гольф-полями',
    images: [
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800',
      'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800',
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'
    ],
    rating: 4.5,
    reviews: 1250,
    priceFrom: 16200,
    currency: 'RUB',
    stars: 5,
    amenities: ['Гольф', 'СПА', 'Бассейны', 'Рестораны', 'Фитнес', 'Анимация'],
    highlights: [
      'Гольф-поле международного уровня',
      'СПА-центр премиум класса',
      '3 бассейна',
      'Международная кухня'
    ],
    bestFor: ['Гольфисты', 'Семьи', 'Роскошный отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '34 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-voyage-belek-golf-spa`,
    popular: true,
    featured: false
  },
  {
    id: '17',
    slug: 'selectum-luxury-resort-belek',
    name: 'Selectum Luxury Resort Belek',
    location: 'Белек, Анталия',
    city: 'Belek',
    description: 'Эксклюзивный курорт с частным пляжем. Роскошные номера, спа-центр и полный спектр услуг для взыскательных гостей.',
    shortDescription: 'Эксклюзивный курорт с частным пляжем',
    images: [
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800'
    ],
    rating: 4.8,
    reviews: 720,
    priceFrom: 22500,
    currency: 'RUB',
    stars: 5,
    amenities: ['Частный пляж', 'СПА', 'Бассейны', 'Рестораны', 'Консьерж', 'Трансфер'],
    highlights: [
      'Частный пляж с лежаками',
      'Эксклюзивные номера',
      'СПА с морской водой',
      'Личный консьерж'
    ],
    bestFor: ['VIP-гости', 'Роскошный отдых', 'Уединенный отдых'],
    distanceToBeach: 'Частный пляж',
    distanceToAirport: '36 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-selectum-luxury-resort-belek`,
    popular: true,
    featured: true
  },

  // Kemer
  {
    id: '18',
    slug: 'maxx-royal-kemer-resort',
    name: 'Maxx Royal Kemer Resort',
    location: 'Кемер, Анталия',
    city: 'Kemer',
    description: 'Роскошный курорт в живописной бухте. Огромная территория, несколько бассейнов, спа-центр и полный спектр развлечений.',
    shortDescription: 'Роскошный курорт в живописной бухте',
    images: [
      'https://images.unsplash.com/photo-1615460549969-36fa19521a4f?w=800',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
      'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=800',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800'
    ],
    rating: 4.6,
    reviews: 2900,
    priceFrom: 15600,
    currency: 'RUB',
    stars: 5,
    amenities: ['Бассейны', 'СПА', 'Аквапарк', 'Рестораны', 'Анимация', 'Пляж'],
    highlights: [
      'Живописная бухта',
      '8 бассейнов',
      'Аквапарк премиум класса',
      'Панорамный вид на море'
    ],
    bestFor: ['Семьи', 'Молодежь', 'Романтический отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '55 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-maxx-royal-kemer-resort`,
    popular: true,
    featured: true
  },
  {
    id: '19',
    slug: 'dobedan-world-palace',
    name: 'Dobedan World Palace',
    location: 'Кемер, Анталия',
    city: 'Kemer',
    description: 'Премиальный отель с аквапарком. Огромная территория, множество бассейнов, спа-центр и полный спектр развлечений для всей семьи.',
    shortDescription: 'Премиальный отель с аквапарком',
    images: [
      'https://images.unsplash.com/photo-1587213811864-46e59f6873b1?w=800',
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800',
      'https://images.unsplash.com/photo-1573052905904-34ad8c27f0cc?w=800',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'
    ],
    rating: 4.5,
    reviews: 3200,
    priceFrom: 14200,
    currency: 'RUB',
    stars: 5,
    amenities: ['Аквапарк', 'Бассейны', 'СПА', 'Рестораны', 'Анимация', 'Детский клуб'],
    highlights: [
      'Огромный аквапарк',
      '7 бассейнов',
      'Мини-клуб для детей',
      'Вечерние развлечения'
    ],
    bestFor: ['Семьи с детьми', 'Молодежь', 'Активный отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '58 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-dobedan-world-palace`,
    popular: true,
    featured: false
  },
  {
    id: '20',
    slug: 'ng-phaselis-bay',
    name: 'NG Phaselis Bay',
    location: 'Бухта Фазелис, Кемер',
    city: 'Kemer',
    description: 'Элегантный отель в бухте Фазелис. Роскошные номера с видом на море, спа-центр и отличное обслуживание в тихой бухте.',
    shortDescription: 'Элегантный отель в бухте Фазелис',
    images: [
      'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=800',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800',
      'https://images.unsplash.com/photo-1615460549969-36fa19521a4f?w=800',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800'
    ],
    rating: 4.7,
    reviews: 1100,
    priceFrom: 16800,
    currency: 'RUB',
    stars: 5,
    amenities: ['СПА', 'Бассейны', 'Рестораны', 'Фитнес', 'Пляж', 'Консьерж'],
    highlights: [
      'Уединенная бухта Фазелис',
      'Вид на Средиземное море',
      'Роскошные номера',
      'СПА с морскими процедурами'
    ],
    bestFor: ['Пары', 'Роскошный отдых', 'Уединенный отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '45 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-ng-phaselis-bay`,
    popular: true,
    featured: true
  },
  {
    id: '21',
    slug: 'nirvana-mediterranean-excellence',
    name: 'Nirvana Mediterranean Excellence',
    location: 'Кемер, Анталия',
    city: 'Kemer',
    description: 'Премиальный курорт с панорамным видом на море. Роскошные номера, спа-центр мирового уровня и полный спектр услуг.',
    shortDescription: 'Премиальный курорт с панорамным видом',
    images: [
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800'
    ],
    rating: 4.8,
    reviews: 950,
    priceFrom: 18900,
    currency: 'RUB',
    stars: 5,
    amenities: ['СПА', 'Бассейны', 'Рестораны', 'Фитнес', 'Консьерж', 'Трансфер'],
    highlights: [
      'Панорамный вид на море',
      'СПА с талассотерапией',
      '5 ресторанов',
      'Частный пляж'
    ],
    bestFor: ['Роскошный отдых', 'Пары', 'Семьи'],
    distanceToBeach: 'Частный пляж',
    distanceToAirport: '50 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-nirvana-mediterranean-excellence`,
    popular: true,
    featured: true
  },
  {
    id: '22',
    slug: 'rixos-premium-tekirova',
    name: 'Rixos Premium Tekirova',
    location: 'Текирова, Кемер',
    city: 'Kemer',
    description: 'Роскошный курорт в Текирова с огромной территорией, спа-центром и несколькими ресторанами. Идеально для семейного отдыха.',
    shortDescription: 'Роскошный курорт в Текирова',
    images: [
      'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=800',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
      'https://images.unsplash.com/photo-1573052905904-34ad8c27f0cc?w=800',
      'https://images.unsplash.com/photo-1587213811864-46e59f6873b1?w=800'
    ],
    rating: 4.6,
    reviews: 1800,
    priceFrom: 17500,
    currency: 'RUB',
    stars: 5,
    amenities: ['СПА', 'Бассейны', 'Рестораны', 'Аквапарк', 'Анимация', 'Пляж'],
    highlights: [
      'Роскошный дизайн',
      'СПА-центр премиум класса',
      '6 ресторанов',
      'Аквапарк для детей'
    ],
    bestFor: ['Семьи', 'Роскошный отдых', 'Активный отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '65 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-rixos-premium-tekirova`,
    popular: true,
    featured: false
  },
  {
    id: '23',
    slug: 'rixos-sungate',
    name: 'Rixos Sungate',
    location: 'Кемер, Анталия',
    city: 'Kemer',
    description: 'Огромный курортный комплекс с собственным пляжем, аквапарком и множеством развлечений. Один из самых больших отелей в регионе.',
    shortDescription: 'Огромный курортный комплекс',
    images: [
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800',
      'https://images.unsplash.com/photo-1573052905904-34ad8c27f0cc?w=800',
      'https://images.unsplash.com/photo-1587213811864-46e59f6873b1?w=800',
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800'
    ],
    rating: 4.5,
    reviews: 4100,
    priceFrom: 15200,
    currency: 'RUB',
    stars: 5,
    amenities: ['Аквапарк', 'Пляж', 'Бассейны', 'Анимация', 'СПА', 'Ночной клуб'],
    highlights: [
      'Территория 400 000 кв.м',
      'Собственный аквапарк',
      '7 ресторанов',
      'Ночные развлечения'
    ],
    bestFor: ['Молодежь', 'Семьи', 'Активный отдых'],
    distanceToBeach: 'Пляж у отеля',
    distanceToAirport: '60 км до аэропорта Анталии',
    coordinates: { lat: 36.8578, lng: 30.7652 },
    bookingUrl: `${HOTELS_PAGE_URL}#hotel-rixos-sungate`,
    popular: true,
    featured: true
  }
];

// Функции для работы с отелями
export const getAllHotels = (): HotelData[] => {
  return HOTELS_LIST;
};

export const getHotelsByCity = (city: string): HotelData[] => {
  return HOTELS_LIST.filter(hotel => hotel.city.toLowerCase() === city.toLowerCase());
};

export const getHotelById = (id: string): HotelData | undefined => {
  return HOTELS_LIST.find(hotel => hotel.id === id);
};

export const getHotelBySlug = (slug: string): HotelData | undefined => {
  return HOTELS_LIST.find(hotel => hotel.slug === slug);
};

export const getPopularHotels = (): HotelData[] => {
  return HOTELS_LIST.filter(hotel => hotel.popular);
};

export const getFeaturedHotels = (): HotelData[] => {
  return HOTELS_LIST.filter(hotel => hotel.featured);
};

export const searchHotels = (query: string): HotelData[] => {
  const lowerQuery = query.toLowerCase();
  return HOTELS_LIST.filter(hotel =>
    hotel.name.toLowerCase().includes(lowerQuery) ||
    hotel.location.toLowerCase().includes(lowerQuery) ||
    hotel.city.toLowerCase().includes(lowerQuery) ||
    hotel.description.toLowerCase().includes(lowerQuery)
  );
};

// Города Турции с отелями
export const TURKEY_CITIES = [
  { name: 'Antalya', slug: 'antalya', count: getHotelsByCity('Antalya').length },
  { name: 'Belek', slug: 'belek', count: getHotelsByCity('Belek').length },
  { name: 'Kemer', slug: 'kemer', count: getHotelsByCity('Kemer').length },
  { name: 'Istanbul', slug: 'istanbul', count: getHotelsByCity('Istanbul').length },
  { name: 'Bodrum', slug: 'bodrum', count: getHotelsByCity('Bodrum').length },
  { name: 'Marmaris', slug: 'marmaris', count: getHotelsByCity('Marmaris').length }
];

// Обновляем счетчики для актуальных городов
Object.assign(TURKEY_CITIES[0], { count: 6 }); // Antalya - 6 отелей
Object.assign(TURKEY_CITIES[1], { count: 11 }); // Belek - 11 отелей
Object.assign(TURKEY_CITIES[2], { count: 6 }); // Kemer - 6 отелей