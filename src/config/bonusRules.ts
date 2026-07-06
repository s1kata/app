/** Правила списания бонусов на туры (зеркало api/lib/bonus-engine.php). */
export const BONUS_RULES = {
  bonusToRub: 1,
  minDiscountPct: 5,
  maxDiscountPct: 30,
  minBonusesToUse: 100,
  sliderStep: 100,
} as const;

export type BonusRulesConfig = typeof BONUS_RULES;

export interface BonusQuote {
  tourPrice: number;
  bonusesToSpend: number;
  discountRub: number;
  payableRub: number;
  maxBonuses: number;
  minBonuses: number;
  availableBalance: number;
  bcId?: number | null;
  rules?: BonusRulesConfig;
}

export interface BonusQuoteResult {
  success: boolean;
  data?: BonusQuote;
  error?: string;
}

/**
 * Локальный расчёт скидки (для UI; сервер валидирует при quote API).
 */
export function computeBonusQuote(
  tourPrice: number,
  bonusesToSpend: number,
  availableBalance: number,
  rules: BonusRulesConfig = BONUS_RULES,
): BonusQuoteResult {
  const price = Math.max(0, Math.floor(tourPrice));
  const spend = Math.max(0, Math.floor(bonusesToSpend));
  const available = Math.max(0, Math.floor(availableBalance));

  if (price <= 0) {
    return { success: false, error: 'Некорректная цена тура' };
  }

  const maxDiscountRub = Math.floor((price * rules.maxDiscountPct) / 100);
  const minDiscountRub = Math.ceil((price * rules.minDiscountPct) / 100);
  const maxBonuses = Math.min(available, maxDiscountRub);
  const minBonuses = Math.min(maxBonuses, Math.max(rules.minBonusesToUse, minDiscountRub));

  if (spend === 0) {
    return {
      success: true,
      data: {
        tourPrice: price,
        bonusesToSpend: 0,
        discountRub: 0,
        payableRub: price,
        maxBonuses,
        minBonuses: maxBonuses > 0 ? minBonuses : 0,
        availableBalance: available,
        rules,
      },
    };
  }

  if (spend > maxBonuses) {
    return { success: false, error: 'Превышен лимит списания бонусов' };
  }
  if (maxBonuses > 0 && spend < minBonuses) {
    return {
      success: false,
      error: `Минимум ${minBonuses} бонусов (от ${rules.minDiscountPct}% стоимости тура)`,
    };
  }

  return {
    success: true,
    data: {
      tourPrice: price,
      bonusesToSpend: spend,
      discountRub: spend,
      payableRub: Math.max(0, price - spend),
      maxBonuses,
      minBonuses: maxBonuses > 0 ? minBonuses : 0,
      availableBalance: available,
      rules,
    },
  };
}

export function clampBonusesStep(value: number, max: number, step: number): number {
  if (max <= 0) return 0;
  const stepped = Math.round(value / step) * step;
  return Math.max(0, Math.min(max, stepped));
}
