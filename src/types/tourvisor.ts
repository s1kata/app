// Tourvisor API Types based on OpenAPI specification

// Base entities
export interface Country {
  id: number;
  name: string;
}

export interface Departure {
  id: number;
  name: string;
  nameGenitive: string;
}

export interface Region {
  id: number;
  name: string;
  countryId: number;
}

export interface SubRegion {
  id: number;
  name: string;
  regionId: number;
}

export interface Arrival {
  id: number;
  name: string;
  airportCode: string;
  countryId: number;
}

export interface Currency {
  id: string;
  name: string;
}

export interface CurrencyRate {
  operator: Operator;
  usd: number;
  eur: number;
}

export interface Operator {
  id: number;
  name: string;
  russianName: string;
  fullName: string;
}

/** Допустимые mealId для GET /tours/search (Tourvisor API). */
export const VALID_TOUR_MEAL_IDS = [2, 3, 4, 5, 7, 9] as const;
export type TourMealId = (typeof VALID_TOUR_MEAL_IDS)[number];

export interface Meal {
  id: number;
  name: string;
  russianName: string;
  fullName: string;
  fullRussianName: string;
}

export interface HotelType {
  id: number;
  name: string;
}

export interface HotelGroupService {
  id: number;
  name: string;
  items: HotelService[];
}

export interface HotelService {
  id: number;
  name: string;
}

// Hotel entities
// Документация: https://api.tourvisor.ru/search/docs (hotel → getОтели, getОписание отеля)

/** Ответ GET /hotels: только базовая информация. Фото и цены в списке не возвращаются. */
export interface HotelCommonCompact {
  latitude: number;
  longitude: number;
}

export interface HotelCompact extends HotelCommonCompact {
  id: number;
  name: string;
  category: number;
  rating: number;
  country: Country;
  region: Region;
  subRegion?: SubRegion;
  type: number;
  /** Есть только в результатах поиска туров или в GET /hotels/{id}; в GET /hotels — нет */
  picturelink?: string;
  /** Есть только в GET /hotels/{id} (модуль «Описания отелей»); в GET /hotels — нет */
  images?: string[];
  /** В списке отелей API не возвращает; есть в результатах поиска туров */
  price?: number;
  priceFrom?: number;
  currency?: string;
}

export interface HotelCommon {
  address: string;
  build: string;
  description: string;
  latitude: number;
  longitude: number;
  phone: string;
  place: string;
  repair: string;
  site: string;
  square: string;
}

export interface HotelInfrastructure {
  beach: string;
  territory: string;
}

export interface HotelMeal {
  description: string;
  list: string;
}

export interface HotelServices {
  animation: string;
  available: string;
  child: string;
  free: string;
  inRoom: string;
  servicesPay: string;
  tags: HotelGroupService[];
}

/** Ответ GET /hotels/{hotelId} — полное описание, фотографии, координаты (модуль «Описания отелей», тариф отдельно). */
export interface Hotel {
  id: number;
  name: string;
  category: number;
  rating: number;
  country: Country;
  region: Region;
  subRegion?: SubRegion;
  type: number;
  images: string[];
  infrastructure: HotelInfrastructure;
  meals: HotelMeal;
  services: HotelServices;
  common: HotelCommon;
  price?: number;
  priceFrom?: number;
  currency?: string;
}

// Tour entities
export interface Tour {
  id: string;
  name: string;
  adults: number;
  childs: number;
  currency: string;
  date: string;
  flightNights: number;
  flightPlace: number;
  fuelCharge: number;
  hotelPlace: number;
  isCharter: boolean;
  isPromo: boolean;
  meal: Meal;
  nights: number;
  operator: Operator;
  placement: string;
  price: number;
  roomType: string;
}

export interface TourOutput extends Tour {
  departure: Departure;
  hotel: HotelCompact;
  hotelDescription: string;
  picture: string;
}

export interface TourHotel {
  id: number;
  name: string;
  category: number;
  rating: number;
  country: Country;
  region: Region;
  subRegion?: SubRegion;
  currency: string;
  price: number;
  latitude: number;
  longitude: number;
  picturelink: string;
  hotelDescription: string;
  hotelDescriptionLink: string;
  hasDescription: boolean;
  hasPictures: boolean;
  seaDistance: number;
  tours: Tour[];
}

// Flight entities
export interface FlightAirport {
  id: string;
  name: string;
  shortName: string;
  timeZone: string;
}

export interface FlightAircompany {
  id: string;
  name: string;
  logo: string;
  thumb: string;
}

