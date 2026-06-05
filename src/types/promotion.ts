export type PromotionType = 'hot_tour' | 'discount' | 'flash_sale' | string;

/** Документы коллекции Firestore `promotions` */
export interface Promotion {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  type?: PromotionType;
  /** Относительный путь на сайте или полный https URL */
  link?: string;
  startDate?: string;
  endDate?: string;
  priority?: number;
  active?: boolean;
}