export interface FlightTimetable {
  date: string;
  time: string;
  port: FlightAirport;
}

export interface FlightDirection {
  departure: FlightTimetable;
  arrival: FlightTimetable;
  company: FlightAircompany;
  number: string;
  plane: string;
  class: string;
  baggage: number;
  carryOn: string;
  fuelCharges: FlightSurcharge[];
  noPlaces: boolean;
  onDemand: boolean;
}

export interface FlightPrice {
  currency: string;
  value: number;
}

export interface FlightSurcharge {
  name: string;
  amount: number;
  currency: string;
}

export interface Flight {
  dateForward: string;
  dateBackward: string;
  forward: FlightDirection[];
  backward: FlightDirection[];
  fuelCharge: FlightPrice;
  price: FlightPrice;
  isDefault: boolean;
}

export interface FlightError {
  code: number;
  reason: string;
}

export interface TourInfoFlags {
  noFlight: boolean;
  noInsurance: boolean;
  noMeal: boolean;
  noTransfer: boolean;
}

export interface TourInfo {
  flags: TourInfoFlags;
  surcharges: FlightSurcharge[];
}

export interface TourFlightsOutput {
  flights: Flight[];
  info: TourInfo;
  error?: FlightError;
}

// Search entities
export interface TourSearchOutput {
  searchId: number;
}

export interface TourSearchContinueOutput {
  requestCount: number;
}

export interface TourSearchOperatorStatus {
  operator: Operator;
  status: string;
  minPrice: number;
}

export interface TourSearchStatus {
  searchId: number;
  status: string;
  progress: number;
  minPrice: number;
  timePassed: number;
  operatorStatus?: TourSearchOperatorStatus[];
}

// Hot tours entities
export interface TourHotHotel {
  id: number;
  name: string;
  category: number;
  rating: number;
  country: Country;
  region: Region;
  subRegion?: SubRegion;
  type: number;
  latitude: number;
  longitude: number;
  picturelink: string;
  hotelDescriptionLink: string;
}

export interface TourHot {
  country: Country;
  departure: Departure;
  hotel: TourHotHotel;
  meal: Meal;
  operator: Operator;
  currency: string;
  date: string;
  nights: number;
  price: number;
  priceOld: number;
  /** Если тур пришёл из результатов поиска */
  searchId?: number;
}

// API Request/Response types
export interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers?: Headers;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Search parameters
export interface TourSearchParams {
  departureId?: number;
  countryId?: number;
  dateFrom: string;
  dateTo: string;
  nightsFrom: number;
  nightsTo: number;
  adults: number;
  childs?: number[];
  meal?: number;
  hotelCategory?: number;
  hotelTypes?: number[];
  hotelIds?: number[];
  hotelServices?: number[];
  hotelRating?: number;
  arrivalId?: number;
  regionIds?: number[];
  subregionIds?: number[];
  operatorIds?: number[];
  priceFrom?: number;
  priceTo?: number;
  currency: string;
  onlyCharter: boolean;
}

// Параметры поиска отелей согласно документации Tourvisor API
// Метод: GET /hotels
// Документация: https://api.tourvisor.ru/search/docs
export interface HotelSearchParams {
  /** Для UI «все страны» может отсутствовать; вызов GET /hotels всегда с конкретным countryId. */
  countryId?: number;
  regionId?: number; // Идентификатор курорта
  category?: number; // Категория (от и выше)
  types?: number[]; // Тип отеля (Array of integers)
  rating?: number; // Рейтинг (от и выше)
  page?: number; // Default: 1 - Страница
  limit?: number; // Default: 20 - Количество элементов на странице
  /**
   * Фильтр в приложении (чипы/модалка). В официальном GET /hotels может не поддерживаться —
   * при необходимости фильтрация на клиенте по данным отеля.
   */
  hotelServices?: number[];
}

export interface HotToursParams {
  departureId: number;
  countryIds?: number[]; // Array of integers - идентификаторы стран
  dateFrom?: string; // Формат: YYYY-MM-DD
  dateTo?: string; // Формат: YYYY-MM-DD
  meal?: number; // Минимальный тип питания
  hotelCategory?: number; // Минимальная категория отеля
  noVisa?: boolean; // Признак получения туров по странам без виз (только для России)
  regionIds?: number[]; // Идентификаторы курортов
  operatorIds?: number[]; // Идентификаторы операторов
  currency: string; // ISO-код валюты (required)
  onlyCharter: boolean; // Признак получения результатов только для чартерных перелётов (required)
  limit: number; // Количество получаемых горящих туров (required, от 1 до 200)
}